-- ============================================================================
-- Emage FLEET — wymiana rozrządu (uruchom po 015_odpowiedzialni.sql)
-- Znacznik „Wymiana rozrządu” w książce serwisowej: następna wymiana za 80 000 km,
-- przypomnienie 5 000 km wcześniej (bez blokady auta).
-- ============================================================================
alter table public.service_entries add column if not exists timing_change boolean not null default false;

create or replace function public.service_apply() returns trigger
language plpgsql security definer set search_path = public as $$
declare d public.deadlines; oil uuid; vnote text;
begin
  if new.timing_change and new.km is null then
    raise exception 'Przy wymianie rozrządu podaj przebieg – od niego liczymy następną wymianę.' using errcode = 'P0001';
  end if;
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
  -- wymiana rozrządu: następna za 80 000 km, przypomnienie 5 000 km wcześniej
  if new.timing_change and (tg_op = 'INSERT' or not old.timing_change or new.km is distinct from old.km or new.date is distinct from old.date) then
    select id into oil from public.deadlines where vehicle_id = new.vehicle_id and type = 'Wymiana rozrządu' order by date limit 1;
    if oil is null then
      insert into public.deadlines (vehicle_id, type, date, km_due, interval_months, interval_km, remind_km, note)
        values (new.vehicle_id, 'Wymiana rozrządu', (new.date + interval '60 months')::date, new.km + 80000, 60, 80000, 5000, 'Ustawione z książki serwisowej');
    else
      update public.deadlines set km_due = new.km + 80000, interval_km = 80000, remind_km = 5000, interval_months = 60,
          date = (new.date + interval '60 months')::date
        where id = oil;
    end if;
  end if;
  return new;
end $$;
