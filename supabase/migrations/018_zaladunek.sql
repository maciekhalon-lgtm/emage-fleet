-- ============================================================================
-- Emage FLEET — załadunek (uruchom po 017_polisy.sql)
-- Kierowca zaznacza, towar których tras zabiera. Towar jedzie dalej jutro –
-- kierowca widzi, kto jutro jedzie tą trasą (imię, telefon), a ten kierowca – kto ma jego towar.
-- ============================================================================
create table if not exists public.loadings (
  id         uuid primary key default gen_random_uuid(),
  load_date  date not null default (now() at time zone 'Europe/Warsaw')::date,
  for_date   date not null default ((now() at time zone 'Europe/Warsaw')::date + 1),
  route_id   uuid not null references public.routes(id) on delete cascade,
  driver_id  uuid not null references public.drivers(id) on delete cascade,
  created_by uuid default auth.uid(),
  created_at timestamptz not null default now()
);
create unique index if not exists loadings_uq on public.loadings (for_date, route_id, driver_id);
create index if not exists loadings_for_idx on public.loadings (for_date);
grant select, insert, delete on public.loadings to authenticated;
alter table public.loadings enable row level security;

drop policy if exists loadings_select on public.loadings;
create policy loadings_select on public.loadings for select using (public.is_active());
drop policy if exists loadings_fleet on public.loadings;
create policy loadings_fleet on public.loadings for all using (public.is_fleet()) with check (public.is_fleet());
-- kierowca: tylko swoje wpisy, tylko z dzisiejszą datą załadunku (na jutro); „dziś” wg czasu polskiego
drop policy if exists loadings_driver_insert on public.loadings;
create policy loadings_driver_insert on public.loadings for insert
  with check (public.is_active() and driver_id = public.app_driver_id() and load_date = (now() at time zone 'Europe/Warsaw')::date and for_date = load_date + 1);
drop policy if exists loadings_driver_delete on public.loadings;
create policy loadings_driver_delete on public.loadings for delete
  using (driver_id = public.app_driver_id() and load_date = (now() at time zone 'Europe/Warsaw')::date);

drop trigger if exists loadings_log on public.loadings;
create trigger loadings_log after insert or delete on public.loadings for each row execute function public.log_change();

do $$ begin
  alter publication supabase_realtime add table public.loadings;
exception when duplicate_object then null; end $$;
