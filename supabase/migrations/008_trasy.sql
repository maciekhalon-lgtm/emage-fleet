-- ============================================================================
-- Emage FLEET — trasy (uruchom po 007_przekazanie_i_kierowcy.sql)
-- Trasę przypisuje kierownik w rezerwacji / przydziale. Tankowania dostają trasę automatycznie.
-- ============================================================================

create table if not exists public.routes (
  id         uuid primary key default gen_random_uuid(),
  code       text not null,
  name       text not null,
  tacho      boolean not null default false,   -- wymaga tachografu (tylko informacja)
  loading    boolean not null default false,   -- trasa załadunkowa
  active     boolean not null default true,
  note       text,
  created_by uuid default auth.uid(),
  created_at timestamptz not null default now(),
  updated_by uuid,
  updated_at timestamptz not null default now()
);
create unique index if not exists routes_code_uq on public.routes (upper(btrim(code)));
grant select, insert, update, delete on public.routes to authenticated;
alter table public.routes enable row level security;
drop policy if exists routes_select on public.routes;
create policy routes_select on public.routes for select using (public.is_active());
drop policy if exists routes_write on public.routes;
create policy routes_write on public.routes for all using (public.is_fleet()) with check (public.is_fleet());
drop trigger if exists routes_touch on public.routes;
create trigger routes_touch before update on public.routes for each row execute function public.touch_updated();
drop trigger if exists routes_log on public.routes;
create trigger routes_log after insert or update or delete on public.routes for each row execute function public.log_change();

alter table public.bookings add column if not exists route_id uuid references public.routes(id) on delete set null;
alter table public.costs    add column if not exists route_id uuid references public.routes(id) on delete set null;
create index if not exists bookings_route_idx on public.bookings (route_id);
create index if not exists costs_route_idx on public.costs (route_id);

-- Trasę w rezerwacji ustawia tylko kierownik (kierowca jej nie zmieni).
create or replace function public.route_guard() returns trigger
language plpgsql security definer set search_path = public as $$
begin
  if coalesce(current_setting('app.crew_rpc', true), '') = 'on' or coalesce(public.is_staff(), false) then return new; end if;
  if tg_op = 'INSERT' then new.route_id := null; else new.route_id := old.route_id; end if;
  return new;
end $$;
drop trigger if exists bookings_route_guard on public.bookings;
create trigger bookings_route_guard before insert or update on public.bookings
  for each row execute function public.route_guard();

-- Trasa auta w danym dniu: z dnia pracy (przejęte do zdania), a gdy go nie ma – z rezerwacji.
create or replace function public.route_on(veh uuid, d date) returns uuid
language sql stable security definer set search_path = public as $$
  select route_id from public.bookings
  where vehicle_id = veh and route_id is not null
    and ((pickup_at is not null and pickup_at <= d and (return_at is null or return_at >= d))
         or (pickup_at is null and date_from <= d and date_to >= d))
  order by (pickup_at is not null) desc, coalesce(pickup_at, date_from) desc
  limit 1
$$;

-- Tankowania i inne koszty dostają trasę automatycznie.
create or replace function public.cost_route() returns trigger
language plpgsql security definer set search_path = public as $$
begin
  if coalesce(current_setting('app.route_sync', true), '') = 'on' then return new; end if;
  if tg_op = 'INSERT' or new.vehicle_id is distinct from old.vehicle_id or new.date is distinct from old.date then
    new.route_id := public.route_on(new.vehicle_id, new.date);
  else
    new.route_id := old.route_id;
  end if;
  return new;
end $$;
drop trigger if exists costs_route on public.costs;
create trigger costs_route before insert or update on public.costs
  for each row execute function public.cost_route();

-- Gdy kierownik zmieni trasę w rezerwacji, koszty z tych dni dostają nową trasę.
create or replace function public.booking_route_sync() returns trigger
language plpgsql security definer set search_path = public as $$
begin
  if new.route_id is distinct from old.route_id then
    perform set_config('app.route_sync', 'on', true);
    update public.costs set route_id = new.route_id
    where vehicle_id = new.vehicle_id
      and date between coalesce(new.pickup_at, new.date_from) and coalesce(new.return_at, greatest(new.date_to, current_date));
    perform set_config('app.route_sync', 'off', true);
  end if;
  return null;
end $$;
drop trigger if exists bookings_route_sync on public.bookings;
create trigger bookings_route_sync after update of route_id on public.bookings
  for each row execute function public.booking_route_sync();

-- Przekazanie auta: nowy kierowca jedzie tę samą trasę.
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
  insert into public.bookings (vehicle_id, driver_id, date_from, date_to, purpose, route_id, created_by)
    values (b.vehicle_id, new_driver, current_date, greatest(b.date_to, current_date), b.purpose, b.route_id, auth.uid())
    returning id into nid;
  insert into public.crew_changes (kind, vehicle_id, booking_id, new_booking_id, from_driver_id, from_co_driver_id, to_driver_id, km, reason)
    values ('przekazanie', b.vehicle_id, b.id, nid, b.driver_id, b.co_driver_id, new_driver, odometer, left(btrim(reason), 500));
  perform set_config('app.transfer', 'off', true);
  return nid;
end $$;

do $$ begin
  alter publication supabase_realtime add table public.routes;
exception when duplicate_object then null; end $$;
