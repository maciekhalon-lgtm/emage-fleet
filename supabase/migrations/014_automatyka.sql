-- ============================================================================
-- Emage FLEET — duża aktualizacja: automatyka dla kierownictwa (uruchom po 013_trasa_kierowca.sql)
--  1. Blokady: auto z przeglądem technicznym lub OC po terminie nie zostanie przejęte
--     (kierownik floty może zezwolić na jeden dzień, z powodem).
--  2. Podejrzane tankowania: sygnały liczy baza przy zapisie; kierownik oznacza OK
--     albo prosi kierowcę o wyjaśnienie.
--  3. Wyrywkowa kontrola paragonów: codziennie losowani kierowcy muszą dodać zdjęcie paragonu.
--  4. Opony sezonowe: stan w aucie, zmiana z książki serwisowej.
--  5. Powiadomienia od razu (wymaga podmiany funkcji „powiadomienia” – instrukcja osobno).
-- ============================================================================

-- Miejsce na wewnętrzne ustawienia bazy, niewidoczne przez API
create schema if not exists private;
revoke all on schema private from public;
create table if not exists private.config (key text primary key, value text not null);
insert into private.config (key, value) values ('receipt_salt', gen_random_uuid()::text) on conflict (key) do nothing;

-- ---------- Nowe pola ----------
alter table public.vehicles add column if not exists tank_l numeric(6,1) not null default 90 check (tank_l > 0);
alter table public.vehicles add column if not exists tires  text check (tires in ('letnie','zimowe','caloroczne'));
alter table public.service_entries add column if not exists tires_set text check (tires_set in ('letnie','zimowe','caloroczne'));

alter table public.costs add column if not exists flags          text[] not null default '{}';
alter table public.costs add column if not exists flag_state     text not null default 'none' check (flag_state in ('none','open','explain','ok'));
alter table public.costs add column if not exists flag_question  text;
alter table public.costs add column if not exists flag_reply     text;
alter table public.costs add column if not exists flag_by        uuid;
alter table public.costs add column if not exists flag_at        timestamptz;

-- ============================================================================
-- 1. BLOKADY
-- ============================================================================
create table if not exists public.block_overrides (
  id          uuid primary key default gen_random_uuid(),
  vehicle_id  uuid not null references public.vehicles(id) on delete cascade,
  date        date not null default current_date,
  reason      text not null check (btrim(reason) <> ''),
  created_by  uuid default auth.uid(),
  created_at  timestamptz not null default now()
);
create index if not exists block_overrides_idx on public.block_overrides (vehicle_id, date);
grant select, insert, update, delete on public.block_overrides to authenticated;
alter table public.block_overrides enable row level security;
drop policy if exists block_overrides_select on public.block_overrides;
create policy block_overrides_select on public.block_overrides for select using (public.is_active());
drop policy if exists block_overrides_write on public.block_overrides;
create policy block_overrides_write on public.block_overrides for all using (public.is_fleet()) with check (public.is_fleet());
drop trigger if exists block_overrides_log on public.block_overrides;
create trigger block_overrides_log after insert or update or delete on public.block_overrides for each row execute function public.log_change();

-- Powód blokady auta w dniu d (null = można wydać)
create or replace function public.vehicle_block(vid uuid, d date default current_date) returns text
language sql stable security definer set search_path = public as $$
  select string_agg(type || ' po terminie (' || to_char(date, 'DD.MM.YYYY') || ')', ', ' order by date)
  from public.deadlines
  where vehicle_id = vid and type in ('Przegląd techniczny', 'Ubezpieczenie OC') and date < d
$$;
grant execute on function public.vehicle_block(uuid, date) to authenticated;

