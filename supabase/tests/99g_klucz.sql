\set ON_ERROR_STOP 0
\echo '1 klucz wylosowany, 64 znaki'
select length(token) = 64 as ok_klucz from private.cron_token;
\echo '2 sprawdzanie klucza'
select public.cron_token_ok((select token from private.cron_token)) as ok_dobry, not public.cron_token_ok('zly') as ok_zly, not public.cron_token_ok('') as ok_pusty;
\echo '3 zalogowany użytkownik nie czyta klucza ani nie sprawdza'
set role authenticated;
select set_config('request.jwt.claim.sub','00000000-0000-0000-0000-00000000000a',false) \g /dev/null
select token from private.cron_token;
select public.cron_token_ok('x');
reset role;
