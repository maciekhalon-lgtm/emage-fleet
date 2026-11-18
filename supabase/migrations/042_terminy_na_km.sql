-- ============================================================================
-- Emage FLEET — olej, rozrząd i przegląd gwarancyjny tylko na kilometry (uruchom po 041)
-- 1. Termin może nie mieć daty (deadlines.date może być puste) – takie terminy liczą się tylko z przebiegu.
-- 2. Istniejące terminy tych trzech rodzajów z przebiegiem tracą datę i cykl w miesiącach.
-- 3. Książka serwisowa (wymiana oleju / rozrządu, wpis podpięty pod termin): następny termin =
--    przebieg wpisu + cykl km USTAWIONY w terminie (domyślnie olej 15 000, rozrząd 80 000, przegląd gwarancyjny 30 000).
-- ============================================================================
alter table public.deadlines alter column date drop not null;

create or replace function public.dl_km_only(t text) returns boolean
language sql immutable as $$ select t in ('Serwis olejowy', 'Wymiana rozrządu', 'Przegląd gwarancyjny') $$;
grant execute on function public.dl_km_only(text) to authenticated;

-- brakujący przebieg terminu: ostatnie wykonanie + cykl
update public.deadlines set km_due = last_done_km + interval_km
 where public.dl_km_only(type) and km_due is null and last_done_km is not null and interval_km is not null;
update public.deadlines set date = null, interval_months = null
 where public.dl_km_only(type) and km_due is not null;

create or replace function public.service_apply() returns trigger
language plpgsql security definer set search_path = public as $$
declare d public.deadlines; oil uuid; step int; rem int; vnote text;
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
      if public.dl_km_only(d.type) then
        -- tylko na km: bez przebiegu we wpisie termin zostaje, jak był
        if new.km is not null then
          step := coalesce(d.interval_km, case d.type when 'Serwis olejowy' then 15000 when 'Wymiana rozrządu' then 80000 else 30000 end);
          update public.deadlines set date = null, interval_months = null, km_due = new.km + step, interval_km = step where id = d.id;
        end if;
      else
        update public.deadlines set
            date = (new.date + make_interval(months => coalesce(d.interval_months, 12)))::date,
            km_due = case when d.interval_km is not null and new.km is not null then new.km + d.interval_km else null end
          where id = d.id;
      end if;
    end if;
  end if;

  -- wymiana oleju: następna = przebieg + ustawiony cykl (domyślnie 15 000 km, przypomnienie 2 000 km wcześniej)
  if new.oil_change and (tg_op = 'INSERT' or not old.oil_change or new.km is distinct from old.km or new.date is distinct from old.date) then
    select id, interval_km, remind_km into oil, step, rem from public.deadlines where vehicle_id = new.vehicle_id and type = 'Serwis olejowy' order by km_due nulls last limit 1;
    if oil is null then
      insert into public.deadlines (vehicle_id, type, date, km_due, interval_months, interval_km, remind_km, note)
        values (new.vehicle_id, 'Serwis olejowy', null, new.km + 15000, null, 15000, 2000, 'Ustawione z książki serwisowej');
    else
      update public.deadlines set km_due = new.km + coalesce(step, 15000), interval_km = coalesce(step, 15000), remind_km = coalesce(rem, 2000),
          interval_months = null, date = null
        where id = oil;
    end if;
  end if;
  -- wymiana rozrządu: następna = przebieg + ustawiony cykl (domyślnie 80 000 km, przypomnienie 5 000 km wcześniej)
  if new.timing_change and (tg_op = 'INSERT' or not old.timing_change or new.km is distinct from old.km or new.date is distinct from old.date) then
    select id, interval_km, remind_km into oil, step, rem from public.deadlines where vehicle_id = new.vehicle_id and type = 'Wymiana rozrządu' order by km_due nulls last limit 1;
    if oil is null then
      insert into public.deadlines (vehicle_id, type, date, km_due, interval_months, interval_km, remind_km, note)
        values (new.vehicle_id, 'Wymiana rozrządu', null, new.km + 80000, null, 80000, 5000, 'Ustawione z książki serwisowej');
    else
      update public.deadlines set km_due = new.km + coalesce(step, 80000), interval_km = coalesce(step, 80000), remind_km = coalesce(rem, 5000),
          interval_months = null, date = null
        where id = oil;
    end if;
  end if;
  return new;
end $$;

-- termin bez daty musi mieć przebieg (inaczej nic by nie przypominało)
alter table public.deadlines drop constraint if exists deadlines_date_or_km;
alter table public.deadlines add constraint deadlines_date_or_km check (date is not null or km_due is not null) not valid;
