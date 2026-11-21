\set ON_ERROR_STOP 0
set role authenticated;
select set_config('request.jwt.claim.sub','00000000-0000-0000-0000-00000000000a',false) \g /dev/null
insert into drivers (id, full_name) values ('11111111-0000-0000-0000-000000000901','Krzysztof B'), ('11111111-0000-0000-0000-000000000902','Patryk B');
insert into vehicles (id, plate, make, model, km, tank_l) values ('22222222-0000-0000-0000-000000000901','DW 901','FIAT','DUCATO',200000,90);
-- Krzysztof: przejął pełny, zdał niepełny
insert into bookings (id, vehicle_id, driver_id, date_from, date_to, pickup_at, pickup_km, pickup_fuel, pickup_ts, return_at, return_km, return_fuel, return_ts) values
  ('33333333-0000-0000-0000-000000000901','22222222-0000-0000-0000-000000000901','11111111-0000-0000-0000-000000000901',current_date-3,current_date-3,current_date-3,200000,100, now()-interval '3 days', current_date-3, 200400, 0, now()-interval '3 days'+interval '10 hours');
reset role;
-- znaczniki czasu ustawia baza (now()) – w teście cofamy je o kilka dni
update bookings set pickup_ts = now()-interval '3 days', return_ts = now()-interval '3 days'+interval '10 hours' where id='33333333-0000-0000-0000-000000000901';
\echo '1 przejęcie z pełnym bakiem, bez poprzedniego zdania niepełnego -> bez wątpliwości'
select not pickup_fuel_doubt as ok_pierwsze_pelne from bookings where id='33333333-0000-0000-0000-000000000901';
set role authenticated;
\echo '2 Patryk przejmuje „pełny”, a nikt nie tankował do pełna -> wątpliwość + powiadomienie'
insert into bookings (id, vehicle_id, driver_id, date_from, date_to, pickup_at, pickup_km, pickup_fuel, pickup_ts) values
  ('33333333-0000-0000-0000-000000000902','22222222-0000-0000-0000-000000000901','11111111-0000-0000-0000-000000000902',current_date-2,current_date-2,current_date-2,200400,100, now()-interval '2 days');
reset role;
select pickup_fuel_doubt as ok_watpliwosc from bookings where id='33333333-0000-0000-0000-000000000902';
select exists (select 1 from events where kind='bak' and ref_id='33333333-0000-0000-0000-000000000902') as ok_powiadomienie;
\echo '3 kierowca nie może sam skasować wątpliwości'
update bookings set pickup_fuel_doubt = false, pickup_note = 'x' where id='33333333-0000-0000-0000-000000000902';
select pickup_fuel_doubt as ok_nie_skasowal from bookings where id='33333333-0000-0000-0000-000000000902';
\echo '4 tankowanie do pełna przy wątpliwym przejęciu: odcinek liczony od pełnego Krzysztofa nie od przejęcia Patryka'
set role authenticated;
insert into costs (id, date, vehicle_id, driver_id, category, amount, liters, odometer, full_tank) values
  ('44444444-0000-0000-0000-000000000901', current_date-2, '22222222-0000-0000-0000-000000000901','11111111-0000-0000-0000-000000000902','Paliwo', 600, 100, 200500, true);
reset role;
-- 100 l / 500 km = 20 l/100 (od pełnego przejęcia Krzysztofa przy 200000), a nie 100 l / 100 km
select exists (select 1 from costs where id='44444444-0000-0000-0000-000000000901' and array_to_string(flags, '|') like '%Spalanie 20,0%') as ok_od_pelnego_krzysztofa;
\echo '5 kierownik: „był pełny” -> wątpliwość zdjęta, przejęcie jest początkiem odcinka'
set role authenticated;
select resolve_pickup_fuel('33333333-0000-0000-0000-000000000902', true);
reset role;
select not pickup_fuel_doubt and pickup_fuel = 100 as ok_wyjasnione from bookings where id='33333333-0000-0000-0000-000000000902';
select exists (select 1 from costs where id='44444444-0000-0000-0000-000000000901' and array_to_string(flags, '|') like '%Spalanie 100,0%') as ok_przeliczone_od_przejecia;
\echo '6 „był niepełny” -> stan 0'
set role authenticated;
select resolve_pickup_fuel('33333333-0000-0000-0000-000000000902', false);
reset role;
select pickup_fuel = 0 and not pickup_fuel_doubt as ok_niepelny from bookings where id='33333333-0000-0000-0000-000000000902';
\echo '7 po tankowaniu do pełna kolejne przejęcie „pełny” jest bez wątpliwości'
update bookings set return_at = current_date-2, return_km = 200500, return_fuel = 0, return_ts = now()-interval '2 days'+interval '1 hour' where id='33333333-0000-0000-0000-000000000902';
set role authenticated;
insert into costs (id, date, vehicle_id, driver_id, category, amount, liters, odometer, full_tank) values
  ('44444444-0000-0000-0000-000000000902', current_date-1, '22222222-0000-0000-0000-000000000901','11111111-0000-0000-0000-000000000901','Paliwo', 300, 50, 200510, true);
insert into bookings (id, vehicle_id, driver_id, date_from, date_to, pickup_at, pickup_km, pickup_fuel, pickup_ts) values
  ('33333333-0000-0000-0000-000000000903','22222222-0000-0000-0000-000000000901','11111111-0000-0000-0000-000000000901',current_date,current_date,current_date,200510,100, now());
reset role;
select not pickup_fuel_doubt as ok_po_tankowaniu from bookings where id='33333333-0000-0000-0000-000000000903';
\echo '8 powiadomienie o zdaniu zawiera stan baku'
select exists (select 1 from events where kind='zdanie' and ref_id='33333333-0000-0000-0000-000000000902' and body like '%bak niepełny%') as ok_zdanie_bak;
