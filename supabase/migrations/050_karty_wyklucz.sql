-- ============================================================================
-- Emage FLEET — wykluczanie tankowań z karty z kosztów floty (uruchom po 049)
-- Kierownik floty oznacza pozycję z karty jako „nie flota” (z powodem). Pozycja zostaje w zestawieniu
-- (ponowny import pliku jej nie przywróci), ale nie liczy się do kosztów, spalania ani porównań z kierowcą.
--  • opłata/parking (kind 'other') – jej koszt auta jest usuwany, a po przywróceniu dopisywany na nowo
--  • powiadomienia „karta” o tej pozycji są kasowane
-- ============================================================================
alter table public.fuel_card_rows add column if not exists excluded boolean not null default false;
alter table public.fuel_card_rows add column if not exists excluded_note text;
alter table public.fuel_card_rows add column if not exists excluded_at timestamptz;
alter table public.fuel_card_rows add column if not exists excluded_by uuid;

create or replace function public.fuel_card_excl_stamp() returns trigger
language plpgsql as $$
begin
  if new.excluded is distinct from old.excluded then
    new.excluded_at := case when new.excluded then now() end;
    new.excluded_by := case when new.excluded then auth.uid() end;
    if not new.excluded then new.excluded_note := null; end if;
  end if;
  return new;
end $$;
drop trigger if exists fuel_card_rows_excl_stamp on public.fuel_card_rows;
create trigger fuel_card_rows_excl_stamp before update of excluded on public.fuel_card_rows
  for each row execute function public.fuel_card_excl_stamp();

create or replace function public.fuel_card_excl_apply() returns trigger
language plpgsql security definer set search_path = public as $$
declare cid uuid; cat text; drv uuid; p text := lower(coalesce(new.product, '') || ' ' || coalesce(new.station, ''));
begin
  if new.excluded is not distinct from old.excluded then return null; end if;
  if new.excluded then
    delete from public.events e where e.kind = 'karta' and e.ref_id = new.id;
    if new.cost_id is not null then delete from public.costs where id = new.cost_id; end if;   -- cost_id → null (on delete set null)
    return null;
  end if;
  -- przywrócenie opłaty/parkingu: koszt auta jak przy imporcie
  if new.kind <> 'other' or coalesce(new.amount, 0) <= 0 or new.cost_id is not null then return null; end if;
  cat := case when p ~ 'myjn|wash|wäsche' then 'Myjnia'
              when p ~ 'park|opłat|oplat|autostr|toll|maut|myto|e-toll|viatoll|winiet|vignet|przejazd|bramk|droga|road' then 'Opłaty i parkingi'
              else 'Inne' end;
  select b.driver_id into drv from public.bookings b
    where b.vehicle_id = new.vehicle_id and b.date_from <= new.tx_date and b.date_to >= new.tx_date order by b.date_from limit 1;
  begin
    insert into public.costs (date, vehicle_id, category, amount, currency, amount_orig, driver_id, note)
      values (new.tx_date, new.vehicle_id, cat,
              case when coalesce(new.currency, 'PLN') = 'PLN' then new.amount else 0 end,
              coalesce(new.currency, 'PLN'), case when coalesce(new.currency, 'PLN') = 'PLN' then null else new.amount end,
              drv, left('Karta: ' || concat_ws(' · ', nullif(btrim(new.product), ''), nullif(btrim(new.station), ''), new.tx_time), 500))
      returning id into cid;
    update public.fuel_card_rows set cost_id = cid where id = new.id;
  exception when others then null;
  end;
  return null;
end $$;
drop trigger if exists fuel_card_rows_excl_apply on public.fuel_card_rows;
create trigger fuel_card_rows_excl_apply after update of excluded on public.fuel_card_rows
  for each row execute function public.fuel_card_excl_apply();

-- dopasowanie wpisu kierowcy do karty – bez wykluczonych pozycji
create or replace function private.card_match(r public.fuel_card_rows) returns public.costs
language sql stable security definer set search_path = public as $$
  select c.* from public.costs c
   where not r.excluded and c.vehicle_id = r.vehicle_id and c.category in ('Paliwo','Ładowanie')
     and c.date between r.tx_date - 1 and r.tx_date + 1 and coalesce(c.note, '') not like 'Karta:%'
   order by abs(coalesce(c.liters, 0) - coalesce(r.liters, 0)), abs(c.date - r.tx_date) limit 1
$$;

create or replace function public.cost_card_check() returns trigger
language plpgsql security definer set search_path = public, private as $$
declare r public.fuel_card_rows;
begin
  if new.category not in ('Paliwo','Ładowanie') or new.vehicle_id is null then return null; end if;
  for r in select * from public.fuel_card_rows f where f.vehicle_id = new.vehicle_id and f.kind = 'fuel' and not f.excluded and f.tx_date between new.date - 1 and new.date + 1 loop
    if (private.card_match(r)).id = new.id then perform private.card_check(r, new, true); end if;
  end loop;
  return null;
exception when others then return null;
end $$;

-- cena za litr (kontrola wpisu kierowcy) – średnia z kart bez wykluczonych pozycji
create or replace function public.cost_flags() returns trigger
language plpgsql security definer set search_path = public as $$
declare v public.vehicles; vat numeric; netp numeric; f text[] := '{}'; avgp numeric; cnt int; prev record; lsum numeric; dist int; rate numeric;
        staff boolean := coalesce(public.is_staff(), false);
        recompute boolean;
