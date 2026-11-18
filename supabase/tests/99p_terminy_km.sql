\set ON_ERROR_STOP 0
set role authenticated;
select set_config('request.jwt.claim.sub','00000000-0000-0000-0000-00000000000a',false) \g /dev/null
insert into vehicles (id, plate, make, model, km) values ('22222222-0000-0000-0000-000000000420','DW 420','IVECO','DAILY',50000);
\echo '1 olej z książki: tylko km, domyślnie co 15 000'
insert into service_entries (vehicle_id, date, km, description, oil_change) values ('22222222-0000-0000-0000-000000000420', current_date - 5, 50000, 'Olej', true);
select date is null and km_due = 65000 and interval_km = 15000 and interval_months is null and remind_km = 2000 as ok_olej from deadlines where vehicle_id='22222222-0000-0000-0000-000000000420' and type='Serwis olejowy';
\echo '2 ustawiony cykl 20 000 -> następny wpis liczy od niego'
update deadlines set interval_km = 20000 where vehicle_id='22222222-0000-0000-0000-000000000420' and type='Serwis olejowy';
insert into service_entries (vehicle_id, date, km, description, oil_change) values ('22222222-0000-0000-0000-000000000420', current_date, 64000, 'Olej', true);
select date is null and km_due = 84000 and interval_km = 20000 as ok_cykl from deadlines where vehicle_id='22222222-0000-0000-0000-000000000420' and type='Serwis olejowy';
\echo '3 przegląd gwarancyjny podpięty pod termin: przebieg + cykl, bez daty'
insert into deadlines (id, vehicle_id, type, date, km_due, interval_km, remind_km) values ('77777777-0000-0000-0000-000000000420','22222222-0000-0000-0000-000000000420','Przegląd gwarancyjny', null, 60000, 40000, 5000);
insert into service_entries (vehicle_id, date, km, description, deadline_id) values ('22222222-0000-0000-0000-000000000420', current_date, 61000, 'Przegląd gwarancyjny', '77777777-0000-0000-0000-000000000420');
select date is null and km_due = 101000 and last_done_km = 61000 as ok_gwar from deadlines where id='77777777-0000-0000-0000-000000000420';
\echo '4 termin bez daty i bez km -> błąd'
insert into deadlines (vehicle_id, type, date) values ('22222222-0000-0000-0000-000000000420','Wymiana rozrządu', null);
\echo '5 przegląd techniczny dalej z datą'
insert into deadlines (id, vehicle_id, type, date, interval_months) values ('77777777-0000-0000-0000-000000000421','22222222-0000-0000-0000-000000000420','Przegląd techniczny', current_date, 12);
insert into service_entries (vehicle_id, date, km, description, deadline_id) values ('22222222-0000-0000-0000-000000000420', current_date, 64100, 'Przegląd', '77777777-0000-0000-0000-000000000421');
select date = (current_date + interval '12 months')::date as ok_przeglad from deadlines where id='77777777-0000-0000-0000-000000000421';
