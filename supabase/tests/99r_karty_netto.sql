\set ON_ERROR_STOP 0
reset role;
delete from fuel_card_rows;
set role authenticated;
select set_config('request.jwt.claim.sub','00000000-0000-0000-0000-00000000000a',false) \g /dev/null
insert into vehicles (id, plate, make, model, km) values ('22222222-0000-0000-0000-000000000460','DW 460','FIAT','DUCATO',100000);
insert into fuel_card_imports (id, provider) values ('55555555-0000-0000-0000-000000000460','Orlen');
insert into fuel_card_rows (import_id, vehicle_id, plate, tx_date, liters, amount, amount_net, vat_rate, kind)
  select '55555555-0000-0000-0000-000000000460','22222222-0000-0000-0000-000000000460','DW 460', current_date - 40 - g, 100, 615, 500, 23, 'fuel' from generate_series(1,5) g;
\echo '1 średnia netto z kart (5,00 zł/l), tankowanie 8,00 brutto -> 6,50 netto -> uwaga z kart'
insert into costs (id, date, vehicle_id, category, amount, liters, odometer) values ('88888888-0000-0000-0000-000000000460', current_date, '22222222-0000-0000-0000-000000000460','Paliwo',400,50,100100);
select flags::text like '%Cena 6,50 zł/l netto – średnia 5,00 zł/l netto%' as ok_srednia_z_kart from costs where id='88888888-0000-0000-0000-000000000460';
select flags from costs where id='88888888-0000-0000-0000-000000000460';
reset role;
delete from costs where vehicle_id='22222222-0000-0000-0000-000000000460';
delete from fuel_card_imports where id='55555555-0000-0000-0000-000000000460';
