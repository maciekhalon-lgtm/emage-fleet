\set ON_ERROR_STOP 0
-- szef (a) = kierownik floty; jan (b) = kierowca
set role authenticated;
select set_config('request.jwt.claim.sub','00000000-0000-0000-0000-00000000000a',false) \g /dev/null
\echo '1 kierownik floty dodaje koszt ogólny'
insert into fleet_costs (date, category, amount, note) values ('2026-11-01', 'GPS / telematyka', 560, 'abonament 28 aut');
select count(*) = 1 as ok_ogolne_dodane from fleet_costs where category = 'GPS / telematyka';
\echo '2 ujemna kwota -> błąd'
insert into fleet_costs (date, category, amount) values ('2026-11-01', 'X', -1);
\echo '3 kierowca nie widzi i nie dodaje'
select set_config('request.jwt.claim.sub','00000000-0000-0000-0000-00000000000b',false) \g /dev/null
select count(*) = 0 as ok_kierowca_nie_widzi from fleet_costs;
insert into fleet_costs (date, category, amount) values ('2026-11-01', 'Lewy', 1);
select set_config('request.jwt.claim.sub','00000000-0000-0000-0000-00000000000a',false) \g /dev/null
select count(*) = 1 as ok_tylko_jeden from fleet_costs;
reset role;
