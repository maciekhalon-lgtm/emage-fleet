\set ON_ERROR_STOP 0
\echo '1 tabele sprzątania i inspekcji usunięte (migracja 026)'
select to_regclass('public.cleanings') is null and to_regclass('public.inspections') is null as ok_usuniete;
select not exists (select 1 from information_schema.columns where table_name = 'vehicles' and column_name = 'last_clean') as ok_bez_last_clean;
\echo '2 zmiana danych kierowcy nadal wysyła powiadomienie'
select count(*) > 0 as ok_wyzwalacz from pg_trigger where tgname = 'requests_notify';
