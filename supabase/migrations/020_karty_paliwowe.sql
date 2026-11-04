-- ============================================================================
-- Emage FLEET — import kart paliwowych (uruchom po 019_zaladunek_waga.sql)
-- Kierownik floty wgrywa zestawienie z karty (CSV/Excel) i fakturę (PDF). Zapisujemy tylko wiersze aut,
-- które są w systemie (po numerze rejestracyjnym). Porównanie z wpisami kierowców liczy aplikacja.
-- Dostęp: tylko kierownik floty.
-- ============================================================================
create table if not exists public.fuel_card_imports (
  id           uuid primary key default gen_random_uuid(),
  provider     text,
  invoice_no   text,
  invoice_path text,
  file_name    text,
  period_from  date,
  period_to    date,
  rows_total   int,
  rows_ours    int,
  created_by   uuid default auth.uid(),
  created_at   timestamptz not null default now()
);
create table if not exists public.fuel_card_rows (
  id          uuid primary key default gen_random_uuid(),
  import_id   uuid not null references public.fuel_card_imports(id) on delete cascade,
  vehicle_id  uuid not null references public.vehicles(id) on delete cascade,
  plate       text,
  tx_date     date not null,
  tx_time     text,
  liters      numeric(10,2),
  amount      numeric(12,2),
  currency    text not null default 'PLN',
  odometer    int,
  station     text,
  card_no     text,
  product     text
);
create index if not exists fuel_card_rows_idx on public.fuel_card_rows (vehicle_id, tx_date);
create index if not exists fuel_card_rows_import_idx on public.fuel_card_rows (import_id);

grant select, insert, update, delete on public.fuel_card_imports, public.fuel_card_rows to authenticated;
alter table public.fuel_card_imports enable row level security;
alter table public.fuel_card_rows enable row level security;
drop policy if exists fuel_card_imports_fleet on public.fuel_card_imports;
create policy fuel_card_imports_fleet on public.fuel_card_imports for all using (public.is_fleet()) with check (public.is_fleet());
drop policy if exists fuel_card_rows_fleet on public.fuel_card_rows;
create policy fuel_card_rows_fleet on public.fuel_card_rows for all using (public.is_fleet()) with check (public.is_fleet());

drop trigger if exists fuel_card_imports_log on public.fuel_card_imports;
create trigger fuel_card_imports_log after insert or delete on public.fuel_card_imports for each row execute function public.log_change();

do $$ begin
  alter publication supabase_realtime add table public.fuel_card_imports, public.fuel_card_rows;
exception when duplicate_object then null; end $$;
