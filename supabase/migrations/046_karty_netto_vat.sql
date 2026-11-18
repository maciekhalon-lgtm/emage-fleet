-- ============================================================================
-- Emage FLEET — netto i stawka VAT z importowanego zestawienia karty paliwowej (uruchom po 045)
-- fuel_card_rows: amount_net (kwota netto z pliku albo wyliczona ze stawki), vat_rate (stawka VAT w %).
-- Średnia cena paliwa (uwaga przy tankowaniu) liczy się z kart: suma netto / litry z 60 dni,
-- a cenę tankowania kierowcy przeliczamy na netto stawką VAT z kart (najczęstszą). Bez kart – jak dotąd (23%).
-- ============================================================================
alter table public.fuel_card_rows add column if not exists amount_net numeric(12,2);
alter table public.fuel_card_rows add column if not exists vat_rate numeric(5,2);

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
    select sum(coalesce(r.amount_net, r.amount / 1.23)) / nullif(sum(r.liters), 0), count(*), coalesce(mode() within group (order by r.vat_rate), 23)
      into avgp, cnt, vat from public.fuel_card_rows r
      where r.kind = 'fuel' and coalesce(r.currency, 'PLN') = 'PLN' and r.liters > 0 and r.amount > 0 and r.tx_date between new.date - 60 and new.date;
    if coalesce(cnt, 0) < 5 then
      vat := 23;
      select avg(c.amount / c.liters) / 1.23, count(*) into avgp, cnt from public.costs c
        where c.category = new.category and c.id <> new.id and c.liters > 0 and c.amount > 0 and c.date between new.date - 60 and new.date;
    end if;
    netp := new.amount / new.liters / (1 + coalesce(vat, 23) / 100.0);
    if cnt >= 5 and avgp > 0 and abs(netp - avgp) / avgp > 0.15 then
      f := f || format('Cena %s zł/l netto – średnia %s zł/l netto', replace(to_char(netp, 'FM990.00'), '.', ','), replace(to_char(avgp, 'FM990.00'), '.', ','));
    end if;
  end if;
  -- słabe spalanie (między tankowaniami do pełna) powyżej progu auta
  if new.full_tank and new.odometer is not null and v.cons_ok is not null then
    select c.odometer into prev from public.costs c
      where c.vehicle_id = new.vehicle_id and c.id <> new.id and c.full_tank and c.odometer is not null and c.odometer < new.odometer
        and c.category in ('Paliwo','Ładowanie') order by c.odometer desc limit 1;
    if found then
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
