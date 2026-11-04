\set ON_ERROR_STOP 0
set role authenticated;
select set_config('request.jwt.claim.sub','00000000-0000-0000-0000-00000000000a',false) \g /dev/null
insert into routes (id, code, name, tacho) values ('55555555-0000-0000-0000-000000000001','R1','Wrocław – Praga',true);
\echo 'dup kod -> błąd'
insert into routes (code, name) values (' r1','x');
insert into vehicles (id, plate, make, model, km) values ('22222222-0000-0000-0000-000000000077','DW 77','FIAT','DUCATO',1000);
insert into bookings (id, vehicle_id, driver_id, date_from, date_to, route_id) values ('33333333-0000-0000-0000-000000000077','22222222-0000-0000-0000-000000000077','11111111-0000-0000-0000-000000000001',current_date,current_date,'55555555-0000-0000-0000-000000000001');
select set_config('request.jwt.claim.sub','00000000-0000-0000-0000-00000000000b',false) \g /dev/null
\echo 'Jan przejmuje auto z trasą od kierownika (od 013 kierowca może zmienić trasę na aktywną)'
update bookings set pickup_km=1000, pickup_at=current_date where id='33333333-0000-0000-0000-000000000077';
select route_id is not null as trasa_zostala from bookings where id='33333333-0000-0000-0000-000000000077';
\echo 'Jan tankuje -> koszt dostaje trasę'
insert into costs (date, vehicle_id, driver_id, category, amount, liters, odometer, full_tank) values (current_date,'22222222-0000-0000-0000-000000000077','11111111-0000-0000-0000-000000000001','Paliwo',300,40,1200,true);
select route_id is not null as koszt_z_trasa from costs where vehicle_id='22222222-0000-0000-0000-000000000077';
\echo 'Jan nie może dodać trasy'
insert into routes (code, name) values ('R9','x');
select set_config('request.jwt.claim.sub','00000000-0000-0000-0000-00000000000a',false) \g /dev/null
insert into routes (id, code, name) values ('55555555-0000-0000-0000-000000000002','R2','Poznań');
update bookings set route_id='55555555-0000-0000-0000-000000000002' where id='33333333-0000-0000-0000-000000000077';
select r.code from costs c join routes r on r.id=c.route_id where c.vehicle_id='22222222-0000-0000-0000-000000000077';
\echo 'przekazanie zachowuje trasę'
select transfer_vehicle('33333333-0000-0000-0000-000000000077','11111111-0000-0000-0000-000000000004',1300,'test') is not null;
select r.code from bookings b join routes r on r.id=b.route_id where b.vehicle_id='22222222-0000-0000-0000-000000000077' and b.return_km is null;
