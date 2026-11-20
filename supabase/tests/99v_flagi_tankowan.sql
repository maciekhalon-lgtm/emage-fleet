\set ON_ERROR_STOP 0
set role authenticated;
select set_config('request.jwt.claim.sub','00000000-0000-0000-0000-00000000000a',false) \g /dev/null
insert into vehicles (id, plate, make, model, km, tank_l, weight_class) values ('22222222-0000-0000-0000-000000000701','DW 701','RENAULT','TRAFIC',60000,90,'do25'),
  ('22222222-0000-0000-0000-000000000702','DW 702','CITROEN','BERLINGO',122000,55,'do25');
\echo '1 Trafic: do pełna, 1000 km później dotankowanie 6 l w CZ, 56 km dalej do pełna 79 l -> bez „duplikatu” i „za dużo litrów”'
insert into costs (id, date, vehicle_id, category, amount, liters, odometer, full_tank) values ('44444444-0000-0000-0000-000000000701', current_date-1, '22222222-0000-0000-0000-000000000701','Paliwo',500,60,59800,true);
insert into costs (id, date, vehicle_id, category, amount, liters, odometer, full_tank) values ('44444444-0000-0000-0000-000000000702', current_date, '22222222-0000-0000-0000-000000000701','Paliwo',48,6,60824,false);
insert into costs (id, date, vehicle_id, category, amount, liters, odometer, full_tank) values ('44444444-0000-0000-0000-000000000703', current_date, '22222222-0000-0000-0000-000000000701','Paliwo',590,78.74,60880,true);
select not exists (select 1 from unnest(flags) x where x like 'Możliwy duplikat%' or x like 'Za dużo litrów%' or x like 'Drugie tankowanie%') as ok_bez_falszywych from costs where id='44444444-0000-0000-0000-000000000703';
\echo '2 próg domyślny klasy do 2,5 t (9): 84,7 l / 1080 km = 7,8 -> bez flagi spalania'
select not exists (select 1 from unnest(flags) x where x like 'Spalanie%') as ok_prog_klasy from costs where id='44444444-0000-0000-0000-000000000703';
\echo '3 Berlingo: dwa wpisy do pełna przy tym samym liczniku (49 l i 50 l) -> drugi: duplikat i za dużo litrów; pierwszy bez flag'
insert into costs (id, date, vehicle_id, category, amount, liters, odometer, full_tank) values ('44444444-0000-0000-0000-000000000710', current_date-2, '22222222-0000-0000-0000-000000000702','Paliwo',300,40,122300,true);
insert into costs (id, date, vehicle_id, category, amount, liters, odometer, full_tank) values ('44444444-0000-0000-0000-000000000711', current_date, '22222222-0000-0000-0000-000000000702','Paliwo',367,49.35,122865,true);
insert into costs (id, date, vehicle_id, category, amount, liters, odometer, full_tank) values ('44444444-0000-0000-0000-000000000712', current_date, '22222222-0000-0000-0000-000000000702','Paliwo',375,50.44,122865,true);
select not exists (select 1 from unnest(flags) x where x like 'Możliwy duplikat%' or x like 'Za dużo%') as ok_pierwszy_czysty from costs where id='44444444-0000-0000-0000-000000000711';
select exists (select 1 from unnest(flags) x where x like 'Możliwy duplikat%') and exists (select 1 from unnest(flags) x where x like 'Za dużo litrów%') as ok_drugi_flagi from costs where id='44444444-0000-0000-0000-000000000712';
