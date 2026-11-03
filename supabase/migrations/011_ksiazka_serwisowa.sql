-- ============================================================================
-- Emage FLEET — książka serwisowa (uruchom po 010_waluty.sql)
-- Wpis z kosztem sam dodaje koszt „Serwis i naprawy”, może odnowić termin i zamknąć usterki.
-- Wymiana oleju: następna za 12 000 km, przypomnienie 2 000 km wcześniej.
-- Dostęp: kierownik floty i kierownik serwisu.
-- ============================================================================

-- Przypomnienie o terminie przebiegowym: ile km przed (np. 2000)
alter table public.deadlines add column if not exists remind_km int check (remind_km >= 0);

create table if not exists public.service_entries (
  id           uuid primary key default gen_random_uuid(),
  vehicle_id   uuid not null references public.vehicles(id) on delete cascade,
  date         date not null,
  km           int check (km >= 0),
  workshop     text,
  description  text not null,
  cost         numeric(12,2) check (cost >= 0),
  oil_change   boolean not null default false,
  deadline_id  uuid references public.deadlines(id) on delete set null,
  issue_ids    uuid[] not null default '{}',
  cost_id      uuid references public.costs(id) on delete set null,
  note         text,
  storage_path text,
  file_name    text,
  content_type text,
  created_by   uuid default auth.uid(),
  created_at   timestamptz not null default now(),
  updated_by   uuid default auth.uid(),
  updated_at   timestamptz not null default now()
);
create index if not exists service_entries_vehicle_idx on public.service_entries (vehicle_id, date desc);
grant select, insert, update, delete on public.service_entries to authenticated;
alter table public.service_entries enable row level security;
drop policy if exists service_entries_staff on public.service_entries;
create policy service_entries_staff on public.service_entries for all using (public.is_staff()) with check (public.is_staff());
drop trigger if exists service_entries_touch on public.service_entries;
create trigger service_entries_touch before update on public.service_entries for each row execute function public.touch_updated();
drop trigger if exists service_entries_log on public.service_entries;
create trigger service_entries_log after insert or update or delete on public.service_entries for each row execute function public.log_change();

-- Skutki wpisu: koszt, przebieg auta, zamknięte usterki, odnowiony termin, wymiana oleju
create or replace function public.service_apply() returns trigger
language plpgsql security definer set search_path = public as $$
declare d public.deadlines; oil uuid; vnote text;
begin
  if new.oil_change and new.km is null then
    raise exception 'Przy wymianie oleju podaj przebieg – od niego liczymy następną wymianę.' using errcode = 'P0001';
  end if;
  vnote := left('Serwis: ' || new.description || coalesce(' (' || nullif(btrim(new.workshop), '') || ')', ''), 500);

  -- koszt „Serwis i naprawy”
  if coalesce(new.cost, 0) > 0 then
    if new.cost_id is not null and exists (select 1 from public.costs where id = new.cost_id) then
      update public.costs set date = new.date, vehicle_id = new.vehicle_id, amount = new.cost, note = vnote where id = new.cost_id;
    else
      insert into public.costs (date, vehicle_id, category, amount, note)
        values (new.date, new.vehicle_id, 'Serwis i naprawy', new.cost, vnote) returning id into new.cost_id;
    end if;
  else
    new.cost_id := null;   -- koszt usuwa wyzwalacz po zapisie (service_entries_cost_cleanup)
  end if;

  -- przebieg auta (nigdy nie obniża)
  if new.km is not null then
    update public.vehicles set km = new.km where id = new.vehicle_id and (km is null or km < new.km);
  end if;

  -- zamknięte usterki
  if array_length(new.issue_ids, 1) > 0 then
    update public.issues set status = 'naprawione', resolved_at = new.date,
        repair_note = coalesce(nullif(repair_note, ''), left(new.description, 300))
      where id = any(new.issue_ids) and vehicle_id = new.vehicle_id and status <> 'naprawione';
  end if;

  -- odnowiony termin (tylko przy dodaniu wpisu albo zmianie terminu / przebiegu)
  if new.deadline_id is not null and (tg_op = 'INSERT' or new.deadline_id is distinct from old.deadline_id or new.km is distinct from old.km or new.date is distinct from old.date) then
    select * into d from public.deadlines where id = new.deadline_id and vehicle_id = new.vehicle_id;
    if found then
      update public.deadlines set
          date = (new.date + make_interval(months => coalesce(d.interval_months, 12)))::date,
          km_due = case when d.interval_km is not null and new.km is not null then new.km + d.interval_km else null end
        where id = d.id;
    end if;
  end if;

  -- wymiana oleju: następna za 12 000 km, przypomnienie 2 000 km wcześniej
  if new.oil_change and (tg_op = 'INSERT' or not old.oil_change or new.km is distinct from old.km or new.date is distinct from old.date) then
    select id into oil from public.deadlines where vehicle_id = new.vehicle_id and type = 'Serwis olejowy' order by date limit 1;
    if oil is null then
      insert into public.deadlines (vehicle_id, type, date, km_due, interval_months, interval_km, remind_km, note)
        values (new.vehicle_id, 'Serwis olejowy', (new.date + interval '12 months')::date, new.km + 12000, 12, 12000, 2000, 'Ustawione z książki serwisowej');
    else
      update public.deadlines set km_due = new.km + 12000, interval_km = 12000, remind_km = 2000,
          interval_months = coalesce(interval_months, 12),
          date = (new.date + make_interval(months => coalesce(interval_months, 12)))::date
        where id = oil;
    end if;
  end if;
  return new;
end $$;
drop trigger if exists service_entries_apply on public.service_entries;
create trigger service_entries_apply before insert or update on public.service_entries
  for each row execute function public.service_apply();

-- Usunięcie wpisu albo jego kosztu usuwa też koszt „Serwis i naprawy”
create or replace function public.service_delete_cost() returns trigger
language plpgsql security definer set search_path = public as $$
begin
  if old.cost_id is not null and (tg_op = 'DELETE' or new.cost_id is distinct from old.cost_id) then
    delete from public.costs where id = old.cost_id;
  end if;
  return null;
end $$;
drop trigger if exists service_entries_delete on public.service_entries;
create trigger service_entries_delete after update or delete on public.service_entries
  for each row execute function public.service_delete_cost();

do $$ begin
  alter publication supabase_realtime add table public.service_entries;
exception when duplicate_object then null; end $$;
