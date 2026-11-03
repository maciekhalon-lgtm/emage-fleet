-- ============================================================================
-- Emage FLEET — poziomy spalania aut i podwójna obsada (uruchom po 005_zmiany_danych.sql)
-- ============================================================================

-- ---------- Poziomy spalania (l/100 km) ----------
-- do cons_good = bardzo dobre, do cons_ok = dobre, powyżej = słabe
alter table public.vehicles add column if not exists cons_good numeric(5,2) check (cons_good > 0);
alter table public.vehicles add column if not exists cons_ok   numeric(5,2) check (cons_ok > 0);
alter table public.vehicles drop constraint if exists cons_levels_ok;
alter table public.vehicles add constraint cons_levels_ok check (cons_good is null or cons_ok is null or cons_good < cons_ok);

-- ---------- Podwójna obsada: rezerwacje / dzień pracy ----------
alter table public.bookings add column if not exists co_driver_id        uuid references public.drivers(id) on delete set null;
alter table public.bookings add column if not exists pickup_confirmed_at timestamptz;
alter table public.bookings add column if not exists pickup_confirmed_by uuid;
alter table public.bookings add column if not exists return_confirmed_at timestamptz;
alter table public.bookings add column if not exists return_confirmed_by uuid;
alter table public.bookings add column if not exists dispute_stage       text check (dispute_stage in ('pickup','return'));
alter table public.bookings add column if not exists dispute_note        text;
alter table public.bookings add column if not exists dispute_at          timestamptz;
alter table public.bookings add column if not exists dispute_resolved_at timestamptz;
alter table public.bookings drop constraint if exists co_driver_differs;
alter table public.bookings add constraint co_driver_differs check (co_driver_id is null or co_driver_id <> driver_id);

-- ---------- Podwójna obsada: tankowania do potwierdzenia ----------
alter table public.costs add column if not exists co_driver_id   uuid references public.drivers(id) on delete set null;
alter table public.costs add column if not exists confirm_status text not null default 'none' check (confirm_status in ('none','pending','confirmed','disputed'));
alter table public.costs add column if not exists confirmed_at   timestamptz;
alter table public.costs add column if not exists confirmed_by   uuid;
alter table public.costs add column if not exists dispute_note   text;

-- Czy rezerwacja wciąż „trzyma” auto i kierowców:
-- przejęte i niezdane, albo zdane w obsadzie, ale bez potwierdzenia drugiego kierowcy.
create or replace function public.booking_holds(b public.bookings) returns boolean
language sql immutable as $$
  select b.pickup_km is not null
     and (b.return_km is null or (b.co_driver_id is not null and b.return_confirmed_at is null))
$$;

-- Jedno auto = jedna obsada; kierowca (także drugi w obsadzie) może mieć naraz tylko jedno auto.
create or replace function public.prevent_double_pickup() returns trigger
language plpgsql security definer set search_path = public as $$
declare other text; busy text;
begin
  if public.booking_holds(new) then
    select d.full_name into other
    from public.bookings b left join public.drivers d on d.id = b.driver_id
    where b.vehicle_id = new.vehicle_id and b.id <> new.id and public.booking_holds(b)
    limit 1;
    if found then
      raise exception 'To auto jest już przejęte przez: %. Wybierz inne auto.', coalesce(other, 'innego kierowcę') using errcode = 'P0001';
    end if;
    select d.full_name into busy
    from public.bookings b join public.drivers d on d.id in (new.driver_id, new.co_driver_id)
    where b.id <> new.id and public.booking_holds(b) and d.id in (b.driver_id, b.co_driver_id)
    limit 1;
    if found then
      raise exception '% ma już przejęte inne auto. Najpierw trzeba je zdać.', busy using errcode = 'P0001';
    end if;
  end if;
  return new;
end $$;
drop trigger if exists bookings_one_driver on public.bookings;
create trigger bookings_one_driver before insert or update of pickup_km, return_km, vehicle_id, driver_id, co_driver_id, return_confirmed_at on public.bookings
  for each row execute function public.prevent_double_pickup();

-- ---------- Reguły dostępu: drugi kierowca też działa na swoim dniu pracy ----------
drop policy if exists bookings_driver_update on public.bookings;
create policy bookings_driver_update on public.bookings for update
  using (public.app_role() = 'kierowca' and public.app_driver_id() in (driver_id, co_driver_id))
  with check (public.app_driver_id() in (driver_id, co_driver_id));

drop policy if exists costs_driver_select on public.costs;
create policy costs_driver_select on public.costs for select
  using (public.app_role() = 'kierowca' and (driver_id = public.app_driver_id() or co_driver_id = public.app_driver_id() or created_by = auth.uid()));
drop policy if exists costs_driver_insert on public.costs;
create policy costs_driver_insert on public.costs for insert
  with check (public.app_role() = 'kierowca' and driver_id = public.app_driver_id()
              and category in ('Paliwo','Ładowanie','Myjnia','Opłaty i parkingi')
              and confirm_status in ('none','pending'));
