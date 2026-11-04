\set ON_ERROR_STOP 0
-- szef (a) = kierownik floty; jan (b) i ewa (c) = kierowcy (z 10_obsada.sql)
set role authenticated;
select set_config('request.jwt.claim.sub','00000000-0000-0000-0000-00000000000a',false) \g /dev/null
insert into routes (id, code, name) values ('44444444-0000-0000-0000-000000000096','96K','Testowa');
select set_config('request.jwt.claim.sub','00000000-0000-0000-0000-00000000000b',false) \g /dev/null
\echo '1 kierowca zaznacza trasę (dzień w grafiku = dziś)'
insert into loadings (route_id, driver_id) select '44444444-0000-0000-0000-000000000096', public.app_driver_id();
select count(*) = 1 as ok_zaladunek from loadings where route_id = '44444444-0000-0000-0000-000000000096';
\echo '2 kierowca nie wpisze za kogoś innego -> błąd'
insert into loadings (route_id, driver_id) select '44444444-0000-0000-0000-000000000096', id from drivers where id <> public.app_driver_id() limit 1;
\echo '3 kierowca nie wpisze na inny dzień -> błąd'
insert into loadings (route_id, driver_id, for_date) select '44444444-0000-0000-0000-000000000096', public.app_driver_id(), current_date + 5;
\echo '4 drugi kierowca nie usunie cudzego wpisu'
select set_config('request.jwt.claim.sub','00000000-0000-0000-0000-00000000000c',false) \g /dev/null
delete from loadings where route_id = '44444444-0000-0000-0000-000000000096';
select count(*) = 1 as ok_cudzy_zostaje from loadings where route_id = '44444444-0000-0000-0000-000000000096';
\echo '4b nocny przeładunek: wpis na wczoraj (zmiana z wczoraj na dziś) – dozwolony, 2 dni wstecz – błąd'
select set_config('request.jwt.claim.sub','00000000-0000-0000-0000-00000000000b',false) \g /dev/null
insert into loadings (route_id, driver_id, load_date, for_date) select '44444444-0000-0000-0000-000000000096', public.app_driver_id(), (now() at time zone 'Europe/Warsaw')::date - 1, (now() at time zone 'Europe/Warsaw')::date - 1;
insert into loadings (route_id, driver_id, load_date, for_date) select '44444444-0000-0000-0000-000000000096', public.app_driver_id(), (now() at time zone 'Europe/Warsaw')::date - 2, (now() at time zone 'Europe/Warsaw')::date - 2;
select count(*) = 2 as ok_wczoraj_i_dzis from loadings where route_id = '44444444-0000-0000-0000-000000000096';
\echo '5 kierowca odznacza swój'
select set_config('request.jwt.claim.sub','00000000-0000-0000-0000-00000000000b',false) \g /dev/null
delete from loadings where route_id = '44444444-0000-0000-0000-000000000096';
select count(*) = 0 as ok_odznaczony from loadings where route_id = '44444444-0000-0000-0000-000000000096';
reset role;
\echo '6 waga załadunku: kierowca wpisuje swoją, bez wagi -> błąd'
set role authenticated;
select set_config('request.jwt.claim.sub','00000000-0000-0000-0000-00000000000b',false) \g /dev/null
insert into loading_reports (driver_id, weight_kg, photo) select public.app_driver_id(), 1250.5, 'x/zdj.jpg';
insert into loading_reports (driver_id) select public.app_driver_id();
update loading_reports set weight_kg = 1300 where driver_id = public.app_driver_id();
\echo '7 drugi kierowca nie widzi cudzej wagi, kierownik widzi'
select set_config('request.jwt.claim.sub','00000000-0000-0000-0000-00000000000c',false) \g /dev/null
select count(*) = 0 as ok_kierowca_nie_widzi from loading_reports;
select set_config('request.jwt.claim.sub','00000000-0000-0000-0000-00000000000a',false) \g /dev/null
select count(*) = 1 and max(weight_kg) = 1300 as ok_kierownik_widzi from loading_reports;
reset role;
