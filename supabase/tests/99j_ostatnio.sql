\set ON_ERROR_STOP 0
\echo '1 kolumny ostatnio wykonano'
select count(*) = 2 as ok_kolumny from information_schema.columns where table_schema='public' and table_name='deadlines' and column_name in ('last_done_km','last_done_date');
\echo '2 wpis w książce z wymianą rozrządu zapisuje przebieg w terminie'
insert into public.deadlines(vehicle_id, type, date, km_due, interval_months, interval_km) select id, 'Wymiana rozrządu', current_date + 30, 999999, 60, 80000 from public.vehicles order by plate limit 1;
insert into public.service_entries(vehicle_id, date, km, description, timing_change) select id, current_date - 10, 454210, 'Rozrząd', true from public.vehicles order by plate limit 1;
select last_done_km = 454210 and last_done_date = current_date - 10 as ok_ostatnio from public.deadlines where type='Wymiana rozrządu' and vehicle_id = (select id from public.vehicles order by plate limit 1) order by date limit 1;
\echo '3 przebieg z notatki'
select nullif(regexp_replace(substring('Z rejestru rozrządów: ostatnia wymiana przy 454210 km' from '(?i)ostatni\S* (?:wymiana|wykonane)[^·]*?przy ([0-9  .]+) ?km'), '[^0-9]', '', 'g'), '')::int = 454210 as ok_notatka;
delete from public.service_entries where description='Rozrząd'; delete from public.deadlines where type='Wymiana rozrządu' and km_due is not null and last_done_km = 454210;
