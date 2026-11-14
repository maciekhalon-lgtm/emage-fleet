\echo '1 kontrola paragonów usunięta, trasa ma stałe km do faktury'
reset role;
select not exists (select 1 from pg_trigger where tgname = 'costs_d_receipt') and to_regprocedure('public.my_receipt_today()') is null as ok_bez_paragonow;
insert into routes (id, code, name, km) values ('44444444-0000-0000-0000-0000000000a1', 'KM1', 'Trasa z km', 640.5);
select km = 640.5 as ok_km_trasy from routes where id = '44444444-0000-0000-0000-0000000000a1';
delete from routes where id = '44444444-0000-0000-0000-0000000000a1';
