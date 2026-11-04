\set ON_ERROR_STOP 0
set role authenticated;
select set_config('request.jwt.claim.sub','00000000-0000-0000-0000-00000000000a',false) \g /dev/null
insert into vehicles (id, plate, make, model, km) values ('22222222-0000-0000-0000-000000000090','DW 90','FIAT','DUCATO',300000);
\echo '1 rozrząd bez przebiegu -> błąd'
insert into service_entries (vehicle_id, date, description, timing_change) values ('22222222-0000-0000-0000-000000000090', current_date, 'Rozrząd', true);
\echo '2 rozrząd przy 300 000 -> następny przy 380 000, przypomnienie 5000'
insert into service_entries (vehicle_id, date, km, description, timing_change) values ('22222222-0000-0000-0000-000000000090', current_date, 300000, 'Rozrząd', true);
select km_due = 380000 and remind_km = 5000 and interval_km = 80000 as ok_rozrzad from deadlines where vehicle_id='22222222-0000-0000-0000-000000000090' and type='Wymiana rozrządu';
