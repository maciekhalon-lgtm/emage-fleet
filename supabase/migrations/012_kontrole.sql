-- ============================================================================
-- Emage FLEET — inspekcje aut i harmonogram sprzątania (uruchom po 011_ksiazka_serwisowa.sql)
-- Inspekcję robi kierownik floty (co 14 dni). Sprzątanie/mycie co 14 dni:
-- kierowca zaznacza, kierownik floty potwierdza.
-- ============================================================================

-- Inspekcje
create table if not exists public.inspections (
  id          uuid primary key default gen_random_uuid(),
  vehicle_id  uuid not null references public.vehicles(id) on delete cascade,
  date        date not null,
  km          int check (km >= 0),
  items       jsonb not null default '[]',
  note        text,
  photos      text[] not null default '{}',
  created_by  uuid default auth.uid(),
  created_at  timestamptz not null default now(),
  updated_by  uuid default auth.uid(),
  updated_at  timestamptz not null default now()
);
create index if not exists inspections_vehicle_idx on public.inspections (vehicle_id, date desc);
grant select, insert, update, delete on public.inspections to authenticated;
alter table public.inspections enable row level security;
drop policy if exists inspections_select on public.inspections;
create policy inspections_select on public.inspections for select using (public.is_staff());
drop policy if exists inspections_write on public.inspections;
create policy inspections_write on public.inspections for all using (public.is_fleet()) with check (public.is_fleet());
drop trigger if exists inspections_touch on public.inspections;
create trigger inspections_touch before update on public.inspections for each row execute function public.touch_updated();
drop trigger if exists inspections_log on public.inspections;
create trigger inspections_log after insert or update or delete on public.inspections for each row execute function public.log_change();

-- Sprzątanie / mycie
create table if not exists public.cleanings (
  id           uuid primary key default gen_random_uuid(),
  vehicle_id   uuid not null references public.vehicles(id) on delete cascade,
  date         date not null,
  kind         text not null default 'sprzatanie' check (kind in ('sprzatanie','mycie','oba')),
  driver_id    uuid references public.drivers(id) on delete set null,
  note         text,
  photos       text[] not null default '{}',
  status       text not null default 'pending' check (status in ('pending','confirmed','rejected')),
  decided_by   uuid,
  decided_at   timestamptz,
  reject_note  text,
  created_by   uuid default auth.uid(),
  created_at   timestamptz not null default now(),
  updated_by   uuid default auth.uid(),
  updated_at   timestamptz not null default now()
);
create index if not exists cleanings_vehicle_idx on public.cleanings (vehicle_id, date desc);
grant select, insert, update, delete on public.cleanings to authenticated;
alter table public.cleanings enable row level security;
drop policy if exists cleanings_select on public.cleanings;
create policy cleanings_select on public.cleanings for select
  using (public.is_staff() or (public.app_role() = 'kierowca' and driver_id = public.app_driver_id()));
drop policy if exists cleanings_fleet on public.cleanings;
create policy cleanings_fleet on public.cleanings for all using (public.is_fleet()) with check (public.is_fleet());
drop policy if exists cleanings_driver_insert on public.cleanings;
create policy cleanings_driver_insert on public.cleanings for insert
  with check (public.app_role() = 'kierowca' and driver_id = public.app_driver_id());
drop policy if exists cleanings_driver_update on public.cleanings;
create policy cleanings_driver_update on public.cleanings for update
  using (public.app_role() = 'kierowca' and driver_id = public.app_driver_id() and status = 'pending')
  with check (driver_id = public.app_driver_id());
drop policy if exists cleanings_driver_delete on public.cleanings;
create policy cleanings_driver_delete on public.cleanings for delete
  using (public.app_role() = 'kierowca' and driver_id = public.app_driver_id() and status = 'pending');
drop trigger if exists cleanings_touch on public.cleanings;
create trigger cleanings_touch before update on public.cleanings for each row execute function public.touch_updated();
drop trigger if exists cleanings_log on public.cleanings;
create trigger cleanings_log after insert or update or delete on public.cleanings for each row execute function public.log_change();

-- Status sprzątania ustawia tylko kierownik floty; jego własny wpis jest od razu potwierdzony.
create or replace function public.cleaning_guard() returns trigger
language plpgsql security definer set search_path = public as $$
begin
  if auth.uid() is null then return new; end if;   -- zmiany z SQL Editor (administrator bazy)
  if coalesce(public.is_fleet(), false) then
    if tg_op = 'INSERT' and new.status = 'pending' and new.driver_id is null then new.status := 'confirmed'; end if;
    if new.status <> 'pending' and (tg_op = 'INSERT' or new.status is distinct from old.status) then
      new.decided_by := auth.uid(); new.decided_at := now();
    end if;
    if new.status <> 'rejected' then new.reject_note := null; end if;
    return new;
  end if;
  new.status := 'pending'; new.decided_by := null; new.decided_at := null; new.reject_note := null;
  return new;
end $$;
drop trigger if exists cleanings_guard on public.cleanings;
create trigger cleanings_guard before insert or update on public.cleanings
  for each row execute function public.cleaning_guard();

-- Data ostatniego potwierdzonego sprzątania w danych auta (kierowca widzi ją bez dostępu do cudzych wpisów)
alter table public.vehicles add column if not exists last_clean date;
create or replace function public.cleaning_sync() returns trigger
language plpgsql security definer set search_path = public as $$
declare vid uuid := coalesce(new.vehicle_id, old.vehicle_id);
begin
  update public.vehicles set last_clean = (select max(date) from public.cleanings where vehicle_id = vid and status = 'confirmed') where id = vid;
  if tg_op = 'UPDATE' and old.vehicle_id is distinct from new.vehicle_id then
    update public.vehicles set last_clean = (select max(date) from public.cleanings where vehicle_id = old.vehicle_id and status = 'confirmed') where id = old.vehicle_id;
  end if;
  return null;
end $$;
drop trigger if exists cleanings_sync on public.cleanings;
create trigger cleanings_sync after insert or update or delete on public.cleanings
  for each row execute function public.cleaning_sync();

-- Kierowca widzi harmonogram (co ile dni sprzątanie)
drop policy if exists settings_select_public on public.settings;
create policy settings_select_public on public.settings for select
  using (key in ('push', 'checklist', 'schedule') and public.is_active());

do $$ begin
  alter publication supabase_realtime add table public.inspections, public.cleanings;
exception when duplicate_object then null; end $$;
