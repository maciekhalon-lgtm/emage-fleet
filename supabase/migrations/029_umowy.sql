-- ============================================================================
-- Emage FLEET — leasing, najem i finansowanie aut (uruchom po 028)
-- Umowa auta: rodzaj, finansujący, numer, okres, rata, limit kilometrów (z przebiegiem na starcie),
-- stawka za nadprzebieg, wykup. Aplikacja liczy prognozę kilometrów na koniec umowy,
-- przypomina o końcu umowy i wlicza ratę do Rozliczenia aut (gdy w danym miesiącu nie ma wpisanego kosztu „Leasing”).
-- Widzi i zmienia kierownik floty; kierownik serwisu – podgląd.
-- ============================================================================
create table if not exists public.vehicle_contracts (
  id              uuid primary key default gen_random_uuid(),
  vehicle_id      uuid not null references public.vehicles(id) on delete cascade,
  kind            text not null default 'leasing' check (kind in ('leasing','najem','kredyt','wlasne')),
  provider        text,
  contract_no     text,
  start_date      date,
  end_date        date,
  monthly_net     numeric(12,2) check (monthly_net is null or monthly_net >= 0),
  monthly_gross   numeric(12,2) check (monthly_gross is null or monthly_gross >= 0),
  km_limit        int check (km_limit is null or km_limit > 0),
  km_start        int check (km_start is null or km_start >= 0),
  km_excess_rate  numeric(8,4) check (km_excess_rate is null or km_excess_rate >= 0),
  buyout          numeric(12,2) check (buyout is null or buyout >= 0),
  insurance_in    boolean not null default false,
  service_in      boolean not null default false,
  note            text,
  created_at      timestamptz not null default now(),
  check (end_date is null or start_date is null or end_date >= start_date)
);
create index if not exists vehicle_contracts_vehicle_idx on public.vehicle_contracts (vehicle_id, end_date);
grant select, insert, update, delete on public.vehicle_contracts to authenticated;
alter table public.vehicle_contracts enable row level security;
drop policy if exists contracts_fleet on public.vehicle_contracts;
create policy contracts_fleet on public.vehicle_contracts for all using (public.is_fleet()) with check (public.is_fleet());
drop policy if exists contracts_read on public.vehicle_contracts;
create policy contracts_read on public.vehicle_contracts for select using (public.is_staff());

drop trigger if exists contracts_log on public.vehicle_contracts;
create trigger contracts_log after insert or update or delete on public.vehicle_contracts for each row execute function public.log_change();

do $$ begin
  alter publication supabase_realtime add table public.vehicle_contracts;
exception when duplicate_object then null; end $$;
