\set ON_ERROR_STOP 0
-- kierownik serwisu (d) – tylko podgląd umów
insert into auth.users values ('00000000-0000-0000-0000-00000000000d','serwis@x','{}') on conflict do nothing;
update profiles set role = 'serwisu', status = 'active' where id = '00000000-0000-0000-0000-00000000000d';
set role authenticated;
select set_config('request.jwt.claim.sub','00000000-0000-0000-0000-00000000000a',false) \g /dev/null
insert into vehicles (id, plate, make, model, km) values ('22222222-0000-0000-0000-0000000000e1','DW UM1','FIAT','DUCATO',90000);
\echo '1 kierownik floty dodaje leasing'
insert into vehicle_contracts (vehicle_id, kind, provider, contract_no, start_date, end_date, monthly_net, monthly_gross, km_limit, km_start, km_excess_rate, buyout)
values ('22222222-0000-0000-0000-0000000000e1','leasing','mLeasing','L/2024/77','2024-03-01','2027-02-28',2890,3554.70,150000,12000,0.25,1500);
select count(*) = 1 as ok_dodana from vehicle_contracts;
\echo '2 koniec przed początkiem / ujemna rata -> błąd'
insert into vehicle_contracts (vehicle_id, start_date, end_date) values ('22222222-0000-0000-0000-0000000000e1','2026-05-01','2026-01-01');
insert into vehicle_contracts (vehicle_id, monthly_net) values ('22222222-0000-0000-0000-0000000000e1',-5);
\echo '3 kierownik serwisu widzi, nie zmienia'
select set_config('request.jwt.claim.sub','00000000-0000-0000-0000-00000000000d',false) \g /dev/null
select count(*) = 1 as ok_serwis_widzi from vehicle_contracts;
update vehicle_contracts set monthly_net = 1 where vehicle_id = '22222222-0000-0000-0000-0000000000e1';
select monthly_net = 2890 as ok_serwis_bez_zmian from vehicle_contracts;
\echo '4 kierowca nie widzi'
select set_config('request.jwt.claim.sub','00000000-0000-0000-0000-00000000000b',false) \g /dev/null
select count(*) = 0 as ok_kierowca_nie_widzi from vehicle_contracts;
reset role;
