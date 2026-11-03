-- ============================================================================
-- Emage FLEET — przekazanie auta innemu kierowcy, historia zmian obsady,
-- aktywność kierowcy, badania psychologiczne, numer polisy (uruchom po 006_obsada_i_ranking.sql)
-- ============================================================================

-- ---------- Nowe pola ----------
alter table public.drivers  add column if not exists active       boolean not null default true;
alter table public.drivers  add column if not exists psych_expiry date;
alter table public.vehicles add column if not exists policy_no    text;

-- ---------- Historia zmian obsady (przekazania i zdania przez kierownika) ----------
create table if not exists public.crew_changes (
  id                uuid primary key default gen_random_uuid(),
  at                timestamptz not null default now(),
  kind              text not null check (kind in ('przekazanie','zdanie')),
  vehicle_id        uuid references public.vehicles(id) on delete set null,
  booking_id        uuid references public.bookings(id) on delete set null,
  new_booking_id    uuid references public.bookings(id) on delete set null,
  from_driver_id    uuid references public.drivers(id) on delete set null,
  from_co_driver_id uuid references public.drivers(id) on delete set null,
  to_driver_id      uuid references public.drivers(id) on delete set null,
  km                int,
  reason            text,
  actor             uuid default auth.uid()
);
create index if not exists crew_changes_at_idx on public.crew_changes (at desc);
alter table public.crew_changes enable row level security;
drop policy if exists crew_changes_select on public.crew_changes;
create policy crew_changes_select on public.crew_changes for select using (public.is_fleet());
-- zapisy tylko przez funkcje bazy poniżej (brak reguł insert/update/delete)

-- ---------- Nieaktywny kierowca nie może przejąć auta ----------
create or replace function public.block_inactive_pickup() returns trigger
language plpgsql security definer set search_path = public as $$
declare who text;
begin
  if new.pickup_km is not null and (tg_op = 'INSERT' or old.pickup_km is null or new.co_driver_id is distinct from old.co_driver_id) then
    select full_name into who from public.drivers where id in (new.driver_id, new.co_driver_id) and not active limit 1;
    if found then
      raise exception 'Kierowca % jest oznaczony jako nieaktywny – nie może przejąć auta.', who using errcode = 'P0001';
    end if;
  end if;
  return new;
end $$;
drop trigger if exists bookings_inactive_driver on public.bookings;
create trigger bookings_inactive_driver before insert or update of pickup_km, co_driver_id on public.bookings
  for each row execute function public.block_inactive_pickup();

-- ---------- Przekazanie auta innemu kierowcy (tylko kierownik floty) ----------
-- Zamyka bieżący dzień pracy (zdanie przy podanym przebiegu, bez czekania na drugiego kierowcę)
-- i tworzy przydział dla nowego kierowcy – ten przyjmuje auto u siebie z checklistą i przebiegiem.
create or replace function public.transfer_vehicle(booking_id uuid, new_driver uuid, odometer int, reason text)
returns uuid language plpgsql security definer set search_path = public as $$
declare b public.bookings; d public.drivers; nid uuid;
begin
  if not public.is_fleet() then raise exception 'Auto może przekazać tylko kierownik floty.' using errcode = 'P0001'; end if;
  if coalesce(btrim(reason), '') = '' then raise exception 'Podaj powód przekazania.' using errcode = 'P0001'; end if;
  select * into b from public.bookings where id = booking_id for update;
  if not found or b.pickup_km is null or b.return_km is not null then
    raise exception 'To auto nie jest teraz w trasie – nie ma czego przekazać.' using errcode = 'P0001';
  end if;
  select * into d from public.drivers where id = new_driver;
  if not found then raise exception 'Nie ma takiego kierowcy.' using errcode = 'P0001'; end if;
  if not d.active then raise exception 'Kierowca % jest nieaktywny.', d.full_name using errcode = 'P0001'; end if;
  if new_driver = b.driver_id and b.co_driver_id is null then raise exception 'To auto ma już ten kierowca.' using errcode = 'P0001'; end if;
  if exists (select 1 from public.bookings x where x.id <> b.id and public.booking_holds(x) and new_driver in (x.driver_id, x.co_driver_id)) then
    raise exception '% ma już przejęte inne auto. Najpierw trzeba je zdać.', d.full_name using errcode = 'P0001';
  end if;
  if odometer is null or odometer < b.pickup_km then
    raise exception 'Stan licznika nie może być niższy niż przy przejęciu (% km).', b.pickup_km using errcode = 'P0001';
  end if;

  perform set_config('app.crew_rpc', 'on', true);
  perform set_config('app.transfer', 'on', true);
  update public.bookings set
      return_at = current_date, return_km = odometer, return_by = auth.uid(),
      return_note = left('Przekazane kierowcy ' || d.full_name || ': ' || btrim(reason), 500),
      return_confirmed_at = case when co_driver_id is not null then now() end,
      return_confirmed_by = case when co_driver_id is not null then auth.uid() end
    where id = b.id;
  insert into public.bookings (vehicle_id, driver_id, date_from, date_to, purpose, created_by)
    values (b.vehicle_id, new_driver, current_date, greatest(b.date_to, current_date), b.purpose, auth.uid())
    returning id into nid;
  insert into public.crew_changes (kind, vehicle_id, booking_id, new_booking_id, from_driver_id, from_co_driver_id, to_driver_id, km, reason)
    values ('przekazanie', b.vehicle_id, b.id, nid, b.driver_id, b.co_driver_id, new_driver, odometer, left(btrim(reason), 500));
  perform set_config('app.transfer', 'off', true);
  return nid;
end $$;
grant execute on function public.transfer_vehicle(uuid, uuid, int, text) to authenticated;

-- ---------- Zdanie auta przez kierownika za kierowcę trafia do historii obsady ----------
create or replace function public.log_forced_return() returns trigger
language plpgsql security definer set search_path = public as $$
begin
  if old.return_km is null and new.return_km is not null
     and coalesce(current_setting('app.transfer', true), '') <> 'on'
     and coalesce(public.app_role(), '') in ('floty','serwisu') then
    insert into public.crew_changes (kind, vehicle_id, booking_id, from_driver_id, from_co_driver_id, km, reason)
      values ('zdanie', new.vehicle_id, new.id, new.driver_id, new.co_driver_id, new.return_km, nullif(left(coalesce(new.return_note, ''), 500), ''));
  end if;
  return new;
end $$;
drop trigger if exists bookings_forced_return on public.bookings;
create trigger bookings_forced_return after update of return_km on public.bookings
  for each row execute function public.log_forced_return();

-- ---------- Odświeżanie na żywo ----------
do $$ begin
  alter publication supabase_realtime add table public.crew_changes;
exception when duplicate_object then null; end $$;
