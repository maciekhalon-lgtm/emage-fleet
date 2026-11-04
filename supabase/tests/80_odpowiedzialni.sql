\set ON_ERROR_STOP 0
\echo '1 stały kierowca -> lista odpowiedzialnych, porządkowanie listy'
update vehicles set responsible = array['11111111-0000-0000-0000-000000000002'::uuid, null, '11111111-0000-0000-0000-000000000002'::uuid, '11111111-0000-0000-0000-000000000001'::uuid] where plate='DW 1';
select cardinality(responsible) = 2 and driver_id = '11111111-0000-0000-0000-000000000002' as ok_lista from vehicles where plate='DW 1';
\echo '2 auto niesprawne -> powiadomienie także do odpowiedzialnych'
truncate net._calls;
insert into issues (vehicle_id, title, severity, status, date) select id, 'Test', 'stop', 'nowe', current_date from vehicles where plate='DW 1';
select jsonb_array_length(body->'users') = 2 as ok_push from net._calls;
