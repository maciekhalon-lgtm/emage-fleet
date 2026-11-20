\set ON_ERROR_STOP 0
reset role;
delete from events;
set role authenticated;
select set_config('request.jwt.claim.sub','00000000-0000-0000-0000-00000000000a',false) \g /dev/null
insert into vehicles (id, plate, make, model, km) values ('22222222-0000-0000-0000-000000000601','DW 601','FIAT','DUCATO',100000),
  ('22222222-0000-0000-0000-000000000602','DW 602','FIAT','DUCATO',100000), ('22222222-0000-0000-0000-000000000603','DW 603','FIAT','DUCATO',100000);
-- grafik: Jan ma DW 601, ktoś inny ma DW 603
insert into bookings (id, vehicle_id, driver_id, date_from, date_to, route_id, purpose) values
  ('33333333-0000-0000-0000-000000000601','22222222-0000-0000-0000-000000000601','11111111-0000-0000-0000-000000000001',current_date,current_date,null,'trasa'),
  ('33333333-0000-0000-0000-000000000603','22222222-0000-0000-0000-000000000603','11111111-0000-0000-0000-000000000002',current_date,current_date,null,null);
\echo '1 Jan zmienia na auto przydzielone komuś innemu -> błąd'
select set_config('request.jwt.claim.sub','00000000-0000-0000-0000-00000000000b',false) \g /dev/null
select driver_swap_vehicle('33333333-0000-0000-0000-000000000601','22222222-0000-0000-0000-000000000603','usterka');
\echo '2 Jan zmienia na wolne DW 602 -> przydział zmieniony, powiadomienie'
select driver_swap_vehicle('33333333-0000-0000-0000-000000000601','22222222-0000-0000-0000-000000000602','Usterka / uszkodzenie: nie odpala');
reset role;
select vehicle_id='22222222-0000-0000-0000-000000000602' and orig_vehicle_id='22222222-0000-0000-0000-000000000601' and swap_reason like 'Usterka%' and purpose='trasa' as ok_przydzial
  from bookings where id='33333333-0000-0000-0000-000000000601';
select count(*) = 1 as ok_powiadomienie from events where kind='zmiana' and title like '%DW 601 → DW 602%' and alert;
\echo '3 cudzy przydział -> błąd'
set role authenticated;
select set_config('request.jwt.claim.sub','00000000-0000-0000-0000-00000000000b',false) \g /dev/null
select driver_swap_vehicle('33333333-0000-0000-0000-000000000603','22222222-0000-0000-0000-000000000601','x');
reset role;
select vehicle_id='22222222-0000-0000-0000-000000000603' as ok_cudzy_bez_zmian from bookings where id='33333333-0000-0000-0000-000000000603';
