-- ============================================================================
-- Emage FLEET — mapa tras (uruchom po 058)
--  • clients: kartoteka klientów i punktów (magazyn, rozładunek) ze współrzędnymi na mapie
--  • routes: kolor na mapie, punkt startu i końca (z kartoteki)
--  • route_stops: przystanek może wskazywać klienta z kartoteki (współrzędne bierzemy od klienta)
-- Widzą wszyscy zalogowani (kierowca – przystanki swojej trasy), zmienia kierownik floty.
-- ============================================================================
create table if not exists public.clients (
  id         uuid primary key default gen_random_uuid(),
  name       text not null check (length(trim(name)) > 0),
  address    text,
  lat        double precision check (lat between -90 and 90),
  lng        double precision check (lng between -180 and 180),
  phone      text,
  note       text,
  created_at timestamptz not null default now(),
  created_by uuid default auth.uid(),
  updated_at timestamptz not null default now()
);
grant select, insert, update, delete on public.clients to authenticated;
alter table public.clients enable row level security;
drop policy if exists clients_select on public.clients;
create policy clients_select on public.clients for select using (public.is_active());
drop policy if exists clients_fleet on public.clients;
create policy clients_fleet on public.clients for all using (public.is_fleet()) with check (public.is_fleet());
drop trigger if exists clients_log on public.clients;
create trigger clients_log after insert or update or delete on public.clients for each row execute function public.log_change();

alter table public.routes add column if not exists color text;
alter table public.routes add column if not exists start_client_id uuid references public.clients(id) on delete set null;
alter table public.routes add column if not exists end_client_id uuid references public.clients(id) on delete set null;
alter table public.route_stops add column if not exists client_id uuid references public.clients(id) on delete set null;

do $$ begin
  alter publication supabase_realtime add table public.clients;
exception when duplicate_object then null; when undefined_object then null; end $$;
