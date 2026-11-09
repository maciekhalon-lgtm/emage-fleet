\set ON_ERROR_STOP 0
set role authenticated;
select set_config('request.jwt.claim.sub','00000000-0000-0000-0000-00000000000d',false) \g /dev/null
\echo '1 kierownik serwisu dodaje warsztat i wizytę'
insert into vehicles (id, plate, make, model, km) values ('22222222-0000-0000-0000-0000000000f1','DW WS1','FIAT','DUCATO',80000);
insert into workshops (id, name, phone) values ('77777777-0000-0000-0000-0000000000f1','Auto-Serwis Kowalczyk','+48 600 100 200');
insert into service_visits (id, vehicle_id, workshop_id, date, time, reason) values ('88888888-0000-0000-0000-0000000000f1','22222222-0000-0000-0000-0000000000f1','77777777-0000-0000-0000-0000000000f1','2026-11-12','08:00','Serwis olejowy');
select count(*) = 1 as ok_wizyta from service_visits;
\echo '2 auto w warsztacie -> status serwis; zakończona -> aktywny'
update service_visits set status = 'w_warsztacie' where id = '88888888-0000-0000-0000-0000000000f1';
select status = 'serwis' as ok_w_serwisie from vehicles where id = '22222222-0000-0000-0000-0000000000f1';
update service_visits set status = 'zakonczona' where id = '88888888-0000-0000-0000-0000000000f1';
select status = 'aktywny' as ok_po_wizycie from vehicles where id = '22222222-0000-0000-0000-0000000000f1';
\echo '3 zła godzina / brak powodu -> błąd'
insert into service_visits (vehicle_id, date, time, reason) values ('22222222-0000-0000-0000-0000000000f1','2026-11-13','8 rano','x');
insert into service_visits (vehicle_id, date, reason) values ('22222222-0000-0000-0000-0000000000f1','2026-11-13','  ');
\echo '4 kierowca nie widzi'
select set_config('request.jwt.claim.sub','00000000-0000-0000-0000-00000000000b',false) \g /dev/null
select count(*) = 0 as ok_kierowca_nie_widzi from service_visits;
reset role;
