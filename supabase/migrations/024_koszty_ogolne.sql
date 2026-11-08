-- ============================================================================
-- Emage FLEET — koszty ogólne floty (uruchom po 023)
-- Koszty, które nie dotyczą jednego auta (np. system GPS dla całej floty, parking/plac, księgowość floty,
-- abonamenty, wspólne ubezpieczenie). W raporcie miesięcznym dzielone po równo na wszystkie aktywne auta.
-- Widzi i zmienia tylko kierownik floty.
-- ============================================================================
create table if not exists public.fleet_costs (
  id         uuid primary key default gen_random_uuid(),
  date       date not null,
  category   text not null check (length(trim(category)) > 0),
  amount     numeric(12,2) not null check (amount >= 0),
  note       text,
  created_by uuid default auth.uid(),
  created_at timestamptz not null default now()
);
create index if not exists fleet_costs_date_idx on public.fleet_costs (date);
grant select, insert, update, delete on public.fleet_costs to authenticated;
alter table public.fleet_costs enable row level security;

drop policy if exists fleet_costs_fleet on public.fleet_costs;
create policy fleet_costs_fleet on public.fleet_costs for all using (public.is_fleet()) with check (public.is_fleet());

drop trigger if exists fleet_costs_log on public.fleet_costs;
create trigger fleet_costs_log after insert or update or delete on public.fleet_costs for each row execute function public.log_change();

do $$ begin
  alter publication supabase_realtime add table public.fleet_costs;
exception when duplicate_object then null; end $$;