begin
  if coalesce(current_setting('app.route_sync', true), '') = 'on' then return new; end if;
  -- pola wyjaśnień zmienia tylko kierownik (albo funkcja explain_cost)
  if tg_op = 'UPDATE' and not staff and coalesce(current_setting('app.crew_rpc', true), '') <> 'on' then
    new.flag_state := old.flag_state; new.flag_question := old.flag_question; new.flag_reply := old.flag_reply;
    new.flag_by := old.flag_by; new.flag_at := old.flag_at;
  end if;
  if tg_op = 'INSERT' and not staff then
    new.flag_state := 'none'; new.flag_question := null; new.flag_reply := null; new.flag_by := null; new.flag_at := null;
  end if;
  if new.category not in ('Paliwo', 'Ładowanie') then
    new.flags := '{}'; new.flag_state := 'none'; return new;
  end if;
  recompute := tg_op = 'INSERT' or new.liters is distinct from old.liters or new.amount is distinct from old.amount
            or new.odometer is distinct from old.odometer or new.vehicle_id is distinct from old.vehicle_id
            or new.date is distinct from old.date or new.driver_id is distinct from old.driver_id or new.full_tank is distinct from old.full_tank;
  if not recompute then return new; end if;

  select * into v from public.vehicles where id = new.vehicle_id;
  -- więcej niż bak
  if new.category = 'Paliwo' and new.liters is not null and new.liters > coalesce(v.tank_l, 90) * 1.05 then
    f := f || format('Więcej niż bak: %s l (bak %s l)', replace(to_char(new.liters, 'FM9990.0'), '.', ','), replace(to_char(coalesce(v.tank_l, 90), 'FM9990'), '.', ','));
  end if;
  -- auto, którego kierowca nie miał
  if new.driver_id is not null and not exists (
      select 1 from public.bookings b where b.vehicle_id = new.vehicle_id and new.driver_id in (b.driver_id, b.co_driver_id)
        and b.pickup_at is not null and b.pickup_at <= new.date and coalesce(b.return_at, new.date) >= new.date) then
    f := f || 'Kierowca nie miał tego dnia przejętego tego auta'::text;
  end if;
  -- dwa tankowania w ciągu 3 godzin
  if exists (select 1 from public.costs c where c.vehicle_id = new.vehicle_id and c.id <> new.id and c.category in ('Paliwo','Ładowanie')
               and c.date = new.date and abs(extract(epoch from (c.created_at - coalesce(new.created_at, now())))) < 3 * 3600) then
    f := f || 'Drugie tankowanie tego auta w ciągu 3 godzin'::text;
  end if;
  -- cena za litr netto odbiega od średniej z kart paliwowych (60 dni, netto i VAT z importowanego pliku) o ponad 15%;
  -- bez danych z kart – średnia z tankowań w aplikacji (VAT 23%)
  if new.liters > 0 and new.amount > 0 and new.category = 'Paliwo' then
    select sum(coalesce(r.amount_net, r.amount / (1 + private.fuel_vat(r.tx_date) / 100.0))) / nullif(sum(r.liters), 0), count(*), mode() within group (order by r.vat_rate)
      into avgp, cnt, vat from public.fuel_card_rows r
      where r.kind = 'fuel' and not r.excluded and coalesce(r.currency, 'PLN') = 'PLN' and r.liters > 0 and r.amount > 0 and r.tx_date between new.date - 60 and new.date;
    if coalesce(cnt, 0) < 5 then
      vat := null;
      select avg(c.amount / c.liters / (1 + private.fuel_vat(c.date) / 100.0)), count(*) into avgp, cnt from public.costs c
        where c.category = new.category and c.id <> new.id and c.liters > 0 and c.amount > 0 and c.date between new.date - 60 and new.date;
    end if;
    netp := new.amount / new.liters / (1 + coalesce(vat, private.fuel_vat(new.date)) / 100.0);
    if cnt >= 5 and avgp > 0 and abs(netp - avgp) / avgp > 0.15 then
      f := f || format('Cena %s zł/l netto – średnia %s zł/l netto', replace(to_char(netp, 'FM990.00'), '.', ','), replace(to_char(avgp, 'FM990.00'), '.', ','));
    end if;
  end if;
  -- słabe spalanie (między tankowaniami do pełna) powyżej progu auta
  if new.full_tank and new.odometer is not null and v.cons_ok is not null then
    -- start odcinka: ostatnie tankowanie do pełna albo przejęcie auta (z pełnym bakiem), co było później
    select max(x.odo) as odometer into prev from (
      select c.odometer as odo from public.costs c
        where c.vehicle_id = new.vehicle_id and c.id <> new.id and c.full_tank and c.odometer is not null and c.odometer < new.odometer and c.category in ('Paliwo','Ładowanie')
      union all
      select b.pickup_km from public.bookings b
        where b.vehicle_id = new.vehicle_id and b.pickup_km is not null and b.pickup_km < new.odometer and coalesce(b.pickup_fuel, 100) = 100) x;
    if prev.odometer is not null then
      dist := new.odometer - prev.odometer;
      select coalesce(sum(c.liters), 0) into lsum from public.costs c
        where c.vehicle_id = new.vehicle_id and c.id <> new.id and c.odometer > prev.odometer and c.odometer < new.odometer and c.category in ('Paliwo','Ładowanie');
      lsum := lsum + coalesce(new.liters, 0);
      if dist >= 50 then
        rate := lsum / dist * 100;
        if rate > v.cons_ok then
          f := f || format('Spalanie %s l/100 km – powyżej progu %s', replace(to_char(rate, 'FM990.0'), '.', ','), replace(to_char(v.cons_ok, 'FM990.0'), '.', ','));
        end if;
      end if;
    end if;
  end if;

  if f is distinct from new.flags or tg_op = 'INSERT' then
    new.flags := f;
    new.flag_state := case when cardinality(f) = 0 then 'none' else 'open' end;
    if cardinality(f) = 0 then new.flag_question := null; new.flag_reply := null; end if;
  end if;
  return new;
end $$;
