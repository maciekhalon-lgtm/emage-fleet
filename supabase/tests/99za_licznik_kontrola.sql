\set ON_ERROR_STOP 0
set role authenticated;
select set_config('request.jwt.claim.sub','00000000-0000-0000-0000-00000000000a',false) \g /dev/null
insert into vehicles (id, plate, make, model, km) values ('22222222-0000-0000-0000-000000000680','DW 680','IVECO','DAILY',100000);
insert into drivers (id, full_name) values ('44444444-0000-0000-0000-000000000680','Kierowca 680');
insert into bookings (id, vehicle_id, driver_id, date_from, date_to, pickup_km, pickup_at) values ('66666666-0000-0000-0000-000000000680','22222222-0000-0000-0000-000000000680','44444444-0000-0000-0000-000000000680', current_date, current_date, 100500, now());
\echo '1 zdanie z licznikiem niższym niż przy przejęciu – zapisuje się'
update bookings set return_km = 100400, return_at = now() where id='66666666-0000-0000-0000-000000000680';
select return_km = 100400 as ok_zdanie_nizej from bookings where id='66666666-0000-0000-0000-000000000680';
\echo '2 tankowanie z licznikiem niższym niż ostatni zapis – zapisuje się'
insert into costs (id, date, vehicle_id, category, amount, liters, odometer, full_tank) values ('88888888-0000-0000-0000-000000000680', current_date, '22222222-0000-0000-0000-000000000680','Paliwo',300,40,100100,true);
select exists (select 1 from costs where id='88888888-0000-0000-0000-000000000680') as ok_tankowanie_nizej;
reset role;
\echo '3 przekazanie: bez sprawdzania „niższy niż przy przejęciu”'
select position('odometer < b.pickup_km' in pg_get_functiondef('public.transfer_vehicle(uuid, uuid, int, text)'::regprocedure)) = 0 as ok_przekazanie;
delete from costs where vehicle_id='22222222-0000-0000-0000-000000000680';
delete from bookings where vehicle_id='22222222-0000-0000-0000-000000000680';
