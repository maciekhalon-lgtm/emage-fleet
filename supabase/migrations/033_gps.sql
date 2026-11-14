-- ============================================================================
-- Emage FLEET — przebiegi z lokalizatorów GPS (Geotab) (uruchom po 032)
-- Jeden wiersz na auto i dzień: najwyższy stan licznika z lokalizatora w tym dniu.
-- Zapisuje tylko funkcja „powiadomienia” (klucz serwisowy) – synchronizacja co rano i na żądanie.
-- Czytają: kierownik floty i serwisu.
-- ============================================================================
create table if not exists public.gps_odometer (
  id           uuid primary key default gen_random_uuid(),
  vehicle_id   uuid not null references public.vehicles(id) on delete cascade,
  day          date not null,
  km           numeric(12,1) not null check (km >= 0),
  device       text,
  updated_at   timestamptz not null default now(),
  unique (vehicle_id, day)
);
create index if not exists gps_odometer_day on public.gps_odometer(day);
revoke all on public.gps_odometer from authenticated;
do $$ begin revoke all on public.gps_odometer from anon; exception when undefined_object then null; end $$;
grant select on public.gps_odometer to authenticated;
alter table public.gps_odometer enable row level security;
drop policy if exists gps_odometer_staff on public.gps_odometer;
create policy gps_odometer_staff on public.gps_odometer for select using (public.is_staff());
