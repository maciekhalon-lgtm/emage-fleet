-- ============================================================================
-- Emage FLEET — plan serwisu i warsztaty (uruchom po 029)
-- Warsztaty (nazwa, telefon, adres) i wizyty aut w warsztacie: data, godzina, powód, powiązany termin lub usterka.
-- Status wizyty „w warsztacie” sam ustawia auto na „serwis” (widać to w grafiku i na pulpicie),
-- „zakończona” lub „odwołana” – z powrotem na „aktywny” (jeśli auto nie ma innej otwartej wizyty).
-- Widzą i zmieniają: kierownik floty i serwisu.
-- ============================================================================
create table if not exists public.workshops (
  id          uuid primary key default gen_random_uuid(),
  name        text not null check (length(trim(name)) > 0),
  phone       text,
  address     text,
  kind        text,
  note        text,
  created_at  timestamptz not null default now()
);
create table if not exists public.service_visits (
  id           uuid primary key default gen_random_uuid(),
  vehicle_id   uuid not null references public.vehicles(id) on delete cascade,
  workshop_id  uuid references public.workshops(id) on delete set null,
  date         date not null,
  time         text check (time is null or time ~ '^\d{1,2}:\d{2}$'),
  reason       text not null check (length(trim(reason)) > 0),
  deadline_id  uuid references public.deadlines(id) on delete set null,
  issue_id     uuid references public.issues(id) on delete set null,
  status       text not null default 'zaplanowana' check (status in ('zaplanowana','w_warsztacie','zakonczona','odwolana')),
  note         text,
  created_by   uuid default auth.uid(),
  created_at   timestamptz not null default now()
);
create index if not exists service_visits_date_idx on public.service_visits (date);
create index if not exists service_visits_vehicle_idx on public.service_visits (vehicle_id, status);
grant select, insert, update, delete on public.workshops, public.service_visits to authenticated;
alter table public.workshops enable row level security;
alter table public.service_visits enable row level security;
drop policy if exists workshops_staff on public.workshops;
create policy workshops_staff on public.workshops for all using (public.is_staff()) with check (public.is_staff());
drop policy if exists service_visits_staff on public.service_visits;
create policy service_visits_staff on public.service_visits for all using (public.is_staff()) with check (public.is_staff());

-- auto w warsztacie ↔ status auta
create or replace function public.visit_sync() returns trigger
language plpgsql security definer set search_path = public as $$
begin
  if new.status = 'w_warsztacie' and (tg_op = 'INSERT' or old.status is distinct from new.status) then
    update public.vehicles set status = 'serwis' where id = new.vehicle_id and status = 'aktywny';
  elsif tg_op = 'UPDATE' and old.status = 'w_warsztacie' and new.status in ('zakonczona','odwolana')
        and not exists (select 1 from public.service_visits where vehicle_id = new.vehicle_id and status = 'w_warsztacie' and id <> new.id) then
    update public.vehicles set status = 'aktywny' where id = new.vehicle_id and status = 'serwis';
  end if;
  return null;
end $$;
drop trigger if exists service_visits_sync on public.service_visits;
create trigger service_visits_sync after insert or update on public.service_visits for each row execute function public.visit_sync();

drop trigger if exists workshops_log on public.workshops;
create trigger workshops_log after insert or update or delete on public.workshops for each row execute function public.log_change();
drop trigger if exists service_visits_log on public.service_visits;
create trigger service_visits_log after insert or update or delete on public.service_visits for each row execute function public.log_change();

do $$ begin alter publication supabase_realtime add table public.workshops; exception when duplicate_object then null; end $$;
do $$ begin alter publication supabase_realtime add table public.service_visits; exception when duplicate_object then null; end $$;
