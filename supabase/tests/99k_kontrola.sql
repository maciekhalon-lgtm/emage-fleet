\set ON_ERROR_STOP 0
\echo '1 tabela odo_gps tylko do odczytu'
select to_regclass('public.odo_gps') is not null
   and not exists (select 1 from pg_policies where tablename = 'odo_gps' and cmd <> 'SELECT') as ok_odo_gps;
\echo '2 godzina przejęcia ustawiana przy wpisaniu licznika'
select count(*) = 2 as ok_kolumny_ts from information_schema.columns where table_schema='public' and table_name='bookings' and column_name in ('pickup_ts','return_ts');
select has_function_privilege('public.bookings_odo_ts()', 'execute') as ok_funkcja_ts;
