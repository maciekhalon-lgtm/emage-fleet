\set ON_ERROR_STOP 0
set role authenticated;
select set_config('request.jwt.claim.sub','00000000-0000-0000-0000-00000000000a',false) \g /dev/null
insert into vehicles (id, plate, make, model, km, cons_ok) values ('22222222-0000-0000-0000-000000000470','DW 470','IVECO','DAILY',58900, 9);
insert into drivers (id, full_name) values ('44444444-0000-0000-0000-000000000470','Kierowca 470');
insert into bookings (id, vehicle_id, driver_id, date_from, date_to, pickup_km, pickup_at, pickup_fuel) values ('66666666-0000-0000-0000-000000000470','22222222-0000-0000-0000-000000000470','44444444-0000-0000-0000-000000000470', current_date, current_date, 58957, now(), 100);
\echo '1 przejęcie 58957 (potwierdzony pełny bak – 100%), dotankowanie 20 l przy 59207, do pełna 66,97 l przy 59500 -> 16,0 l/100 > próg kradzieży 13,5 (próg „dobre” 9 nie flaguje)'
insert into costs (date, vehicle_id, category, amount, liters, odometer, full_tank) values (current_date, '22222222-0000-0000-0000-000000000470','Paliwo',160,20,59207,false);
insert into costs (id, date, vehicle_id, category, amount, liters, odometer, full_tank) values ('88888888-0000-0000-0000-000000000470', current_date, '22222222-0000-0000-0000-000000000470','Paliwo',505,66.97,59500,true);
select flags::text like '%Spalanie 16,0 l/100 km – powyżej progu 13,5%' as ok_od_przejecia from costs where id='88888888-0000-0000-0000-000000000470';
reset role;
delete from costs where vehicle_id='22222222-0000-0000-0000-000000000470';
delete from bookings where id='66666666-0000-0000-0000-000000000470';
\echo '2 przejęcie bez stanu paliwa -> nie jest początkiem odcinka (brak flagi spalania)'
set role authenticated;
select set_config('request.jwt.claim.sub','00000000-0000-0000-0000-00000000000a',false) \g /dev/null
insert into bookings (id, vehicle_id, driver_id, date_from, date_to, pickup_km, pickup_at) values ('66666666-0000-0000-0000-000000000471','22222222-0000-0000-0000-000000000470','44444444-0000-0000-0000-000000000470', current_date, current_date, 60000, now());
insert into costs (id, date, vehicle_id, category, amount, liters, odometer, full_tank) values ('88888888-0000-0000-0000-000000000471', current_date, '22222222-0000-0000-0000-000000000470','Paliwo',600,80,60300,true);
select not exists (select 1 from unnest(flags) x where x like 'Spalanie%') as ok_przejecie_bez_paliwa from costs where id='88888888-0000-0000-0000-000000000471';
reset role;

