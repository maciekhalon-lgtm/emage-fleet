\set ON_ERROR_STOP 0
-- szef (a) = kierownik floty; jan (b) = kierowca
set role authenticated;
select set_config('request.jwt.claim.sub','00000000-0000-0000-0000-00000000000a',false) \g /dev/null
\echo '1 kierownik zapisuje moduły i link kalendarza'
insert into settings (key, value) values ('modules', '{"zaladunek":true,"przystanki":false,"obsada":true}') on conflict (key) do update set value = excluded.value;
insert into settings (key, value) values ('calendar', '{"token":"abcdefabcdefabcdefabcdef"}') on conflict (key) do update set value = excluded.value;
select count(*) = 2 as ok_zapisane from settings where key in ('modules','calendar');
\echo '2 kierowca widzi moduły, nie widzi linku kalendarza'
select set_config('request.jwt.claim.sub','00000000-0000-0000-0000-00000000000b',false) \g /dev/null
select count(*) = 1 as ok_kierowca_widzi_moduly from settings where key = 'modules';
select count(*) = 0 as ok_kierowca_bez_kalendarza from settings where key = 'calendar';
\echo '3 kierowca nie zmienia modułów'
update settings set value = '{"zaladunek":false}' where key = 'modules';
select (value->>'zaladunek')::boolean as ok_bez_zmian from settings where key = 'modules';
reset role;
