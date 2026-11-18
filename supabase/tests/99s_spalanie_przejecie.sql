\set ON_ERROR_STOP 0
set role authenticated;
select set_config('request.jwt.claim.sub','00000000-0000-0000-0000-00000000000a',false) \g /dev/null
insert into vehicles (id, plate, make, model, km, cons_ok) values ('22222222-0000-0000-0000-000000000470','DW 470','IVECO','DAILY',58900, 9);
insert into drivers (id, full_name) values ('44444444-0000-0000-0000-000000000470','Kierowca 470');
insert into bookings (id, vehicle_id, driver_id, date_from, date_to, pickup_km, pickup_at) values ('66666666-0000-0000-0000-000000000470','22222222-0000-0000-0000-000000000470','44444444-0000-0000-0000-000000000470', current_date, current_date, 58957, now());
\echo '1 przejęcie 58957 (pełny bak), dotankowanie 20 l przy 59207, do pełna 66,97 l przy 59852 -> 9,7 l/100 > 9'
insert into costs (date, vehicle_id, category, amount, liters, odometer, full_tank) values (current_date, '22222222-0000-0000-0000-000000000470','Paliwo',160,20,59207,false);
insert into costs (id, date, vehicle_id, category, amount, liters, odometer, full_tank) values ('88888888-0000-0000-0000-000000000470', current_date, '22222222-0000-0000-0000-000000000470','Paliwo',505,66.97,59852,true);
select flags::text like '%Spalanie 9,7 l/100 km%' as ok_od_przejecia from costs where id='88888888-0000-0000-0000-000000000470';
reset role;
delete from costs where vehicle_id='22222222-0000-0000-0000-000000000470';
delete from bookings where id='66666666-0000-0000-0000-000000000470';
