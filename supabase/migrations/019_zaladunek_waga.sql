-- ============================================================================
-- Emage FLEET — waga i zdjęcie załadunku (uruchom po 018_zaladunek.sql)
-- Kierowca jadący dziś trasą załadunkową wpisuje raz wagę towaru (obowiązkowo) i jedno zdjęcie.
-- Widzi to tylko kierownik floty (i sam kierowca – swój wpis).
-- ============================================================================
create table if not exists public.loading_reports (
  id         uuid primary key default gen_random_uuid(),
  load_date  date not null default (now() at time zone 'Europe/Warsaw')::date,
  driver_id  uuid not null references public.drivers(id) on delete cascade,
  weight_kg  numeric(10,1) not null check (weight_kg > 0),
  photo      text,
  created_by uuid default auth.uid(),
  created_at timestamptz not null default now(),
  updated_by uuid,
  updated_at timestamptz not null default now()
);
create unique index if not exists loading_reports_uq on public.loading_reports (load_date, driver_id);
grant select, insert, update, delete on public.loading_reports to authenticated;
alter table public.loading_reports enable row level security;

drop policy if exists loading_reports_select on public.loading_reports;
create policy loading_reports_select on public.loading_reports for select
  using (public.is_fleet() or (public.is_active() and driver_id = public.app_driver_id()));
drop policy if exists loading_reports_fleet on public.loading_reports;
create policy loading_reports_fleet on public.loading_reports for all using (public.is_fleet()) with check (public.is_fleet());
drop policy if exists loading_reports_driver_insert on public.loading_reports;
create policy loading_reports_driver_insert on public.loading_reports for insert
  with check (public.is_active() and driver_id = public.app_driver_id() and load_date = (now() at time zone 'Europe/Warsaw')::date);
drop policy if exists loading_reports_driver_update on public.loading_reports;
create policy loading_reports_driver_update on public.loading_reports for update
  using (driver_id = public.app_driver_id() and load_date = (now() at time zone 'Europe/Warsaw')::date)
  with check (driver_id = public.app_driver_id() and load_date = (now() at time zone 'Europe/Warsaw')::date);

drop trigger if exists loading_reports_touch on public.loading_reports;
create trigger loading_reports_touch before update on public.loading_reports for each row execute function public.touch_updated();
drop trigger if exists loading_reports_log on public.loading_reports;
create trigger loading_reports_log after insert or update or delete on public.loading_reports for each row execute function public.log_change();

do $$ begin
  alter publication supabase_realtime add table public.loading_reports;
exception when duplicate_object then null; end $$;
