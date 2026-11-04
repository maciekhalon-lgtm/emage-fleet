\set ON_ERROR_STOP 0
set role authenticated;
select set_config('request.jwt.claim.sub','00000000-0000-0000-0000-00000000000a',false) \g /dev/null
insert into drivers (id, full_name) values ('11111111-0000-0000-0000-000000000004','Olek');
insert into vehicles (id, plate, make, model, km) values ('22222222-0000-0000-0000-000000000009','DW 9','FIAT','DUCATO',50000);
-- Jan + Ewa jadą DW 9
select set_config('request.jwt.claim.sub','00000000-0000-0000-0000-00000000000b',false) \g /dev/null
insert into bookings (id, vehicle_id, driver_id, co_driver_id, date_from, date_to, pickup_at, pickup_km) values ('33333333-0000-0000-0000-000000000009','22222222-0000-0000-0000-000000000009','11111111-0000-0000-0000-000000000001','11111111-0000-0000-0000-000000000002',current_date,current_date,current_date,50000);
\echo 'A kierowca próbuje przekazać -> błąd'
select transfer_vehicle('33333333-0000-0000-0000-000000000009','11111111-0000-0000-0000-000000000004',50100,'test');
select set_config('request.jwt.claim.sub','00000000-0000-0000-0000-00000000000a',false) \g /dev/null
\echo 'B bez powodu -> błąd; licznik za niski -> błąd'
select transfer_vehicle('33333333-0000-0000-0000-000000000009','11111111-0000-0000-0000-000000000004',50100,' ');
select transfer_vehicle('33333333-0000-0000-0000-000000000009','11111111-0000-0000-0000-000000000004',40000,'awaria');
\echo 'C Olek nieaktywny -> błąd'
update drivers set active=false where id='11111111-0000-0000-0000-000000000004';
select transfer_vehicle('33333333-0000-0000-0000-000000000009','11111111-0000-0000-0000-000000000004',50100,'awaria');
update drivers set active=true where id='11111111-0000-0000-0000-000000000004';
\echo 'D przekazanie OK'
select transfer_vehicle('33333333-0000-0000-0000-000000000009','11111111-0000-0000-0000-000000000004',50120,'Choroba kierowcy') is not null as ok;
select return_km, return_confirmed_at is not null as potw, return_note from bookings where id='33333333-0000-0000-0000-000000000009';
select (select km from vehicles where id='22222222-0000-0000-0000-000000000009') km_auta, driver_id='11111111-0000-0000-0000-000000000004' as olek, pickup_km is null as czeka_na_przyjecie from bookings where vehicle_id='22222222-0000-0000-0000-000000000009' and return_km is null;
select kind, km, reason from crew_changes;
\echo 'E Olek nieaktywny nie przejmie; aktywny przejmie'
update drivers set active=false where id='11111111-0000-0000-0000-000000000004';
update profiles set status='active', role='kierowca', driver_id='11111111-0000-0000-0000-000000000004' where email='szef@x' and false;
update bookings set pickup_km=50120, pickup_at=current_date where vehicle_id='22222222-0000-0000-0000-000000000009' and return_km is null;
update drivers set active=true where id='11111111-0000-0000-0000-000000000004';
update bookings set pickup_km=50120, pickup_at=current_date where vehicle_id='22222222-0000-0000-0000-000000000009' and return_km is null;
\echo 'F kierownik zdaje za Olka -> wpis zdanie w historii'
update bookings set return_km=50200, return_at=current_date where vehicle_id='22222222-0000-0000-0000-000000000009' and return_km is null;
select kind, km from crew_changes order by at;
\echo 'G kierowca nie widzi historii obsady'
select set_config('request.jwt.claim.sub','00000000-0000-0000-0000-00000000000b',false) \g /dev/null
select count(*) as widzi from crew_changes;
insert into crew_changes (kind) values ('zdanie');
