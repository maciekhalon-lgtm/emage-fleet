\set ON_ERROR_STOP 0
set role authenticated;
select set_config('request.jwt.claim.sub','00000000-0000-0000-0000-00000000000b',false) \g /dev/null
\echo '1 Jan tankuje 100 EUR 2026-11-01 (niedziela) -> kurs z 30.10 4.25 = 425 zł; próbuje podać własny kurs'
insert into costs (id,date,vehicle_id,driver_id,category,amount,liters,odometer,full_tank,currency,amount_orig,fx_rate,fx_manual,station) values ('99999999-0000-0000-0000-000000000001','2026-11-01','22222222-0000-0000-0000-000000000002','11111111-0000-0000-0000-000000000001','Paliwo',1,60,999000,true,'EUR',100,1.0,true,'Orlen');
select amount, fx_rate, fx_date, fx_table, fx_manual from costs where id='99999999-0000-0000-0000-000000000001';
\echo '2 Jan zmienia kwotę na 120 EUR i podmienia kurs -> 510 zł, kurs bez zmian'
update costs set amount_orig=120, fx_rate=2 where id='99999999-0000-0000-0000-000000000001';
select amount, fx_rate from costs where id='99999999-0000-0000-0000-000000000001';
\echo '3 CZK 2026-11-03 (przed publikacją) -> kurs z 02.11'
insert into costs (date,vehicle_id,driver_id,category,amount,liters,odometer,full_tank,currency,amount_orig) values ('2026-11-03','22222222-0000-0000-0000-000000000002','11111111-0000-0000-0000-000000000001','Paliwo',0,50,999100,true,'CZK',2000);
select amount, fx_rate, fx_date from costs where currency='CZK';
\echo '4 NBP nie działa, a kursu nie ma w pamięci -> błąd; jest w pamięci -> OK'
reset role; update _nbp_up set up=false; set role authenticated;
insert into costs (date,vehicle_id,category,amount,currency,amount_orig) values ('2025-01-10','22222222-0000-0000-0000-000000000001','Myjnia',0,'EUR',10);
insert into costs (date,vehicle_id,category,amount,currency,amount_orig) values ('2026-11-02','22222222-0000-0000-0000-000000000001','Myjnia',0,'EUR',10);
reset role; update _nbp_up set up=true; set role authenticated;
\echo '5 kierownik poprawia kurs ręcznie'
select set_config('request.jwt.claim.sub','00000000-0000-0000-0000-00000000000a',false) \g /dev/null
update costs set fx_manual=true, fx_rate=4.3 where id='99999999-0000-0000-0000-000000000001';
select amount, fx_rate, fx_table from costs where id='99999999-0000-0000-0000-000000000001';
\echo '6 PLN bez zmian'
insert into costs (date,vehicle_id,category,amount) values ('2026-11-02','22222222-0000-0000-0000-000000000001','Myjnia',50);
select amount, currency, fx_rate from costs where amount=50;
select * from nbp_rate('eur','2026-11-03');
