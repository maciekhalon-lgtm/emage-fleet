-- ============================================================================
-- Emage FLEET — karta paliwowa sprawdza wpisy kierowców (uruchom po 042)
-- Ranking i spalanie liczą się z tego, co kierowca wpisał w aplikacji. Import z karty tylko to sprawdza:
--  • tankowanie z karty, a kierowca nic nie wpisał (±1 dzień, to samo auto)        → powiadomienie
--  • kierowca wpisał inaczej niż karta: litry (> 3 l i > 3%) albo licznik (> 150 km) → powiadomienie
-- Sprawdzane przy imporcie wiersza karty i przy wpisie kierowcy (gdy karta była wcześniej).
-- Powiadomienie: dzwonek kierownika floty (events, rodzaj „karta”) + telefon (push).
-- Starsze niż 30 dni wiersze karty nie wywołują powiadomień (pierwszy import historii).
-- ============================================================================
alter table public.events drop constraint if exists events_kind_check;
alter table public.events add constraint events_kind_check check (kind in ('zdanie','tankowanie','usterka','karta'));

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
  perform private.push(array['floty'], null, left(t, 120), left(b, 140), 'card-' || r.id);
exception when others then null;   -- kontrola nigdy nie blokuje importu ani wpisu
end $$;

-- najbliższy wpis tankowania do wiersza karty (to samo auto, ±1 dzień, najbliższe litry)
create or replace function private.card_match(r public.fuel_card_rows) returns public.costs
language sql stable security definer set search_path = public as $$
  select c.* from public.costs c
   where c.vehicle_id = r.vehicle_id and c.category in ('Paliwo','Ładowanie')
     and c.date between r.tx_date - 1 and r.tx_date + 1 and coalesce(c.note, '') not like 'Karta:%'
   order by abs(coalesce(c.liters, 0) - coalesce(r.liters, 0)), abs(c.date - r.tx_date) limit 1
$$;

create or replace function public.card_row_check() returns trigger
language plpgsql security definer set search_path = public, private as $$
begin
  if new.kind = 'fuel' and new.vehicle_id is not null and new.tx_date <= current_date - 1 then
    perform private.card_check(new, private.card_match(new), false);
  end if;
  return null;
end $$;
drop trigger if exists fuel_card_rows_check on public.fuel_card_rows;
create trigger fuel_card_rows_check after insert on public.fuel_card_rows for each row execute function public.card_row_check();

create or replace function public.cost_card_check() returns trigger
language plpgsql security definer set search_path = public, private as $$
declare r public.fuel_card_rows;
begin
  if new.category not in ('Paliwo','Ładowanie') or new.vehicle_id is null then return null; end if;
  for r in select * from public.fuel_card_rows f where f.vehicle_id = new.vehicle_id and f.kind = 'fuel' and f.tx_date between new.date - 1 and new.date + 1 loop
    if (private.card_match(r)).id = new.id then perform private.card_check(r, new, true); end if;
  end loop;
  return null;
exception when others then return null;
end $$;
drop trigger if exists costs_card_check on public.costs;
create trigger costs_card_check after insert on public.costs for each row execute function public.cost_card_check();
