-- ============================================================================
-- Emage FLEET — licznik wpisany przez kierowcę to tylko kontrola (uruchom po 067)
--  Rzeczywisty przebieg bierzemy z GPS. Stan licznika niższy niż poprzedni zapis nie blokuje już
--  przejęcia, zdania, przekazania ani tankowania – rozbieżność widać w Kontroli liczników.
--  Zostaje tylko wymóg: licznik musi być wpisany (> 0).
-- ============================================================================

-- zdanie auta z licznikiem niższym niż przy przejęciu – dozwolone (wymagane tylko, by auto było przejęte)
alter table public.bookings drop constraint if exists return_after_pickup;
alter table public.bookings add constraint return_after_pickup check (return_km is null or pickup_km is not null);

-- tankowanie z licznikiem niższym niż ostatni zapis – dozwolone (bez błędu)
create or replace function public.check_odometer() returns trigger
language plpgsql security definer set search_path = public as $$
begin
  return new;
end $$;

-- przekazanie auta w trasie: licznik musi być wpisany, ale może być niższy niż przy przejęciu
do $$
declare def text;
begin
  select pg_get_functiondef('public.transfer_vehicle(uuid, uuid, int, text)'::regprocedure) into def;
  if position('odometer is null or odometer < b.pickup_km' in def) > 0 then
    def := replace(def, 'odometer is null or odometer < b.pickup_km', 'odometer is null or odometer <= 0');
    def := replace(def, 'Stan licznika nie może być niższy niż przy przejęciu (% km).'', b.pickup_km', 'Wpisz stan licznika.''');
    execute def;
  end if;
end $$;