create or replace function public.block_pickup() returns trigger
language plpgsql security definer set search_path = public as $$
declare why text; d date;
begin
  if new.pickup_km is not null and (tg_op = 'INSERT' or old.pickup_km is null or new.vehicle_id is distinct from old.vehicle_id) then
    d := coalesce(new.pickup_at, current_date);
    why := public.vehicle_block(new.vehicle_id, d);
    if why is not null and not exists (select 1 from public.block_overrides o where o.vehicle_id = new.vehicle_id and o.date = d) then
      raise exception 'Auto zablokowane: %. Zezwolić na wyjazd może kierownik floty.', why using errcode = 'P0001';
    end if;
  end if;
  return new;
end $$;
drop trigger if exists bookings_block on public.bookings;
create trigger bookings_block before insert or update of pickup_km, vehicle_id on public.bookings
  for each row execute function public.block_pickup();

-- ============================================================================
-- 2. PODEJRZANE TANKOWANIA
-- ============================================================================
create or replace function public.cost_flags() returns trigger
language plpgsql security definer set search_path = public as $$
declare v public.vehicles; f text[] := '{}'; avgp numeric; cnt int; prev record; lsum numeric; dist int; rate numeric;
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
  -- cena za litr odbiega od średniej z 60 dni o ponad 15%
  if new.liters > 0 and new.amount > 0 then
    select avg(c.amount / c.liters), count(*) into avgp, cnt from public.costs c
      where c.category = new.category and c.id <> new.id and c.liters > 0 and c.amount > 0 and c.date between new.date - 60 and new.date;
    if cnt >= 5 and avgp > 0 and abs(new.amount / new.liters - avgp) / avgp > 0.15 then
      f := f || format('Cena %s zł/l – średnia %s zł/l', replace(to_char(new.amount / new.liters, 'FM990.00'), '.', ','), replace(to_char(avgp, 'FM990.00'), '.', ','));
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
drop trigger if exists costs_b_flags on public.costs;
create trigger costs_b_flags before insert or update on public.costs
  for each row execute function public.cost_flags();

-- Kierownik oznacza: OK albo „proszę o wyjaśnienie” (zapis zwykłą edycją – kto i kiedy ustawia baza)
create or replace function public.cost_flag_stamp() returns trigger
language plpgsql security definer set search_path = public as $$
begin
  if coalesce(public.is_staff(), false) and (new.flag_state is distinct from old.flag_state or new.flag_question is distinct from old.flag_question) then
    new.flag_by := auth.uid(); new.flag_at := now();
  end if;
  return new;
end $$;
drop trigger if exists costs_c_flag_stamp on public.costs;
create trigger costs_c_flag_stamp before update on public.costs
  for each row execute function public.cost_flag_stamp();

-- Kierowca odpowiada na prośbę o wyjaśnienie
create or replace function public.explain_cost(cost_id uuid, reply text) returns void
language plpgsql security definer set search_path = public as $$
declare c public.costs;
begin
  select * into c from public.costs where id = cost_id for update;
  if not found or c.flag_state <> 'explain' then raise exception 'To tankowanie nie czeka na wyjaśnienie.' using errcode = 'P0001'; end if;
  if not (c.created_by = auth.uid() or (c.driver_id is not null and c.driver_id = public.app_driver_id())) then
    raise exception 'Wyjaśnienie dodaje kierowca, który tankował.' using errcode = 'P0001';
  end if;
  if coalesce(btrim(reply), '') = '' then raise exception 'Napisz wyjaśnienie.' using errcode = 'P0001'; end if;
  perform set_config('app.crew_rpc', 'on', true);
  update public.costs set flag_reply = left(btrim(reply), 500), flag_state = 'open', flag_at = now() where id = cost_id;
end $$;
grant execute on function public.explain_cost(uuid, text) to authenticated;

-- ============================================================================
-- 3. WYRYWKOWA KONTROLA PARAGONÓW
-- ============================================================================
-- Procent dni pracy z obowiązkowym paragonem: ustawienie 'receipts' {percent}, domyślnie 20
create or replace function public.receipt_required(drv uuid, d date) returns boolean
language sql stable security definer set search_path = public, private as $$
  select drv is not null and
    abs(hashtext((select value from private.config where key = 'receipt_salt') || drv::text || d::text)) % 100
      < coalesce((select (value->>'percent')::int from public.settings where key = 'receipts'), 20)
