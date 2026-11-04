\set ON_ERROR_STOP 0
set role authenticated;
select set_config('request.jwt.claim.sub','00000000-0000-0000-0000-00000000000b',false) \g /dev/null
\echo '1 Jan zaznacza sprzątanie i próbuje od razu potwierdzić -> pending'
insert into cleanings (id, vehicle_id, date, driver_id, status) values ('aaaaaaaa-0000-0000-0000-000000000001','22222222-0000-0000-0000-000000000002','2026-11-03','11111111-0000-0000-0000-000000000001','confirmed');
select status from cleanings;
update cleanings set status='confirmed';
select status from cleanings;
\echo '2 Jan za innego kierowcę -> błąd; inspekcja -> błąd'
insert into cleanings (vehicle_id, date, driver_id) values ('22222222-0000-0000-0000-000000000002','2026-11-03','11111111-0000-0000-0000-000000000002');
insert into inspections (vehicle_id, date) values ('22222222-0000-0000-0000-000000000002','2026-11-03');
select set_config('request.jwt.claim.sub','00000000-0000-0000-0000-00000000000a',false) \g /dev/null
\echo '3 kierownik potwierdza; jego własny wpis od razu potwierdzony; inspekcja ok'
update cleanings set status='confirmed' where id='aaaaaaaa-0000-0000-0000-000000000001';
insert into cleanings (vehicle_id, date, kind) values ('22222222-0000-0000-0000-000000000001','2026-11-02','mycie');
select kind, status, decided_by is not null as kto from cleanings order by date;
insert into inspections (vehicle_id, date, items) values ('22222222-0000-0000-0000-000000000002','2026-11-03','[{"item":"Opony","ok":true}]');
select count(*) from inspections;
\echo '4 Jan nie edytuje potwierdzonego'
select set_config('request.jwt.claim.sub','00000000-0000-0000-0000-00000000000b',false) \g /dev/null
update cleanings set note='x' where id='aaaaaaaa-0000-0000-0000-000000000001';
select count(*) as jan_widzi from cleanings;
select count(*) as jan_insp from inspections;
