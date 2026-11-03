-- ============================================================================
-- Emage FLEET — progi spalania aut i podwójna obsada (uruchom po 005_zmiany_danych.sql)
-- ============================================================================

-- ---------- progi spalania (l/100 km) ----------
-- do cons_good_max = bardzo dobre, do cons_ok_max = dobre, powyżej = słabe
alter table public.vehicles add column if not exists cons_good_max numeric(5,2) check (cons_good_max > 0);
alter table public.vehicles add column if not exists cons_ok_max   numeric(5,2) check (cons_ok_max > 0);
alter table public.vehicles drop constraint if exists cons_levels_ok;
alter table public.vehicles add constraint cons_levels_ok
  check (cons_good_max is null or cons_ok_max is null or cons_good_max < cons_ok_max);

-- ---------- podwójna obsada ----------
-- Rezerwacja / dzień pracy: drugi kierowca i stan potwierdzeń
alter table public.bookings add column if not exists co_driver_id     uuid references public.drivers(id) on delete set null;
alter table public.bookings add column if not exists co_pickup_status text check (co_pickup_status in ('pending','confirmed','disputed'));
alter table public.bookings add column if not exists co_return_status text check (co_return_status in ('pending','confirmed','disputed'));
alter table public.bookings add column if not exists return_confirmer uuid references public.drivers(id) on delete set null;
alter table public.bookings add column if not exists co_note          text;
create index if not exists bookings_co_driver_idx on public.bookings (co_driver_id);

-- Tankowanie: kto musi potwierdzić (drugi członek obsady) i stan potwierdzenia
alter table public.costs add column if not exists co_driver_id uuid references public.drivers(id) on delete set null;
alter table public.costs add column if not exists co_status    text check (co_status in ('pending','confirmed','disputed'));
alter table public.costs add column if not exists co_note      text;
create index if not exists costs_co_driver_idx on public.costs (co_driver_id);

-- Statusy potwierdzeń ustawia wyłącznie baza: automatycznie przy zapisie albo funkcjami poniżej.
create or replace function public.crew_booking_guard() returns trigger
language plpgsql security definer set search_path = public as $$
declare
  via_rpc boolean := coalesce(current_setting('app.crew_rpc', true), '') = 'on';
  actor_drv uuid;
begin
  if new.co_driver_id is not null and new.co_driver_id = new.driver_id then
    raise exception 'Drugi kierowca musi być inną osobą.' using errcode = 'P0001';
  end if;
  if not via_rpc and not public.is_staff() then
    if tg_op = 'INSERT' then
      new.co_pickup_status := null; new.co_return_status := null; new.return_confirmer := null; new.co_note := null;
    else
      new.co_pickup_status := old.co_pickup_status; new.co_return_status := old.co_return_status;
      new.return_confirmer := old.return_confirmer; new.co_note := old.co_note;
    end if;
  end if;
  if new.co_driver_id is null then
    new.co_pickup_status := null; new.co_return_status := null; new.return_confirmer := null;
    return new;
  end if;
  -- przejęcie w obsadzie: drugi kierowca potwierdza
  if new.pickup_km is not null and (tg_op = 'INSERT' or old.pickup_km is null or old.co_driver_id is distinct from new.co_driver_id) then
    new.co_pickup_status := 'pending';
  end if;
  -- zdanie w obsadzie: potwierdza ten, kto nie zdawał
  if new.return_km is not null and (tg_op = 'INSERT' or old.return_km is null) then
    select driver_id into actor_drv from public.profiles where id = auth.uid();
    new.return_confirmer := case when actor_drv = new.co_driver_id then new.driver_id else new.co_driver_id end;
    new.co_return_status := 'pending';
  end if;
  if new.return_km is null then new.co_return_status := null; new.return_confirmer := null; end if;
  return new;
end $$;

create or replace function public.crew_cost_guard() returns trigger
language plpgsql security definer set search_path = public as $$
declare via_rpc boolean := coalesce(current_setting('app.crew_rpc', true), '') = 'on';
begin
  if new.co_driver_id is not null and new.co_driver_id = new.driver_id then
    raise exception 'Tankowanie potwierdza drugi kierowca z obsady, nie ten sam.' using errcode = 'P0001';
  end if;
  if not via_rpc then
    if tg_op = 'INSERT' then
      if not public.is_staff() or new.co_status is null then
        new.co_status := case when new.co_driver_id is not null then 'pending' end; new.co_note := null;
      end if;
    elsif not public.is_staff() then
      if new.co_driver_id is distinct from old.co_driver_id or new.amount is distinct from old.amount
         or new.liters is distinct from old.liters or new.odometer is distinct from old.odometer or new.full_tank is distinct from old.full_tank then
        -- kierowca zmienił dane tankowania: drugi kierowca musi potwierdzić je ponownie
        new.co_status := case when new.co_driver_id is not null then 'pending' end; new.co_note := null;
      else
        new.co_status := old.co_status; new.co_note := old.co_note;
      end if;
    end if;  -- poprawki kierowników nie cofają potwierdzeń
  end if;
  if new.co_driver_id is null then new.co_status := null; end if;
  return new;
end $$;

drop trigger if exists bookings_crew_guard on public.bookings;
create trigger bookings_crew_guard before insert or update on public.bookings
  for each row execute function public.crew_booking_guard();
drop trigger if exists costs_crew_guard on public.costs;
create trigger costs_crew_guard before insert or update on public.costs
  for each row execute function public.crew_cost_guard();

