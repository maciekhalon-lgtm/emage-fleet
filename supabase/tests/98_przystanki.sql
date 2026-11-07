\set ON_ERROR_STOP 0
-- szef (a) = kierownik floty; jan (b) = kierowca (z 10_obsada.sql)
set role authenticated;
select set_config('request.jwt.claim.sub','00000000-0000-0000-0000-00000000000a',false) \g /dev/null
insert into routes (id, code, name) values ('44444444-0000-0000-0000-000000000098','98P','Przystanki');
\echo '1 kierownik dodaje przystanki'
insert into route_stops (route_id, pos, client, address, time_from, phone) values
  ('44444444-0000-0000-0000-000000000098', 1, 'Klient A', 'Wrocław, Legnicka 1', '8:00', '600100100'),
  ('44444444-0000-0000-0000-000000000098', 2, 'Klient B', 'Legnica, Rynek 2', null, null);
select count(*) = 2 as ok_dodane from route_stops where route_id = '44444444-0000-0000-0000-000000000098';
\echo '2 pusty klient -> błąd'
insert into route_stops (route_id, client) values ('44444444-0000-0000-0000-000000000098', '  ');
\echo '3 kierowca widzi przystanki, ale nie może ich zmieniać'
select set_config('request.jwt.claim.sub','00000000-0000-0000-0000-00000000000b',false) \g /dev/null
select count(*) = 2 as ok_kierowca_widzi from route_stops where route_id = '44444444-0000-0000-0000-000000000098';
insert into route_stops (route_id, client) values ('44444444-0000-0000-0000-000000000098', 'Lewy');
update route_stops set client = 'X' where route_id = '44444444-0000-0000-0000-000000000098';
delete from route_stops where route_id = '44444444-0000-0000-0000-000000000098';
select set_config('request.jwt.claim.sub','00000000-0000-0000-0000-00000000000a',false) \g /dev/null
select count(*) = 2 and bool_and(client <> 'X') as ok_bez_zmian from route_stops where route_id = '44444444-0000-0000-0000-000000000098';
\echo '4 usunięcie trasy usuwa przystanki'
delete from routes where id = '44444444-0000-0000-0000-000000000098';
select count(*) = 0 as ok_kaskada from route_stops where route_id = '44444444-0000-0000-0000-000000000098';
reset role;
\echo '5 kierowca czyta komunikaty (announce), ale nie budżet'
set role authenticated;
select set_config('request.jwt.claim.sub','00000000-0000-0000-0000-00000000000a',false) \g /dev/null
insert into settings (key, value) values ('announce', '{"items":[{"id":"x","text":"Test"}]}') on conflict (key) do update set value = excluded.value;
select set_config('request.jwt.claim.sub','00000000-0000-0000-0000-00000000000b',false) \g /dev/null
select count(*) = 1 as ok_kierowca_komunikat from settings where key = 'announce';
select count(*) = 0 as ok_kierowca_bez_budzetu from settings where key = 'budget';
reset role;
