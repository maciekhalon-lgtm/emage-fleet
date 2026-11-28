-- ============================================================================
-- Emage FLEET — zwroty skanowane przez kierowców (uruchom po 072)
--  return_scans: każdy zeskanowany kod zwrotu osobno – kod, data i godzina skanu, kierowca, auto (przejęte w chwili skanu).
--  Status: u_kierowcy (zeskanowany, kierowca go wiezie) → zdany (kierowca zdał zwroty na magazyn główny).
--  Kierownik floty dołącza zdane zwroty do listu przewozowego (waybill_id) i drukuje ich specyfikację.
--  Kierowca: widzi, dodaje i usuwa swoje skany, dopóki są u niego; zdaje je na magazyn. Kierownik floty: wszystko.
-- ============================================================================
create table if not exists public.return_scans (
  id          uuid primary key default gen_random_uuid(),
  code        text not null check (length(trim(code)) between 1 and 200),
  scanned_at  timestamptz not null default now(),
  driver_id   uuid references public.drivers(id) on delete set null,
  vehicle_id  uuid references public.vehicles(id) on delete set null,
  booking_id  uuid references public.bookings(id) on delete set null,
  src         text,                                  -- kamera / zdjęcie / ręcznie
  note        text,
  status      text not null default 'u_kierowcy' check (status in ('u_kierowcy','zdany')),
  handed_at   timestamptz,                           -- kiedy zdany na magazyn główny
  waybill_id  uuid references public.waybills(id) on delete set null,
  created_by  uuid default auth.uid(),
  created_at  timestamptz not null default now(),
  updated_at  timestamptz not null default now()
);
create index if not exists return_scans_drv on public.return_scans(driver_id, scanned_at);
create index if not exists return_scans_wb on public.return_scans(waybill_id);

grant select, insert, update, delete on public.return_scans to authenticated;
alter table public.return_scans enable row level security;
drop policy if exists return_scans_fleet on public.return_scans;
create policy return_scans_fleet on public.return_scans for all using (public.is_fleet()) with check (public.is_fleet());
drop policy if exists return_scans_own_sel on public.return_scans;
create policy return_scans_own_sel on public.return_scans for select using (driver_id is not null and driver_id = public.app_driver_id());
drop policy if exists return_scans_own_ins on public.return_scans;
create policy return_scans_own_ins on public.return_scans for insert with check (driver_id = public.app_driver_id() and status = 'u_kierowcy' and waybill_id is null);
drop policy if exists return_scans_own_upd on public.return_scans;
create policy return_scans_own_upd on public.return_scans for update using (driver_id = public.app_driver_id() and status = 'u_kierowcy')
  with check (driver_id = public.app_driver_id() and waybill_id is null);
drop policy if exists return_scans_own_del on public.return_scans;
create policy return_scans_own_del on public.return_scans for delete using (driver_id = public.app_driver_id() and status = 'u_kierowcy');

do $$ begin
  alter publication supabase_realtime add table public.return_scans;
exception when duplicate_object then null; when undefined_object then null; end $$;
drop trigger if exists return_scans_log on public.return_scans;
create trigger return_scans_log after insert or update or delete on public.return_scans for each row execute function public.log_change();
