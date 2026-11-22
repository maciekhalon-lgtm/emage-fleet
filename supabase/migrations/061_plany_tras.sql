-- ============================================================================
-- Emage FLEET — plany tras na mapie (uruchom po 060)
-- Plan trasy powstaje na mapie (Grafik → Mapa tras): nazwa, kolor, start, koniec, przystanki (klienci),
-- punkty przejazdowe. Opcjonalnie przypięty do trasy z zakładki Trasy (route_id) – wtedy przystanki planu
-- stają się przystankami tej trasy (kierowca widzi je w telefonie). Usunięcie planu nie rusza tras ani grafiku.
--  stops: [{"id": "...", "clientId": "..."}]   via: [{"lat":..,"lng":..,"after":"start" | id przystanku}]
-- ============================================================================
create table if not exists public.route_plans (
  id              uuid primary key default gen_random_uuid(),
  name            text not null check (length(trim(name)) > 0),
  color           text,
  start_client_id uuid references public.clients(id) on delete set null,
  end_client_id   uuid references public.clients(id) on delete set null,
  stops           jsonb not null default '[]'::jsonb,
  via             jsonb not null default '[]'::jsonb,
  route_id        uuid references public.routes(id) on delete set null,
  note            text,
  created_at      timestamptz not null default now(),
  created_by      uuid default auth.uid(),
  updated_at      timestamptz not null default now()
);
-- jedna trasa = najwyżej jeden plan
create unique index if not exists route_plans_route_uq on public.route_plans (route_id) where route_id is not null;
grant select, insert, update, delete on public.route_plans to authenticated;
alter table public.route_plans enable row level security;
drop policy if exists route_plans_select on public.route_plans;
create policy route_plans_select on public.route_plans for select using (public.is_active());
drop policy if exists route_plans_fleet on public.route_plans;
create policy route_plans_fleet on public.route_plans for all using (public.is_fleet()) with check (public.is_fleet());
drop trigger if exists route_plans_log on public.route_plans;
create trigger route_plans_log after insert or update or delete on public.route_plans for each row execute function public.log_change();

do $$ begin
  alter publication supabase_realtime add table public.route_plans;
exception when duplicate_object then null; when undefined_object then null; end $$;
