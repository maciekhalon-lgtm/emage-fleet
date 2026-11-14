\set ON_ERROR_STOP 0
reset role; truncate net._calls;
-- czyste auto i kierowca Jan bez aktywnego auta
update bookings set return_km=coalesce(return_km, pickup_km+1), return_at=coalesce(return_at,current_date), return_confirmed_at=now() where pickup_km is not null and return_km is null;
insert into vehicles (id, plate, make, model, km, cons_good, cons_ok) values ('22222222-0000-0000-0000-000000000014','DW 14','FIAT','DUCATO',10000, 9, 10.5);
insert into deadlines (vehicle_id, type, date) values ('22222222-0000-0000-0000-000000000014','Przegląd techniczny', current_date - 2);
set role authenticated;
select set_config('request.jwt.claim.sub','00000000-0000-0000-0000-00000000000b',false) \g /dev/null
\echo '1 BLOKADA: Jan przejmuje auto po przeglądzie -> błąd'
insert into bookings (id, vehicle_id, driver_id, date_from, date_to, pickup_at, pickup_km) values ('33333333-0000-0000-0000-000000000014','22222222-0000-0000-0000-000000000014','11111111-0000-0000-0000-000000000001',current_date,current_date,current_date,10000);
select vehicle_block('22222222-0000-0000-0000-000000000014');
\echo '2 kierowca nie doda zgody; kierownik dodaje zgodę -> Jan przejmuje'
insert into block_overrides (vehicle_id, reason) values ('22222222-0000-0000-0000-000000000014','x');
select set_config('request.jwt.claim.sub','00000000-0000-0000-0000-00000000000a',false) \g /dev/null
insert into block_overrides (vehicle_id, reason) values ('22222222-0000-0000-0000-000000000014','Jedzie na przegląd');
select set_config('request.jwt.claim.sub','00000000-0000-0000-0000-00000000000b',false) \g /dev/null
insert into bookings (id, vehicle_id, driver_id, date_from, date_to, pickup_at, pickup_km) values ('33333333-0000-0000-0000-000000000014','22222222-0000-0000-0000-000000000014','11111111-0000-0000-0000-000000000001',current_date,current_date,current_date,10000);
select count(*) as przejete from bookings where id='33333333-0000-0000-0000-000000000014';
\echo '3 BEZ KONTROLI PARAGONÓW (037): tankowanie kierowcy zapisuje się bez zdjęcia'
select set_config('request.jwt.claim.sub','00000000-0000-0000-0000-00000000000b',false) \g /dev/null
insert into costs (id, date, vehicle_id, driver_id, category, amount, liters, odometer, full_tank) values ('cccccccc-0000-0000-0000-000000000001',current_date,'22222222-0000-0000-0000-000000000014','11111111-0000-0000-0000-000000000001','Paliwo',600,100,10300,true);
select count(*) = 1 as ok_bez_zdjecia from costs where id='cccccccc-0000-0000-0000-000000000001';
\echo '4 SYGNAŁY: 100 l > bak 90'
select flags, flag_state from costs where id='cccccccc-0000-0000-0000-000000000001';
\echo '5 drugie tankowanie zaraz + Ewa (nie ma auta)'
select set_config('request.jwt.claim.sub','00000000-0000-0000-0000-00000000000c',false) \g /dev/null
insert into costs (id, date, vehicle_id, driver_id, category, amount, liters, odometer, full_tank) values ('cccccccc-0000-0000-0000-000000000002',current_date,'22222222-0000-0000-0000-000000000014','11111111-0000-0000-0000-000000000002','Paliwo',300,50,10900,true);
\echo '6 kierownik prosi o wyjaśnienie, Jan odpowiada, kierowca nie zmieni stanu sam'
select set_config('request.jwt.claim.sub','00000000-0000-0000-0000-00000000000a',false) \g /dev/null
update costs set flag_state='explain', flag_question='Dlaczego 100 l?' where id='cccccccc-0000-0000-0000-000000000001';
select set_config('request.jwt.claim.sub','00000000-0000-0000-0000-00000000000b',false) \g /dev/null
update costs set flag_state='ok' where id='cccccccc-0000-0000-0000-000000000001';
select flag_state as nadal_explain from costs where id='cccccccc-0000-0000-0000-000000000001';
select explain_cost('cccccccc-0000-0000-0000-000000000001','Kanister do agregatu');
select flag_state, flag_reply from costs where id='cccccccc-0000-0000-0000-000000000001';
select set_config('request.jwt.claim.sub','00000000-0000-0000-0000-00000000000a',false) \g /dev/null
update costs set flag_state='ok' where id='cccccccc-0000-0000-0000-000000000001';
select flag_state, flag_by is not null as kto from costs where id='cccccccc-0000-0000-0000-000000000001';
\echo '7 OPONY z serwisu'
insert into service_entries (vehicle_id, date, description, tires_set) values ('22222222-0000-0000-0000-000000000014', current_date, 'Opony zimowe', 'zimowe');
select tires from vehicles where id='22222222-0000-0000-0000-000000000014';
\echo '8 USTERKA STOP -> push'
insert into issues (vehicle_id, title, severity, status, date) values ('22222222-0000-0000-0000-000000000014','Hamulce','stop','nowe',current_date);
reset role;
select body->>'title' as tytul, body->'roles' as role, body->'users' as users, headers->>'x-cron-secret' as s from net._calls;
select flags from costs where id='cccccccc-0000-0000-0000-000000000002';