drop policy if exists costs_driver_update on public.costs;
create policy costs_driver_update on public.costs for update
  using (public.app_role() = 'kierowca' and created_by = auth.uid() and confirm_status in ('none','pending'))
  with check (driver_id = public.app_driver_id() and category in ('Paliwo','Ładowanie','Myjnia','Opłaty i parkingi') and confirm_status in ('none','pending'));

-- ---------- Potwierdzenia drugiego kierowcy ----------
-- stage: 'pickup' (potwierdza drugi kierowca) albo 'return' (potwierdza ten, kto nie zdawał)
drop function if exists public.confirm_booking(uuid, text, boolean, text);
create or replace function public.confirm_booking(booking_id uuid, stage text, accept boolean, reason text default null)
returns void language plpgsql security definer set search_path = public as $$
declare b public.bookings; me uuid := public.app_driver_id();
begin
  select * into b from public.bookings where id = booking_id for update;
  if not found or b.co_driver_id is null then raise exception 'To nie jest dzień pracy w podwójnej obsadzie.'; end if;
  if stage = 'pickup' then
    if me is distinct from b.co_driver_id then raise exception 'Przejęcie potwierdza drugi kierowca z obsady.'; end if;
    if b.pickup_confirmed_at is not null then return; end if;
  elsif stage = 'return' then
    if me is null or me not in (b.driver_id, b.co_driver_id) or b.return_by = auth.uid() then raise exception 'Zdanie pojazdu potwierdza drugi kierowca z obsady.'; end if;
    if b.return_km is null then raise exception 'Auto nie zostało jeszcze zdane.'; end if;
    if b.return_confirmed_at is not null then return; end if;
  else raise exception 'Nieznany etap: %', stage;
  end if;
  if accept then
    if stage = 'pickup' then update public.bookings set pickup_confirmed_at = now(), pickup_confirmed_by = auth.uid() where id = booking_id;
    else update public.bookings set return_confirmed_at = now(), return_confirmed_by = auth.uid() where id = booking_id; end if;
  else
    update public.bookings set dispute_stage = stage, dispute_note = left(coalesce(reason, ''), 500), dispute_at = now(), dispute_resolved_at = null where id = booking_id;
  end if;
end $$;

drop function if exists public.confirm_cost(uuid, boolean, text);
create or replace function public.confirm_cost(cost_id uuid, accept boolean, reason text default null)
returns void language plpgsql security definer set search_path = public as $$
declare c public.costs;
begin
  select * into c from public.costs where id = cost_id for update;
  if not found or c.confirm_status <> 'pending' then raise exception 'To tankowanie nie czeka na potwierdzenie.'; end if;
  if public.app_driver_id() is distinct from c.co_driver_id then raise exception 'Tankowanie potwierdza drugi kierowca z obsady.'; end if;
  update public.costs set confirm_status = case when accept then 'confirmed' else 'disputed' end,
    confirmed_at = now(), confirmed_by = auth.uid(), dispute_note = case when accept then null else left(coalesce(reason, ''), 500) end
  where id = cost_id;
end $$;

-- Kierownik floty rozstrzyga spór: potwierdza w imieniu drugiego kierowcy.
create or replace function public.resolve_dispute(kind text, item_id uuid)
returns void language plpgsql security definer set search_path = public as $$
begin
  if not public.is_fleet() then raise exception 'Spory rozstrzyga kierownik floty.'; end if;
  if kind = 'cost' then
    update public.costs set confirm_status = 'confirmed', confirmed_at = now(), confirmed_by = auth.uid() where id = item_id;
  elsif kind = 'booking' then
    update public.bookings set dispute_resolved_at = now(),
      pickup_confirmed_at = case when dispute_stage = 'pickup' then coalesce(pickup_confirmed_at, now()) else pickup_confirmed_at end,
      pickup_confirmed_by = case when dispute_stage = 'pickup' then coalesce(pickup_confirmed_by, auth.uid()) else pickup_confirmed_by end,
      return_confirmed_at = case when dispute_stage = 'return' then coalesce(return_confirmed_at, now()) else return_confirmed_at end,
      return_confirmed_by = case when dispute_stage = 'return' then coalesce(return_confirmed_by, auth.uid()) else return_confirmed_by end
    where id = item_id;
  else raise exception 'Nieznany rodzaj: %', kind;
  end if;
end $$;
grant execute on function public.confirm_booking(uuid, text, boolean, text), public.confirm_cost(uuid, boolean, text), public.resolve_dispute(text, uuid) to authenticated;

-- ---------- Spalanie dla kierowców: tylko potwierdzone tankowania ----------
create or replace function public.fuel_fills()
returns table (id uuid, vehicle_id uuid, date date, category text, odometer int, liters numeric, full_tank boolean, driver_ref text)
language sql stable security definer set search_path = public as $$
  select c.id, c.vehicle_id, c.date, c.category, c.odometer, c.liters, c.full_tank,
         case when c.driver_id = public.app_driver_id() then c.driver_id::text
              when c.driver_id is null then null
              else 'inny-' || left(md5(c.driver_id::text), 8) end
  from public.costs c
  where public.is_active() and c.category in ('Paliwo','Ładowanie') and c.odometer is not null and c.liters is not null
    and c.confirm_status in ('none','confirmed')
$$;
