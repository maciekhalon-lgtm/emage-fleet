\set ON_ERROR_STOP 0
grant select, insert, update, delete on all tables in schema public to authenticated;
insert into auth.users values ('00000000-0000-0000-0000-00000000000a','szef@x','{}'),('00000000-0000-0000-0000-00000000000b','jan@x','{}'),('00000000-0000-0000-0000-00000000000c','ewa@x','{}');
insert into drivers (id, full_name) values ('11111111-0000-0000-0000-000000000001','Jan'),('11111111-0000-0000-0000-000000000002','Ewa'),('11111111-0000-0000-0000-000000000003','Zbyszek');
update profiles set status='active', role='floty' where email='szef@x';
update profiles set status='active', role='kierowca', driver_id='11111111-0000-0000-0000-000000000001' where email='jan@x';
update profiles set status='active', role='kierowca', driver_id='11111111-0000-0000-0000-000000000002' where email='ewa@x';
insert into vehicles (id, plate, make, model, km) values ('22222222-0000-0000-0000-000000000002','DW 4VS51','FIAT','DUCATO',200000),('22222222-0000-0000-0000-000000000001','DW 1','FIAT','DUCATO',100000);
set role authenticated;
select set_config('request.jwt.claim.sub','00000000-0000-0000-0000-00000000000b',false) \g /dev/null
\echo '1 Jan przejmuje z Ewą i próbuje od razu wpisać potwierdzenie -> zignorowane'
insert into bookings (id, vehicle_id, driver_id, co_driver_id, date_from, date_to, pickup_at, pickup_km, pickup_fuel, pickup_confirmed_at)
 values ('33333333-0000-0000-0000-000000000001','22222222-0000-0000-0000-000000000002','11111111-0000-0000-0000-000000000001','11111111-0000-0000-0000-000000000002','2026-11-07','2026-11-07','2026-11-07',200000,100,now());
select pickup_confirmed_at is null as czeka from bookings;
\echo '2 Jan sam potwierdza -> błąd; Jan próbuje update pickup_confirmed_at -> zignorowane'
select confirm_booking('33333333-0000-0000-0000-000000000001','pickup',true);
update bookings set pickup_confirmed_at=now() where id='33333333-0000-0000-0000-000000000001';
select pickup_confirmed_at is null as nadal_czeka from bookings;
\echo '3 Jan tankuje z confirm_status none -> wymuszone pending'
insert into costs (id,date,vehicle_id,driver_id,co_driver_id,category,amount,liters,odometer,full_tank,confirm_status) values ('44444444-0000-0000-0000-000000000001','2026-11-07','22222222-0000-0000-0000-000000000002','11111111-0000-0000-0000-000000000001','11111111-0000-0000-0000-000000000002','Paliwo',400,60,200300,true,'none');
select confirm_status from costs;
update costs set confirm_status='none' where id='44444444-0000-0000-0000-000000000001';
select confirm_status as po_probie_obejscia from costs;
select set_config('request.jwt.claim.sub','00000000-0000-0000-0000-00000000000c',false) \g /dev/null
\echo '4 Ewa potwierdza przejęcie, kwestionuje tankowanie'
select confirm_booking('33333333-0000-0000-0000-000000000001','pickup',true);
select confirm_cost('44444444-0000-0000-0000-000000000001',false,'Było 58 l');
select (select pickup_confirmed_at is not null from bookings) as przejecie_ok, confirm_status, dispute_note from costs;
\echo '5 Ewa (w obsadzie) próbuje wziąć inne auto -> błąd'
insert into bookings (vehicle_id, driver_id, date_from, date_to, pickup_at, pickup_km) values ('22222222-0000-0000-0000-000000000001','11111111-0000-0000-0000-000000000002','2026-11-07','2026-11-07','2026-11-07',100000);
\echo '6 Ewa zdaje (return_by podmienione na Jana -> baza wpisze Ewę)'
update bookings set return_at='2026-11-07', return_km=200350, return_fuel=50, return_by='00000000-0000-0000-0000-00000000000b' where id='33333333-0000-0000-0000-000000000001';
select return_by = '00000000-0000-0000-0000-00000000000c' as zdala_ewa from bookings where id='33333333-0000-0000-0000-000000000001';
\echo '7 Ewa próbuje sama potwierdzić zdanie -> błąd'
select confirm_booking('33333333-0000-0000-0000-000000000001','return',true);
select set_config('request.jwt.claim.sub','00000000-0000-0000-0000-00000000000a',false) \g /dev/null
\echo '8 inny kierowca przed potwierdzeniem zdania -> błąd'
insert into bookings (vehicle_id, driver_id, date_from, date_to, pickup_at, pickup_km) values ('22222222-0000-0000-0000-000000000002','11111111-0000-0000-0000-000000000003','2026-11-07','2026-11-07','2026-11-07',200350);
select set_config('request.jwt.claim.sub','00000000-0000-0000-0000-00000000000b',false) \g /dev/null
\echo '9 Jan potwierdza zdanie'
select confirm_booking('33333333-0000-0000-0000-000000000001','return',true);
select return_confirmed_at is not null as zdanie_ok from bookings;
select set_config('request.jwt.claim.sub','00000000-0000-0000-0000-00000000000a',false) \g /dev/null
\echo '10 teraz auto wolne (ok); kierownik rozstrzyga spór'
insert into bookings (vehicle_id, driver_id, date_from, date_to, pickup_at, pickup_km) values ('22222222-0000-0000-0000-000000000002','11111111-0000-0000-0000-000000000003','2026-11-07','2026-11-07','2026-11-07',200350);
select count(*) as rezerwacje from bookings;
select resolve_dispute('cost','44444444-0000-0000-0000-000000000001');
select confirm_status from costs;