-- Jedno auto = jedna obsada; kierowca (także jako drugi) nie może mieć dwóch aut naraz.
-- Auto zdane w obsadzie, ale niepotwierdzone, nadal jest zajęte.
create or replace function public.prevent_double_pickup() returns trigger
language plpgsql security definer set search_path = public as $$
declare other text;
begin
  if new.pickup_km is not null and (new.return_km is null or new.co_return_status in ('pending','disputed')) then
    select coalesce(d.full_name, 'innego kierowcę') into other
    from public.bookings b left join public.drivers d on d.id = b.driver_id
    where b.vehicle_id = new.vehicle_id and b.id <> new.id and b.pickup_km is not null
      and (b.return_km is null or b.co_return_status in ('pending','disputed'))
    limit 1;
    if found then
      raise exception 'To auto jest już przejęte przez: %. Wybierz inne auto.', other using errcode = 'P0001';
    end if;
    select coalesce(d.full_name, 'ten kierowca') into other
    from public.bookings b join public.drivers d on d.id in (new.driver_id, new.co_driver_id)
    where b.id <> new.id and b.pickup_km is not null
      and (b.return_km is null or b.co_return_status in ('pending','disputed'))
      and d.id in (b.driver_id, b.co_driver_id)
    limit 1;
    if found then
      raise exception '% ma już inne auto. Najpierw trzeba je zdać.', other using errcode = 'P0001';
    end if;
  end if;
  return new;
end $$;
drop trigger if exists bookings_one_driver on public.bookings;
create trigger bookings_one_driver before insert or update of pickup_km, return_km, vehicle_id, driver_id, co_driver_id, co_return_status on public.bookings
  for each row execute function public.prevent_double_pickup();

-- Drugi kierowca może zdawać auto i widzieć tankowania obsady.
drop policy if exists bookings_driver_update on public.bookings;
create policy bookings_driver_update on public.bookings for update
  using (public.app_role() = 'kierowca' and (driver_id = public.app_driver_id() or co_driver_id = public.app_driver_id()))
  with check (driver_id = public.app_driver_id() or co_driver_id = public.app_driver_id());
drop policy if exists costs_driver_select on public.costs;
create policy costs_driver_select on public.costs for select
  using (public.app_role() = 'kierowca' and (driver_id = public.app_driver_id() or created_by = auth.uid() or co_driver_id = public.app_driver_id()));

-- Potwierdzenie przez drugiego kierowcę: kind = 'pickup' | 'return' | 'cost'
create or replace function public.crew_confirm(kind text, item_id uuid, ok boolean, note_text text default null)
returns void language plpgsql security definer set search_path = public as $$
declare d uuid := public.app_driver_id(); st text := case when ok then 'confirmed' else 'disputed' end;
begin
  if d is null then raise exception 'Konto nie jest powiązane z kierowcą.'; end if;
  if not ok and coalesce(trim(note_text), '') = '' then raise exception 'Napisz, z czym się nie zgadzasz.'; end if;
  perform set_config('app.crew_rpc', 'on', true);
  if kind = 'pickup' then
    update public.bookings set co_pickup_status = st, co_note = nullif(trim(note_text), '')
      where id = item_id and co_driver_id = d and co_pickup_status = 'pending';
  elsif kind = 'return' then
    update public.bookings set co_return_status = st, co_note = nullif(trim(note_text), '')
      where id = item_id and return_confirmer = d and co_return_status = 'pending';
  elsif kind = 'cost' then
    update public.costs set co_status = st, co_note = nullif(trim(note_text), '')
      where id = item_id and co_driver_id = d and co_status = 'pending';
  else raise exception 'Nieznany rodzaj potwierdzenia.';
  end if;
  if not found then raise exception 'To potwierdzenie zostało już rozpatrzone albo nie jest do Ciebie.'; end if;
end $$;

-- Rozstrzygnięcie sporu przez kierownika floty (zatwierdza wpis; ewentualne poprawki robi wcześniej w edycji).
create or replace function public.crew_resolve(kind text, item_id uuid)
returns void language plpgsql security definer set search_path = public as $$
begin
  if not public.is_fleet() then raise exception 'Spory rozstrzyga kierownik floty.'; end if;
  perform set_config('app.crew_rpc', 'on', true);
  if kind = 'pickup' then update public.bookings set co_pickup_status = 'confirmed' where id = item_id;
  elsif kind = 'return' then update public.bookings set co_return_status = 'confirmed' where id = item_id;
  elsif kind = 'cost' then update public.costs set co_status = 'confirmed' where id = item_id;
  end if;
end $$;
grant execute on function public.crew_confirm(text, uuid, boolean, text), public.crew_resolve(text, uuid) to authenticated;

-- Spalanie kierowcy: tankowania niepotwierdzone przez obsadę nie wchodzą do statystyk.
create or replace function public.fuel_fills()
returns table (id uuid, vehicle_id uuid, date date, category text, odometer int, liters numeric, full_tank boolean, driver_ref text)
language sql stable security definer set search_path = public as $$
  select c.id, c.vehicle_id, c.date, c.category, c.odometer, c.liters, c.full_tank,
         case when c.driver_id = public.app_driver_id() then c.driver_id::text
              when c.driver_id is null then null
              else 'inny-' || left(md5(c.driver_id::text), 8) end
  from public.costs c
  where public.is_active() and c.category in ('Paliwo','Ładowanie') and c.odometer is not null and c.liters is not null
    and (c.co_status is null or c.co_status = 'confirmed')
$$;
