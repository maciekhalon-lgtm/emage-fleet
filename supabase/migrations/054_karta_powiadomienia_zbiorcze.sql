-- ============================================================================
-- Emage FLEET — mniej powiadomień z importu karty (uruchom po 053)
-- „Tankowanie z karty bez wpisu kierowcy” nie idzie już na telefon osobno dla każdej pozycji:
-- po imporcie jedno zbiorcze powiadomienie („Import karty: N tankowań bez wpisu kierowcy”).
-- Niezgodności (kierowca wpisał inaczej niż karta) dalej przychodzą osobno – to sprawy do wyjaśnienia z kierowcą.
-- Lista w dzwonku grupuje „bez wpisu” z jednego dnia w jeden wiersz (aplikacja).
-- ============================================================================
create or replace function private.card_check(r public.fuel_card_rows, c public.costs, from_cost boolean)
returns void language plpgsql security definer set search_path = public, private as $$
declare dl numeric; dk int; why text[] := '{}'; drv uuid; t text; b text;
begin
  if r.tx_date < current_date - 30 then return; end if;
  if c.id is null then
    if from_cost then return; end if;
    select bk.driver_id into drv from public.bookings bk
      where bk.vehicle_id = r.vehicle_id and bk.date_from <= r.tx_date and bk.date_to >= r.tx_date order by bk.date_from limit 1;
    t := 'Tankowanie z karty bez wpisu kierowcy: ' || private.plate(r.vehicle_id);
    b := to_char(r.tx_date, 'DD.MM') || coalesce(' ' || nullif(r.tx_time, ''), '') || coalesce(' · ' || to_char(r.liters, 'FM999990D0') || ' l', '')
         || coalesce(' · ' || nullif(r.station, ''), '') || case when drv is not null then ' · w grafiku: ' || private.drv_name(drv) else '' end;
  else
    drv := coalesce(c.driver_id, (select p.driver_id from public.profiles p where p.id = c.created_by));
    dl := abs(coalesce(c.liters, 0) - coalesce(r.liters, 0));
    if r.liters is not null and c.liters is not null and dl > 3 and dl > r.liters * 0.03 then
      why := why || (to_char(c.liters, 'FM999990D0') || ' l zamiast ' || to_char(r.liters, 'FM999990D0') || ' l'); end if;
    dk := abs(coalesce(c.odometer, 0) - coalesce(r.odometer, 0));
    if r.odometer is not null and c.odometer is not null and dk > 150 then
      why := why || ('licznik ' || to_char(c.odometer, 'FM999G999G999') || ' zamiast ' || to_char(r.odometer, 'FM999G999G999')); end if;
    if cardinality(why) = 0 then return; end if;
    t := private.drv_name(drv) || ' wpisał(a) inaczej niż karta: ' || private.plate(r.vehicle_id);
    b := to_char(r.tx_date, 'DD.MM') || ' · ' || array_to_string(why, ' · ');
  end if;
  if exists (select 1 from public.events e where e.kind = 'karta' and e.ref_id = r.id and e.title = left(t, 200)) then return; end if;
  perform private.event_add('karta', r.vehicle_id, drv, t, b, r.id, true);
  -- brak wpisu przy imporcie: bez osobnego powiadomienia na telefon – po imporcie idzie jedno zbiorcze (card_rows_summary)
  if c.id is not null then perform private.push(array['floty'], null, left(t, 120), left(b, 140), 'card-' || r.id); end if;
exception when others then null;   -- kontrola nigdy nie blokuje importu ani wpisu
end $$;

create or replace function public.card_rows_summary() returns trigger
language plpgsql security definer set search_path = public, private as $$
declare n int; pl text;
begin
  select count(*), string_agg(distinct private.plate(x.vehicle_id), ', ') into n, pl from nt x
   where x.kind = 'fuel' and x.vehicle_id is not null and not coalesce(x.excluded, false)
     and x.tx_date between current_date - 30 and current_date - 1 and (private.card_match(x)).id is null;
  if coalesce(n, 0) > 0 then
    perform private.push(array['floty'], null, left('Import karty: ' || n || ' ' || case when n = 1 then 'tankowanie' when n % 10 between 2 and 4 and n % 100 not between 12 and 14 then 'tankowania' else 'tankowań' end || ' bez wpisu kierowcy', 120),
                         left('Auta: ' || coalesce(pl, ''), 140), 'card-import');
  end if;
  return null;
exception when others then return null;
end $$;
drop trigger if exists fuel_card_rows_summary on public.fuel_card_rows;
create trigger fuel_card_rows_summary after insert on public.fuel_card_rows referencing new table as nt
  for each statement execute function public.card_rows_summary();
