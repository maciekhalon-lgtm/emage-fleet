\set ON_ERROR_STOP 0
reset role;
\echo '1 zlecenie: numer ZL, usterka w naprawie, kierowca nie widzi zleceń'
set role authenticated;
select set_config('request.jwt.claim.sub','00000000-0000-0000-0000-00000000000b',false) \g /dev/null
insert into issues (id, vehicle_id, title, severity, status, date) values ('66666666-0000-0000-0000-0000000000f1','22222222-0000-0000-0000-000000000011','Stuk z tyłu','istotna','nowe',current_date);
select set_config('request.jwt.claim.sub','00000000-0000-0000-0000-00000000000a',false) \g /dev/null
insert into issues (id, vehicle_id, title, severity, status, date, service_type) values ('66666666-0000-0000-0000-0000000000f2','22222222-0000-0000-0000-000000000011','Wymienić rozrząd','drobna','nowe',current_date,'rozrzad');
insert into work_orders (id, workshop, date) values ('77777777-0000-0000-0000-0000000000f1','Auto-Serwis', current_date);
insert into work_orders (id, workshop, date) values ('77777777-0000-0000-0000-0000000000f2','Auto-Serwis', current_date);
select (select no from work_orders where id='77777777-0000-0000-0000-0000000000f1') ~ '^ZL/[0-9]{4}/001$' and (select no from work_orders where id='77777777-0000-0000-0000-0000000000f2') ~ '/002$' as ok_numer;
insert into work_order_items (order_id, vehicle_id, issue_id, kind, title) values ('77777777-0000-0000-0000-0000000000f1','22222222-0000-0000-0000-000000000011','66666666-0000-0000-0000-0000000000f1','usterka','Stuk z tyłu');
select status = 'naprawa' as ok_w_naprawie from issues where id='66666666-0000-0000-0000-0000000000f1';
\echo '2 kierowca: tylko swoje zgłoszenia, bez zleceń'
select set_config('request.jwt.claim.sub','00000000-0000-0000-0000-00000000000c',false) \g /dev/null
select count(*) = 0 as ok_nie_widzi_cudzych from issues where id in ('66666666-0000-0000-0000-0000000000f1','66666666-0000-0000-0000-0000000000f2');
select count(*) = 0 as ok_bez_zlecen from work_orders;
select set_config('request.jwt.claim.sub','00000000-0000-0000-0000-00000000000b',false) \g /dev/null
select count(*) = 1 as ok_widzi_swoje from issues where id='66666666-0000-0000-0000-0000000000f1';
\echo '3 niezrobione wraca do nowe'
select set_config('request.jwt.claim.sub','00000000-0000-0000-0000-00000000000a',false) \g /dev/null
update work_order_items set status='niezrobione' where issue_id='66666666-0000-0000-0000-0000000000f1';
select status = 'nowe' as ok_wraca from issues where id='66666666-0000-0000-0000-0000000000f1';
reset role;
delete from work_orders where id in ('77777777-0000-0000-0000-0000000000f1','77777777-0000-0000-0000-0000000000f2');
delete from issues where id in ('66666666-0000-0000-0000-0000000000f1','66666666-0000-0000-0000-0000000000f2');
