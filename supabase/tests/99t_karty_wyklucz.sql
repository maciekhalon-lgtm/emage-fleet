\set ON_ERROR_STOP 0
reset role;
delete from events;
set role authenticated;
select set_config('request.jwt.claim.sub','00000000-0000-0000-0000-00000000000a',false) \g /dev/null
insert into vehicles (id, plate, make, model, km) values ('22222222-0000-0000-0000-000000000500','DW 500','FIAT','DUCATO',100000);
insert into fuel_card_imports (id, provider) values ('55555555-0000-0000-0000-000000000500','Orlen');
\echo '1 opłata z karty -> koszt auta; wykluczenie -> koszt znika, przywrócenie -> wraca'
insert into fuel_card_rows (id, import_id, vehicle_id, plate, tx_date, amount, product, kind) values
  ('77777777-0000-0000-0000-000000000501','55555555-0000-0000-0000-000000000500','22222222-0000-0000-0000-000000000500','DW 500',current_date-3,40,'Parking','other');
select count(*) = 1 as ok_koszt_jest from costs where vehicle_id='22222222-0000-0000-0000-000000000500' and category='Opłaty i parkingi';
update fuel_card_rows set excluded = true, excluded_note = 'prywatne' where id='77777777-0000-0000-0000-000000000501';
select count(*) = 0 as ok_koszt_usuniety from costs where vehicle_id='22222222-0000-0000-0000-000000000500' and category='Opłaty i parkingi';
select excluded and excluded_at is not null and excluded_by is not null and cost_id is null and excluded_note = 'prywatne' as ok_znacznik from fuel_card_rows where id='77777777-0000-0000-0000-000000000501';
update fuel_card_rows set excluded = false where id='77777777-0000-0000-0000-000000000501';
select count(*) = 1 as ok_koszt_wrocil from costs where vehicle_id='22222222-0000-0000-0000-000000000500' and category='Opłaty i parkingi';
select not excluded and excluded_note is null and cost_id is not null as ok_przywrocone from fuel_card_rows where id='77777777-0000-0000-0000-000000000501';
\echo '2 tankowanie z karty bez wpisu -> powiadomienie; wykluczenie kasuje powiadomienie'
insert into fuel_card_rows (id, import_id, vehicle_id, plate, tx_date, liters, amount, odometer, kind) values
  ('77777777-0000-0000-0000-000000000502','55555555-0000-0000-0000-000000000500','22222222-0000-0000-0000-000000000500','DW 500',current_date-2,60,450,100300,'fuel');
reset role;
select count(*) = 1 as ok_powiadomienie from events where kind='karta' and ref_id='77777777-0000-0000-0000-000000000502';
set role authenticated;
select set_config('request.jwt.claim.sub','00000000-0000-0000-0000-00000000000a',false) \g /dev/null
update fuel_card_rows set excluded = true where id='77777777-0000-0000-0000-000000000502';
reset role;
select count(*) = 0 as ok_powiadomienie_skasowane from events where kind='karta' and ref_id='77777777-0000-0000-0000-000000000502';
\echo '3 wpis kierowcy po wykluczeniu karty -> bez powiadomienia'
set role authenticated;
select set_config('request.jwt.claim.sub','00000000-0000-0000-0000-00000000000a',false) \g /dev/null
insert into costs (date, vehicle_id, category, amount, liters, odometer) values (current_date-2, '22222222-0000-0000-0000-000000000500','Paliwo',200,20,100300);
reset role;
select count(*) = 0 as ok_bez_porownania from events where kind='karta' and ref_id='77777777-0000-0000-0000-000000000502';
reset role;
