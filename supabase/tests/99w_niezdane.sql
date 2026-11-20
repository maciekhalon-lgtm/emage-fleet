\set ON_ERROR_STOP 0
set role authenticated;
select set_config('request.jwt.claim.sub','00000000-0000-0000-0000-00000000000a',false) \g /dev/null
insert into drivers (id, full_name) values ('11111111-0000-0000-0000-000000000801','Zenek');
insert into vehicles (id, plate, make, model, km) values ('22222222-0000-0000-0000-000000000801','DW 801','FIAT','DUCATO',100000);
insert into bookings (id, vehicle_id, driver_id, date_from, date_to, pickup_at, pickup_km) values
  ('33333333-0000-0000-0000-000000000801','22222222-0000-0000-0000-000000000801','11111111-0000-0000-0000-000000000801',current_date-2,current_date-1,current_date-2,100000);
\echo '1 Jadę dalej (kierownik za kierowcę) -> przydział do dziś'
select driver_continue('33333333-0000-0000-0000-000000000801');
reset role;
select date_to = current_date as ok_przedluzone from bookings where id='33333333-0000-0000-0000-000000000801';
\echo '2 przypomnienie: tylko kierowcy z kontem (Zenek bez konta -> pomijany), funkcja działa'
update bookings set date_to = current_date - 1 where id='33333333-0000-0000-0000-000000000801';
select private.remind_unreturned() >= 0 as ok_przypomnienie;
