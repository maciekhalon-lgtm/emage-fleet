-- ============================================================================
-- Emage FLEET — przystanki (klienci) na trasach (uruchom po 021)
-- Kierownik floty ustala kolejność przystanków trasy: klient, adres, godzina, telefon, uwagi.
-- Kierowca widzi przystanki swojej trasy w aplikacji (nawigacja i telefon jednym kliknięciem).
-- ============================================================================
create table if not exists public.route_stops (
  id         uuid primary key default gen_random_uuid(),
  route_id   uuid not null references public.routes(id) on delete cascade,
  pos        int  not null default 0,
  client     text not null check (length(trim(client)) > 0),
  address    text,
  time_from  text,
  phone      text,
  note       text,
  created_by uuid default auth.uid(),
  created_at timestamptz not null default now()
);
create index if not exists route_stops_route_idx on public.route_stops (route_id, pos);
grant select, insert, update, delete on public.route_stops to authenticated;
alter table public.route_stops enable row level security;

drop policy if exists route_stops_select on public.route_stops;
create policy route_stops_select on public.route_stops for select using (public.is_active());
drop policy if exists route_stops_fleet on public.route_stops;
create policy route_stops_fleet on public.route_stops for all using (public.is_fleet()) with check (public.is_fleet());

drop trigger if exists route_stops_log on public.route_stops;
create trigger route_stops_log after insert or update or delete on public.route_stops for each row execute function public.log_change();

do $$ begin
  alter publication supabase_realtime add table public.route_stops;
exception when duplicate_object then null; end $$;