$$;
create or replace function public.my_receipt_today() returns boolean
language sql stable security definer set search_path = public as $$
  select public.receipt_required(public.app_driver_id(), current_date)
$$;
revoke execute on function public.receipt_required(uuid, date) from public;
grant execute on function public.my_receipt_today() to authenticated;

create or replace function public.cost_receipt() returns trigger
language plpgsql security definer set search_path = public as $$
begin
  if coalesce(public.is_staff(), false) or new.category not in ('Paliwo', 'Ładowanie') then return new; end if;
  if cardinality(coalesce(new.photos, '{}')) = 0 and public.receipt_required(new.driver_id, new.date) then
    raise exception 'Dziś wylosowano Cię do kontroli paragonów – dodaj zdjęcie paragonu.' using errcode = 'P0001';
  end if;
  return new;
end $$;
drop trigger if exists costs_d_receipt on public.costs;
create trigger costs_d_receipt before insert on public.costs
  for each row execute function public.cost_receipt();

-- ============================================================================
-- 4. OPONY: wymiana wpisana w książce serwisowej zmienia stan auta
-- ============================================================================
create or replace function public.service_tires() returns trigger
language plpgsql security definer set search_path = public as $$
begin
  if new.tires_set is not null and (tg_op = 'INSERT' or new.tires_set is distinct from old.tires_set) then
    update public.vehicles set tires = new.tires_set where id = new.vehicle_id;
  end if;
  return null;
end $$;
drop trigger if exists service_entries_tires on public.service_entries;
create trigger service_entries_tires after insert or update on public.service_entries
  for each row execute function public.service_tires();

-- ============================================================================
-- 5. POWIADOMIENIA OD RAZU (przez funkcję „powiadomienia”; adres i sekret z harmonogramu)
-- ============================================================================
create or replace function private.push(roles text[], users uuid[], title text, body text, tag text)
returns void language plpgsql security definer set search_path = public, private as $$
declare cmd text; url text; secret text;
begin
  select command into cmd from cron.job where jobname = 'emage-fleet-powiadomienia' limit 1;
  if cmd is null then return; end if;
  url := (regexp_match(cmd, '(https://[^'']+/functions/v1/powiadomienia)'))[1];
  secret := (regexp_match(cmd, '''x-cron-secret''\s*,\s*''([^'']+)'''))[1];
  if url is null or secret is null then return; end if;
  perform net.http_post(url := url,
    headers := jsonb_build_object('Content-Type', 'application/json', 'x-cron-secret', secret),
    body := jsonb_build_object('mode', 'event', 'roles', to_jsonb(coalesce(roles, '{}')), 'users', to_jsonb(coalesce(users, '{}')),
                               'title', title, 'body', body, 'tag', tag),
    timeout_milliseconds := 10000);
exception when others then null;   -- powiadomienie nigdy nie blokuje zapisu
end $$;

create or replace function private.plate(vid uuid) returns text
language sql stable security definer set search_path = public as $$ select coalesce((select plate from public.vehicles where id = vid), 'auto') $$;

-- Auto niesprawne → obaj kierownicy
create or replace function public.notify_issue() returns trigger
language plpgsql security definer set search_path = public, private as $$
begin
  if new.severity = 'stop' and new.status <> 'naprawione' and (tg_op = 'INSERT' or old.severity is distinct from 'stop') then
    perform private.push(array['floty','serwisu'], null, 'Auto niesprawne: ' || private.plate(new.vehicle_id), left(new.title, 140), 'stop-' || new.id);
  end if;
  return null;
end $$;
drop trigger if exists issues_notify on public.issues;
create trigger issues_notify after insert or update of severity on public.issues
  for each row execute function public.notify_issue();

