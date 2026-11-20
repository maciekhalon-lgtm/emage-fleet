-- ============================================================================
-- Emage FLEET — kierowca zmienia auto z grafiku (uruchom po 050)
-- Kierowca ma w grafiku auto, którym nie może jechać → wybiera inne wolne auto.
-- Przydział w grafiku jest zmieniany (nie dublowany): nowe auto, zapamiętane poprzednie i powód.
-- Kierownik floty dostaje jedno powiadomienie (dzwonek + telefon): „X wybrał inny pojazd: A → B · powód”.
-- Kierowca bez przydziału, który sam bierze auto – przydział zakłada się sam (jak dotąd), bez powiadomienia.
-- ============================================================================
alter table public.bookings add column if not exists orig_vehicle_id uuid references public.vehicles(id) on delete set null;
alter table public.bookings add column if not exists swap_reason text;
alter table public.bookings add column if not exists swapped_at timestamptz;

alter table public.events drop constraint if exists events_kind_check;
alter table public.events add constraint events_kind_check check (kind in ('zdanie','tankowanie','usterka','karta','zmiana'));

create or replace function public.driver_swap_vehicle(p_booking uuid, p_vehicle uuid, p_reason text)
returns void language plpgsql security definer set search_path = public, private as $$
declare b public.bookings; v public.vehicles; drv uuid := public.app_driver_id(); old_plate text; t text; body text;
begin
  select * into b from public.bookings where id = p_booking;
  if b.id is null then raise exception 'Nie ma takiego przydziału'; end if;
  if drv is null or drv not in (b.driver_id, coalesce(b.co_driver_id, b.driver_id)) then raise exception 'To nie jest Twój przydział'; end if;
  if b.pickup_km is not null or b.return_km is not null then raise exception 'Auto z tego przydziału jest już przejęte'; end if;
  if not (current_date between b.date_from and b.date_to) then raise exception 'Zmienić auto można tylko w dniu przydziału'; end if;
  if p_vehicle = b.vehicle_id then return; end if;
  select * into v from public.vehicles where id = p_vehicle;
  if v.id is null or v.status in ('wycofany', 'serwis') then raise exception 'To auto nie jest dostępne'; end if;
  if exists (select 1 from public.bookings x where x.vehicle_id = p_vehicle and x.id <> b.id and x.return_km is null
               and (x.pickup_km is not null or current_date between x.date_from and x.date_to)) then
    raise exception 'To auto jest zajęte albo przydzielone komuś innemu';
  end if;
  old_plate := private.plate(b.vehicle_id);
  update public.bookings set orig_vehicle_id = coalesce(orig_vehicle_id, vehicle_id), vehicle_id = p_vehicle,
         swap_reason = left(nullif(btrim(p_reason), ''), 200), swapped_at = now()
   where id = b.id;
  t := private.drv_name(drv) || ' wybrał(a) inny pojazd: ' || old_plate || ' → ' || private.plate(p_vehicle);
  body := coalesce(nullif(btrim(p_reason), ''), 'bez podanego powodu') || ' · ' || to_char(current_date, 'DD.MM');
  perform private.event_add('zmiana', p_vehicle, drv, t, body, b.id, true);
  begin perform private.push(array['floty'], null, left(t, 120), left(body, 140), 'swap-' || b.id); exception when others then null; end;
end $$;
revoke all on function public.driver_swap_vehicle(uuid, uuid, text) from public;
grant execute on function public.driver_swap_vehicle(uuid, uuid, text) to authenticated;
