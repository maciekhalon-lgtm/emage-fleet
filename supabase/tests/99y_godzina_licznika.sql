\set ON_ERROR_STOP 0
\echo '1 poprawka licznika przejęcia nie zmienia godziny przejęcia (pickup_ts)'
insert into vehicles (id, plate, make, model, km) values ('22222222-0000-0000-0000-000000000990','DW 990','FIAT','DUCATO',1000);
insert into drivers (id, full_name) values ('44444444-0000-0000-0000-000000000990','Kierowca 990');
insert into bookings (id, vehicle_id, driver_id, date_from, date_to, pickup_km, pickup_at) values ('66666666-0000-0000-0000-000000000990','22222222-0000-0000-0000-000000000990','44444444-0000-0000-0000-000000000990', current_date, current_date, 1000, now());
update bookings set pickup_ts = now() - interval '5 hours' where id='66666666-0000-0000-0000-000000000990';
update bookings set pickup_km = 1010 where id='66666666-0000-0000-0000-000000000990';
select pickup_ts < now() - interval '4 hours' as ok_godzina_bez_zmian from bookings where id='66666666-0000-0000-0000-000000000990';
\echo '2 pierwsze zdanie ustawia godzinę zdania, poprawka już nie'
update bookings set return_km = 1100, return_at = current_date where id='66666666-0000-0000-0000-000000000990';
select return_ts > now() - interval '1 minute' as ok_zdanie_teraz from bookings where id='66666666-0000-0000-0000-000000000990';
update bookings set return_ts = now() - interval '2 hours' where id='66666666-0000-0000-0000-000000000990';
update bookings set return_km = 1105 where id='66666666-0000-0000-0000-000000000990';
select return_ts < now() - interval '1 hour' as ok_zdanie_bez_zmian from bookings where id='66666666-0000-0000-0000-000000000990';
delete from bookings where id='66666666-0000-0000-0000-000000000990';
