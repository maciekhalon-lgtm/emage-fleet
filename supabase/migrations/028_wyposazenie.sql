-- ============================================================================
-- Emage FLEET — wyposażenie aut (uruchom po 027)
-- Gaśnica (z datą ważności), apteczka, trójkąt, kamizelki, koło zapasowe, podnośnik, pasy do ładunku…
-- Jeden wiersz na auto i rzecz: czy jest i sprawna, ważne do, kiedy sprawdzone.
-- Widzą i zmieniają: kierownik floty i serwisu.
-- ============================================================================
create table if not exists public.equipment (
  id           uuid primary key default gen_random_uuid(),
  vehicle_id   uuid not null references public.vehicles(id) on delete cascade,
  item         text not null check (length(trim(item)) > 0),
  ok           boolean not null default true,
  valid_until  date,
  checked_at   date,
  note         text,
  created_at   timestamptz not null default now(),
  unique (vehicle_id, item)
);
grant select, insert, update, delete on public.equipment to authenticated;
alter table public.equipment enable row level security;
drop policy if exists equipment_staff on public.equipment;
create policy equipment_staff on public.equipment for all using (public.is_staff()) with check (public.is_staff());

drop trigger if exists equipment_log on public.equipment;
create trigger equipment_log after insert or update or delete on public.equipment for each row execute function public.log_change();

do $$ begin
  alter publication supabase_realtime add table public.equipment;
exception when duplicate_object then null; end $$;
