-- ============================================================================
-- Emage FLEET — załadunek według dnia w grafiku + waga i zdjęcie (uruchom po 018_zaladunek.sql)
-- Przeładunek trwa ok. 23:00–01:00: kierowca ładujący w poniedziałek przekazuje towar kierowcom,
-- którzy w grafiku mają poniedziałek (zmiana z poniedziałku na wtorek). Bez godzin granicznych:
-- dzień załadunku = dzień w grafiku (aplikacja bierze go ze zmiany kierowcy), dopuszczalny dziś albo wczoraj.
-- Kierowca jadący trasą załadunkową wpisuje raz wagę towaru (obowiązkowo) i jedno zdjęcie – widzi to kierownik floty.
-- ============================================================================
alter table public.loadings alter column for_date set default (now() at time zone 'Europe/Warsaw')::date;
drop policy if exists loadings_driver_insert on public.loadings;
create policy loadings_driver_insert on public.loadings for insert
  with check (public.is_active() and driver_id = public.app_driver_id() and for_date = load_date
              and load_date between (now() at time zone 'Europe/Warsaw')::date - 1 and (now() at time zone 'Europe/Warsaw')::date);
drop policy if exists loadings_driver_delete on public.loadings;
create policy loadings_driver_delete on public.loadings for delete
  using (driver_id = public.app_driver_id() and load_date >= (now() at time zone 'Europe/Warsaw')::date - 1);

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
  with check (public.is_active() and driver_id = public.app_driver_id()
              and load_date between (now() at time zone 'Europe/Warsaw')::date - 1 and (now() at time zone 'Europe/Warsaw')::date);
drop policy if exists loading_reports_driver_update on public.loading_reports;
create policy loading_reports_driver_update on public.loading_reports for update
  using (driver_id = public.app_driver_id() and load_date >= (now() at time zone 'Europe/Warsaw')::date - 1)
  with check (driver_id = public.app_driver_id() and load_date >= (now() at time zone 'Europe/Warsaw')::date - 1);

drop trigger if exists loading_reports_touch on public.loading_reports;
create trigger loading_reports_touch before update on public.loading_reports for each row execute function public.touch_updated();
drop trigger if exists loading_reports_log on public.loading_reports;
create trigger loading_reports_log after insert or update or delete on public.loading_reports for each row execute function public.log_change();

do $$ begin
  alter publication supabase_realtime add table public.loading_reports;
exception when duplicate_object then null; end $$;
