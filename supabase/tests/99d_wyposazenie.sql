\set ON_ERROR_STOP 0
set role authenticated;
select set_config('request.jwt.claim.sub','00000000-0000-0000-0000-00000000000a',false) \g /dev/null
insert into vehicles (id, plate, make, model, km) values ('22222222-0000-0000-0000-0000000000d1','DW WY1','FIAT','DUCATO',120000);
\echo '1 gaśnica z datą, apteczka brak'
insert into equipment (vehicle_id, item, ok, valid_until, checked_at) values ('22222222-0000-0000-0000-0000000000d1','Gaśnica',true,'2027-03-31','2026-11-08');
insert into equipment (vehicle_id, item, ok, checked_at) values ('22222222-0000-0000-0000-0000000000d1','Apteczka',false,'2026-11-08');
select count(*) = 2 as ok_dodane from equipment where vehicle_id = '22222222-0000-0000-0000-0000000000d1';
\echo '2 ta sama rzecz drugi raz -> błąd'
insert into equipment (vehicle_id, item) values ('22222222-0000-0000-0000-0000000000d1','Gaśnica');
\echo '3 kierowca nie widzi'
select set_config('request.jwt.claim.sub','00000000-0000-0000-0000-00000000000b',false) \g /dev/null
select count(*) = 0 as ok_kierowca_nie_widzi from equipment;
reset role;
\echo '4 usunięcie auta usuwa wyposażenie'
delete from vehicles where id = '22222222-0000-0000-0000-0000000000d1';
select count(*) = 0 as ok_kaskada from equipment where vehicle_id = '22222222-0000-0000-0000-0000000000d1';
