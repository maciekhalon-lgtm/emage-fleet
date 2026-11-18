\set ON_ERROR_STOP 0
reset role;
delete from events;
set role authenticated;
select set_config('request.jwt.claim.sub','00000000-0000-0000-0000-00000000000a',false) \g /dev/null
insert into vehicles (id, plate, make, model, km) values ('22222222-0000-0000-0000-000000000430','DW 430','FIAT','DUCATO',300000);
insert into fuel_card_imports (id, provider) values ('55555555-0000-0000-0000-000000000430','Orlen');
\echo '1 tankowanie z karty bez wpisu kierowcy -> powiadomienie'
insert into fuel_card_rows (id, import_id, vehicle_id, plate, tx_date, liters, amount, odometer, kind) values
  ('77777777-0000-0000-0000-000000000431','55555555-0000-0000-0000-000000000430','22222222-0000-0000-0000-000000000430','DW 430',current_date-2,70,500,300300,'fuel');
reset role;
select count(*) = 1 as ok_bez_wpisu from events where kind='karta' and ref_id='77777777-0000-0000-0000-000000000431' and alert and title like 'Tankowanie z karty bez wpisu%';
set role authenticated;
select set_config('request.jwt.claim.sub','00000000-0000-0000-0000-00000000000a',false) \g /dev/null
\echo '2 wpis zgodny z kartą -> bez powiadomienia'
insert into costs (date, vehicle_id, category, amount, liters, odometer) values (current_date-3, '22222222-0000-0000-0000-000000000430','Paliwo',480,69,300290);
reset role;
select count(*) = 1 as ok_zgodny_bez_nowego from events where kind='karta';
set role authenticated;
select set_config('request.jwt.claim.sub','00000000-0000-0000-0000-00000000000a',false) \g /dev/null
\echo '3 kierowca wpisał 40 l i zły licznik, karta 75 l -> powiadomienie'
insert into costs (date, vehicle_id, category, amount, liters, odometer) values (current_date-6, '22222222-0000-0000-0000-000000000430','Paliwo',300,40,300000);
insert into fuel_card_rows (id, import_id, vehicle_id, plate, tx_date, liters, amount, odometer, kind) values
  ('77777777-0000-0000-0000-000000000432','55555555-0000-0000-0000-000000000430','22222222-0000-0000-0000-000000000430','DW 430',current_date-6,75,540,299600,'fuel');
reset role;
select count(*) = 1 as ok_niezgodny from events where kind='karta' and ref_id='77777777-0000-0000-0000-000000000432' and body like '%40%zamiast 75%' and body like '%licznik%';
\echo '4 stary wiersz karty (40 dni) -> bez powiadomienia'
set role authenticated;
select set_config('request.jwt.claim.sub','00000000-0000-0000-0000-00000000000a',false) \g /dev/null
insert into fuel_card_rows (import_id, vehicle_id, plate, tx_date, liters, amount, kind) values ('55555555-0000-0000-0000-000000000430','22222222-0000-0000-0000-000000000430','DW 430',current_date-40,70,500,'fuel');
reset role;
select count(*) = 2 as ok_stary_pominiety from events where kind='karta';
\echo '5 kierowca dopisał tankowanie po imporcie karty, inne litry -> powiadomienie'
set role authenticated;
select set_config('request.jwt.claim.sub','00000000-0000-0000-0000-00000000000a',false) \g /dev/null
insert into fuel_card_rows (id, import_id, vehicle_id, plate, tx_date, liters, amount, odometer, kind) values
  ('77777777-0000-0000-0000-000000000433','55555555-0000-0000-0000-000000000430','22222222-0000-0000-0000-000000000430','DW 430',current_date-10,80,560,299200,'fuel');
insert into costs (date, vehicle_id, category, amount, liters, odometer) values (current_date-10, '22222222-0000-0000-0000-000000000430','Paliwo',300,50,299200);
reset role;
select count(*) = 1 as ok_po_imporcie from events where kind='karta' and ref_id='77777777-0000-0000-0000-000000000433' and title like '%inaczej niż karta%';
select title, body from events where kind='karta';
delete from events where kind='karta';
