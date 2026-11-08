-- ============================================================================
-- Emage FLEET — magazyn opon (uruchom po 026)
-- Komplety opon: sezon, rozmiar, marka, rok produkcji (DOT), bieżnik, gdzie są (na aucie / w magazynie).
-- Komplet „na aucie” ustawia sam vehicles.tires (z tego korzysta przypomnienie o sezonowej wymianie).
-- Na jednym aucie może być założony tylko jeden komplet. Widzą i zmieniają: kierownik floty i serwisu.
-- ============================================================================
create table if not exists public.tires (
  id           uuid primary key default gen_random_uuid(),
  vehicle_id   uuid references public.vehicles(id) on delete set null,
  season       text not null check (season in ('letnie','zimowe','caloroczne')),
  size         text,
  brand        text,
  dot          int check (dot is null or dot between 1990 and 2100),
  tread_mm     numeric(4,1) check (tread_mm is null or tread_mm between 0 and 20),
  location     text not null default 'magazyn' check (location in ('na_aucie','magazyn','zuzyte')),
  storage      text,
  mounted_at   date,
  mounted_km   int,
  note         text,
  created_by   uuid default auth.uid(),
  created_at   timestamptz not null default now()
);
create index if not exists tires_vehicle_idx on public.tires (vehicle_id);
create unique index if not exists tires_one_mounted on public.tires (vehicle_id) where location = 'na_aucie';
grant select, insert, update, delete on public.tires to authenticated;
alter table public.tires enable row level security;
drop policy if exists tires_staff on public.tires;
create policy tires_staff on public.tires for all using (public.is_staff()) with check (public.is_staff());

-- komplet założony na auto → vehicles.tires = sezon tego kompletu
create or replace function public.tires_sync() returns trigger
language plpgsql security definer set search_path = public as $$
begin
  if new.location = 'na_aucie' and new.vehicle_id is not null
     and (tg_op = 'INSERT' or old.location is distinct from new.location or old.vehicle_id is distinct from new.vehicle_id or old.season is distinct from new.season) then
    update public.vehicles set tires = new.season where id = new.vehicle_id;
  end if;
  return null;
end $$;
drop trigger if exists tires_sync on public.tires;
create trigger tires_sync after insert or update on public.tires for each row execute function public.tires_sync();

drop trigger if exists tires_log on public.tires;
create trigger tires_log after insert or update or delete on public.tires for each row execute function public.log_change();

do $$ begin
  alter publication supabase_realtime add table public.tires;
exception when duplicate_object then null; end $$;