-- Tankowania: podejrzane (kierownik floty), sporne (kierownik floty), prośba o wyjaśnienie (kierowca), odpowiedź (kierownik floty)
create or replace function public.notify_cost() returns trigger
language plpgsql security definer set search_path = public, private as $$
declare drv uuid[];
begin
  if new.flag_state = 'open' and cardinality(new.flags) > 0 and (tg_op = 'INSERT' or old.flag_state is distinct from 'open' or old.flags is distinct from new.flags) then
    perform private.push(array['floty'], null,
      case when tg_op = 'UPDATE' and new.flag_reply is not null and new.flag_reply is distinct from old.flag_reply then 'Kierowca wyjaśnił tankowanie ' else 'Podejrzane tankowanie ' end || private.plate(new.vehicle_id),
      coalesce(nullif(new.flag_reply, ''), array_to_string(new.flags, ' · ')), 'flag-' || new.id);
  end if;
  if new.flag_state = 'explain' and (tg_op = 'INSERT' or old.flag_state is distinct from 'explain') then
    select array_agg(id) into drv from public.profiles where status = 'active' and (driver_id = new.driver_id or id = new.created_by);
    perform private.push(null, drv, 'Wyjaśnij tankowanie ' || private.plate(new.vehicle_id), coalesce(nullif(new.flag_question, ''), 'Kierownik prosi o wyjaśnienie tankowania z ' || to_char(new.date, 'DD.MM')), 'explain-' || new.id);
  end if;
  if new.confirm_status = 'disputed' and (tg_op = 'INSERT' or old.confirm_status is distinct from 'disputed') then
    perform private.push(array['floty'], null, 'Spór o tankowanie ' || private.plate(new.vehicle_id), coalesce(new.dispute_note, 'Drugi kierowca nie potwierdził tankowania'), 'dispute-c-' || new.id);
  end if;
  return null;
end $$;
drop trigger if exists costs_notify on public.costs;
create trigger costs_notify after insert or update on public.costs
  for each row execute function public.notify_cost();

-- Spór w podwójnej obsadzie (przejęcie / zdanie)
create or replace function public.notify_booking() returns trigger
language plpgsql security definer set search_path = public, private as $$
begin
  if new.dispute_stage is not null and new.dispute_resolved_at is null and (old.dispute_stage is null or old.dispute_at is distinct from new.dispute_at) then
    perform private.push(array['floty'], null, 'Spór w obsadzie: ' || private.plate(new.vehicle_id),
      case when new.dispute_stage = 'pickup' then 'Przejęcie' else 'Zdanie' end || ' – ' || coalesce(new.dispute_note, ''), 'dispute-b-' || new.id);
  end if;
  return null;
end $$;
drop trigger if exists bookings_notify on public.bookings;
create trigger bookings_notify after update on public.bookings
  for each row execute function public.notify_booking();

-- Do potwierdzenia: sprzątanie, zmiana danych kierowcy
create or replace function public.notify_pending() returns trigger
language plpgsql security definer set search_path = public, private as $$
begin
  if tg_table_name = 'cleanings' and new.status = 'pending' then
    perform private.push(array['floty'], null, 'Sprzątanie do potwierdzenia: ' || private.plate(new.vehicle_id),
      coalesce((select full_name from public.drivers where id = new.driver_id), 'kierowca') || ' · ' || to_char(new.date, 'DD.MM'), 'clean-' || new.id);
  elsif tg_table_name = 'data_change_requests' and new.status = 'pending' then
    perform private.push(array['floty'], null, 'Zmiana danych do akceptacji',
      coalesce((select full_name from public.drivers where id = new.driver_id), 'kierowca') || ': nowy telefon ' || coalesce(new.new_value, ''), 'req-' || new.id);
  end if;
  return null;
end $$;
drop trigger if exists cleanings_notify on public.cleanings;
create trigger cleanings_notify after insert on public.cleanings for each row execute function public.notify_pending();
drop trigger if exists requests_notify on public.data_change_requests;
create trigger requests_notify after insert on public.data_change_requests for each row execute function public.notify_pending();

do $$ begin
  alter publication supabase_realtime add table public.block_overrides;
exception when duplicate_object then null; end $$;
