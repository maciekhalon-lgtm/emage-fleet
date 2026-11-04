\set ON_ERROR_STOP 0
set role authenticated;
select set_config('request.jwt.claim.sub','00000000-0000-0000-0000-00000000000a',false) \g /dev/null
insert into vehicles (id, plate, make, model, km) values ('22222222-0000-0000-0000-000000000011','DW 11','FIAT','DUCATO',100000);
insert into issues (id, vehicle_id, title, severity, status, date) values ('66666666-0000-0000-0000-000000000001','22222222-0000-0000-0000-000000000011','Klocki piszczą','istotna','nowe','2026-11-01');
insert into deadlines (id, vehicle_id, type, date, interval_months) values ('77777777-0000-0000-0000-000000000001','22222222-0000-0000-0000-000000000011','Przegląd techniczny','2026-11-05',12);
\echo '1 olej bez przebiegu -> błąd'
insert into service_entries (vehicle_id, date, description, oil_change) values ('22222222-0000-0000-0000-000000000011','2026-11-03','olej',true);
\echo '2 pełny wpis'
insert into service_entries (id, vehicle_id, date, km, workshop, description, cost, oil_change, deadline_id, issue_ids) values ('88888888-0000-0000-0000-000000000001','22222222-0000-0000-0000-000000000011','2026-11-03',101000,'Auto-Serwis','Olej, filtr, klocki przód',850,true,'77777777-0000-0000-0000-000000000001','{66666666-0000-0000-0000-000000000001}');
select category, amount, note from costs where vehicle_id='22222222-0000-0000-0000-000000000011';
select km from vehicles where id='22222222-0000-0000-0000-000000000011';
select status, resolved_at, repair_note from issues where id='66666666-0000-0000-0000-000000000001';
select type, date, km_due, interval_km, remind_km from deadlines where vehicle_id='22222222-0000-0000-0000-000000000011' order by type;
\echo '3 zmiana kosztu -> koszt zaktualizowany; zero -> koszt usunięty; usunięcie wpisu'
update service_entries set cost=900 where id='88888888-0000-0000-0000-000000000001';
select amount from costs where vehicle_id='22222222-0000-0000-0000-000000000011';
update service_entries set cost=null where id='88888888-0000-0000-0000-000000000001';
select count(*) as koszty from costs where vehicle_id='22222222-0000-0000-0000-000000000011';
update service_entries set cost=100 where id='88888888-0000-0000-0000-000000000001';
delete from service_entries where id='88888888-0000-0000-0000-000000000001';
select count(*) as koszty_po_usunieciu from costs where vehicle_id='22222222-0000-0000-0000-000000000011';
\echo '4 kierowca nie widzi'
select set_config('request.jwt.claim.sub','00000000-0000-0000-0000-00000000000b',false) \g /dev/null
insert into service_entries (vehicle_id, date, description) values ('22222222-0000-0000-0000-000000000011','2026-11-03','x');
