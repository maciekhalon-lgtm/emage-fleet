-- ============================================================================
-- Emage FLEET — kontrola liczników (uruchom po 035)
-- 1. Godzina przejęcia i zdania auta (pickup_ts / return_ts) – ustawia baza w chwili wpisania licznika,
--    żeby porównać licznik kierowcy z GPS dokładnie z tej godziny.
-- 2. odo_gps: stan licznika z lokalizatora GPS w chwili zdarzenia (tankowanie z karty, tankowanie w aplikacji,
--    przejęcie, zdanie). Zapisuje tylko funkcja „powiadomienia” (klucz serwisowy). Czytają kierownicy.
-- ============================================================================
alter table public.bookings add column if not exists pickup_ts timestamptz;
alter table public.bookings add column if not exists return_ts timestamptz;

create or replace function public.bookings_odo_ts() returns trigger
language plpgsql as $$
begin
  if new.pickup_km is not null and (tg_op = 'INSERT' or new.pickup_km is distinct from old.pickup_km) then new.pickup_ts := now(); end if;
  if new.return_km is not null and (tg_op = 'INSERT' or new.return_km is distinct from old.return_km) then new.return_ts := now(); end if;
  return new;
end $$;
drop trigger if exists bookings_odo_ts on public.bookings;
create trigger bookings_odo_ts before insert or update of pickup_km, return_km on public.bookings
  for each row execute function public.bookings_odo_ts();

create table if not exists public.odo_gps (
  id          uuid primary key default gen_random_uuid(),
  source      text not null check (source in ('karta', 'tankowanie', 'przejecie', 'zdanie')),
  ref_id      uuid not null,
  vehicle_id  uuid not null references public.vehicles(id) on delete cascade,
  at          timestamptz not null,
  gps_km      numeric(12,1),
  checked_at  timestamptz not null default now(),
  unique (source, ref_id)
);
create index if not exists odo_gps_vehicle on public.odo_gps(vehicle_id, at);
revoke all on public.odo_gps from authenticated;
do $$ begin revoke all on public.odo_gps from anon; exception when undefined_object then null; end $$;
grant select on public.odo_gps to authenticated;
alter table public.odo_gps enable row level security;
drop policy if exists odo_gps_staff on public.odo_gps;
create policy odo_gps_staff on public.odo_gps for select using (public.is_staff());
