-- ============================================================================
-- Emage FLEET — poprawki logiki liczników i flag spalania (uruchom po 065)
--  • godzina przejęcia/zdania (pickup_ts / return_ts) zapisuje się tylko przy PIERWSZYM wpisaniu licznika –
--    poprawka licznika przez kierownika nie zmienia już godziny (wcześniej zdanie wychodziło „przed” przejęciem)
--  • flaga „Spalanie … powyżej progu” tylko powyżej progu kradzieży klasy (do 2,5 t – 10, powyżej – 13,5 l/100),
--    a nie powyżej progu „Dobre – do” (to tylko kolory w rankingu); otwarte flagi z 30 dni przeliczone
-- ============================================================================
create or replace function public.bookings_odo_ts() returns trigger
language plpgsql as $$
begin
  if new.pickup_km is not null and (tg_op = 'INSERT' or old.pickup_km is null) then new.pickup_ts := now();
  elsif tg_op = 'UPDATE' then new.pickup_ts := coalesce(old.pickup_ts, new.pickup_ts); end if;
  if new.return_km is not null and (tg_op = 'INSERT' or old.return_km is null) then new.return_ts := now();
  elsif tg_op = 'UPDATE' then new.return_ts := coalesce(old.return_ts, new.return_ts); end if;
  return new;
end $$;

-- start odcinka spalania przy tankowaniu: przejęcie tylko z pełnym bakiem i bez wątpliwości
create or replace function public.cost_flags() returns trigger
language plpgsql security definer set search_path = public as $$
declare v public.vehicles; thr numeric; vat numeric; netp numeric; f text[] := '{}'; avgp numeric; cnt int; prev record; lsum numeric; dist int; rate numeric;
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
            or new.date is distinct from old.date or new.driver_id is distinct from old.driver_id or new.full_tank is distinct from old.full_tank
            or coalesce(current_setting('app.flags_recompute', true), '') = 'on';
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
  -- możliwy duplikat: ten sam licznik (±2 km) co inne tankowanie tego auta z tego albo poprzedniego dnia
  --   (dwa tankowania jedno po drugim same w sobie nie są podejrzane – np. dotankowanie w Czechach, potem do pełna w Polsce)
  if new.category = 'Paliwo' and new.odometer is not null then
    select c.date, c.liters into prev from public.costs c
      where c.vehicle_id = new.vehicle_id and c.id <> new.id and c.category = 'Paliwo' and c.odometer is not null
        and abs(c.odometer - new.odometer) <= 2 and c.date between new.date - 1 and new.date + 1 and c.created_at < coalesce(new.created_at, now())
      order by c.created_at limit 1;
    if prev.date is not null then
      f := f || format('Możliwy duplikat: ten sam licznik co tankowanie z %s (%s l)', to_char(prev.date, 'DD.MM'), replace(to_char(prev.liters, 'FM9990.0'), '.', ','));
    end if;
  end if;
  -- za dużo litrów jak na przejechane km: od ostatniego tankowania do pełna do bieżącego wpisu auto nie mogło spalić
  --   więcej niż ~25 l/100 km (+10% baku zapasu). Tylko od tankowania do pełna – przejęcie auta bywa z niepełnym bakiem.
  if new.category = 'Paliwo' and new.odometer is not null and new.liters > 0 then
    select max(c.odometer) as odometer into prev from public.costs c
      where c.vehicle_id = new.vehicle_id and c.id <> new.id and c.full_tank and c.odometer is not null and c.odometer <= new.odometer
        and c.category = 'Paliwo' and (c.odometer < new.odometer or c.created_at < coalesce(new.created_at, now()));
    if prev.odometer is not null and new.odometer - prev.odometer < 3000 then
      dist := new.odometer - prev.odometer;
      select coalesce(sum(c.liters), 0) into lsum from public.costs c
        where c.vehicle_id = new.vehicle_id and c.id <> new.id and c.category = 'Paliwo' and c.odometer is not null
          and c.odometer > prev.odometer and c.odometer <= new.odometer and c.created_at < coalesce(new.created_at, now());
      lsum := lsum + new.liters;
      if lsum > dist * 0.25 + coalesce(v.tank_l, 90) * 0.1 + 5 then
        f := f || format('Za dużo litrów: %s l na %s km od tankowania do pełna (bak %s l)', replace(to_char(lsum, 'FM9990.0'), '.', ','), dist, coalesce(v.tank_l, 90));
      end if;
    end if;
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
  -- spalanie (między tankowaniami do pełna) powyżej progu kradzieży klasy: do 2,5 t – 10 l/100, powyżej – 13,5 l/100
  -- (próg „Dobre – do” z auta służy tylko do kolorów w rankingu – flaga tylko przy wyraźnym przekroczeniu)
  thr := case when v.weight_class = 'do25' then 10 else 13.5 end;
  if new.full_tank and new.odometer is not null then
    -- start odcinka: ostatnie tankowanie do pełna (przejęcie auta tylko z potwierdzonym pełnym bakiem – stan paliwa 100)
    select max(x.odo) as odometer into prev from (
      select c.odometer as odo from public.costs c
        where c.vehicle_id = new.vehicle_id and c.id <> new.id and c.full_tank and c.odometer is not null and c.odometer < new.odometer and c.category in ('Paliwo','Ładowanie')
      union all
      select b.pickup_km from public.bookings b
        where b.vehicle_id = new.vehicle_id and b.pickup_km is not null and b.pickup_km < new.odometer and b.pickup_fuel = 100 and not b.pickup_fuel_doubt) x;
    if prev.odometer is not null then
      dist := new.odometer - prev.odometer;
      select coalesce(sum(c.liters), 0) into lsum from public.costs c
        where c.vehicle_id = new.vehicle_id and c.id <> new.id and c.odometer > prev.odometer and c.odometer < new.odometer and c.category in ('Paliwo','Ładowanie');
      lsum := lsum + coalesce(new.liters, 0);
      if dist >= 50 then
        rate := lsum / dist * 100;
        if rate > thr then
          f := f || format('Spalanie %s l/100 km – powyżej progu %s', replace(to_char(rate, 'FM990.0'), '.', ','), replace(to_char(thr, 'FM990.0'), '.', ','));
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

-- przelicz otwarte i „bez uwag” flagi tankowań z ostatnich 30 dni (wyjaśniane i zatwierdzone zostają bez zmian)
do $$ begin
  perform set_config('app.flags_recompute', 'on', true);
  update public.costs set full_tank = full_tank
   where category = 'Paliwo' and date >= current_date - 30 and coalesce(flag_state, 'none') in ('none', 'open');
  perform set_config('app.flags_recompute', '', true);
end $$;
