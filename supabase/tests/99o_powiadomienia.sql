\echo '1 lista powiadomień: tankowanie i usterka kierowcy, widoczność'
reset role;
delete from events;
set role authenticated;
select set_config('request.jwt.claim.sub','00000000-0000-0000-0000-00000000000b',false) \g /dev/null
insert into issues (id, vehicle_id, title, severity, status, date) values ('66666666-0000-0000-0000-0000000000e1','22222222-0000-0000-0000-000000000011','Stuk w zawieszeniu','stop','nowe',current_date);
reset role;
select count(*) = 1 as ok_event_usterka from events where kind = 'usterka' and ref_id = '66666666-0000-0000-0000-0000000000e1' and alert;
set role authenticated;
select set_config('request.jwt.claim.sub','00000000-0000-0000-0000-00000000000a',false) \g /dev/null
select count(*) >= 1 as ok_szef_widzi from events;
select set_config('request.jwt.claim.sub','00000000-0000-0000-0000-00000000000b',false) \g /dev/null
select count(*) = 0 as ok_kierowca_nie_widzi from events;
insert into event_reads (seen_at) values (now());
reset role;
select count(*) = 0 as ok_kierowca_bez_odczytu from event_reads;
delete from issues where id = '66666666-0000-0000-0000-0000000000e1';
delete from events;
