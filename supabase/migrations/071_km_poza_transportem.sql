-- ============================================================================
-- Emage FLEET — km poza transportem (uruchom po 070)
--  Dni, w których auto wg GPS przejechało ≥ 10 km, a nikt nie miał go przejętego w aplikacji („km nieprzypisane”).
--  Kierownik floty przypisuje taki dzień: kto jechał (kierowca z listy albo wpisane imię, np. „Szef”) i cel.
--  Przypisane dni to „km poza transportem” – osobny raport kosztów paliwa (Paliwo → Poza transportem).
-- ============================================================================
create table if not exists public.km_assignments (
  id          uuid primary key default gen_random_uuid(),
  vehicle_id  uuid not null references public.vehicles(id) on delete cascade,
  day         date not null,
  km          numeric,                       -- km z GPS w chwili przypisania (informacyjnie)
  driver_id   uuid references public.drivers(id) on delete set null,
  who_name    text,                          -- gdy jechał ktoś spoza listy kierowców (np. „Szef”)
  purpose     text not null default 'sluzbowo' check (purpose in ('prywatnie','sluzbowo','serwis','przestawienie','inne')),
  note        text,
  created_by  uuid default auth.uid(),
  created_at  timestamptz not null default now(),
  updated_at  timestamptz not null default now(),
  unique (vehicle_id, day),
  check (driver_id is not null or length(trim(coalesce(who_name, ''))) > 0)
);
grant select, insert, update, delete on public.km_assignments to authenticated;
alter table public.km_assignments enable row level security;
drop policy if exists km_assignments_fleet on public.km_assignments;
create policy km_assignments_fleet on public.km_assignments for all using (public.is_fleet()) with check (public.is_fleet());
do $$ begin
  alter publication supabase_realtime add table public.km_assignments;
exception when duplicate_object then null; when undefined_object then null; end $$;
drop trigger if exists km_assignments_log on public.km_assignments;
create trigger km_assignments_log after insert or update or delete on public.km_assignments for each row execute function public.log_change();
