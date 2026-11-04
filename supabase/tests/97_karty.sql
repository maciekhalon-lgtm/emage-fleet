\set ON_ERROR_STOP 0
set role authenticated;
select set_config('request.jwt.claim.sub','00000000-0000-0000-0000-00000000000a',false) \g /dev/null
insert into vehicles (id, plate, make, model, km) values ('22222222-0000-0000-0000-000000000097','DW 97','FIAT','DUCATO',300000);
\echo '1 kierownik floty importuje zestawienie'
insert into fuel_card_imports (id, provider, rows_total, rows_ours) values ('55555555-0000-0000-0000-000000000097','Orlen',3,1);
insert into fuel_card_rows (import_id, vehicle_id, plate, tx_date, liters, amount, odometer) values ('55555555-0000-0000-0000-000000000097','22222222-0000-0000-0000-000000000097','DW 97',current_date,80.5,520.30,300400);
select count(*) = 1 as ok_import from fuel_card_rows;
\echo '2 kierowca nie widzi ani nie dodaje'
select set_config('request.jwt.claim.sub','00000000-0000-0000-0000-00000000000b',false) \g /dev/null
select count(*) = 0 as ok_kierowca_nie_widzi from fuel_card_rows;
insert into fuel_card_imports (provider) values ('X');
\echo '3 usunięcie importu usuwa wiersze'
select set_config('request.jwt.claim.sub','00000000-0000-0000-0000-00000000000a',false) \g /dev/null
delete from fuel_card_imports where id = '55555555-0000-0000-0000-000000000097';
select count(*) = 0 as ok_usuniete from fuel_card_rows;
reset role;
