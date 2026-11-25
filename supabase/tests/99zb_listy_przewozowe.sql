\set ON_ERROR_STOP 0
set role authenticated;
select set_config('request.jwt.claim.sub','00000000-0000-0000-0000-00000000000a',false) \g /dev/null
\echo '1 kierownik floty: pierwszy list w 2026 ma numer 370, następny 371'
insert into waybills (id, date, r_name, items) values ('77777777-0000-0000-0000-000000000691', '2026-11-25', 'AUTO-PARTNER', '[{"name":"ZWROT 47/2026","paleta":1}]');
insert into waybills (id, date, r_name) values ('77777777-0000-0000-0000-000000000692', '2026-11-26', 'AUTO-PARTNER');
select (select no from waybills where id='77777777-0000-0000-0000-000000000691') = 370 and (select no from waybills where id='77777777-0000-0000-0000-000000000692') = 371 as ok_numeracja;
\echo '2 zmiana daty i statusu nie zmienia numeru'
update waybills set date = '2027-01-05', status = 'anulowany', no = 1 where id='77777777-0000-0000-0000-000000000692';
select no = 371 and year = 2026 as ok_numer_staly from waybills where id='77777777-0000-0000-0000-000000000692';
\echo '3 nowy rok – numeracja od 1'
insert into waybills (id, date, r_name) values ('77777777-0000-0000-0000-000000000693', '2027-01-03', 'X');
select no = 1 and year = 2027 as ok_nowy_rok from waybills where id='77777777-0000-0000-0000-000000000693';
reset role;
\echo '4 kierowca nie widzi listów'
set role authenticated;
select set_config('request.jwt.claim.sub', (select id::text from profiles where email='jan@x'), false) \g /dev/null
select count(*) = 0 as ok_kierowca_nie_widzi from waybills;
reset role;
delete from waybills where id::text like '77777777-0000-0000-0000-00000000069%';
\echo '5 AUTO-PARTNER w książce odbiorców i jako nadawca do wyboru (z magazynem)'
select exists (select 1 from waybill_recipients where name like 'AUTO-PARTNER Gdańsk%' and nip = '5842731959') as ok_odbiorca,
       exists (select 1 from settings s, jsonb_array_elements(s.value->'senders') x where s.key='waybill' and x->>'id'='auto-partner' and x->>'text' like E'AUTO-PARTNER%\n80-180 Kowale%' and x->>'wh' like 'CE MG%') as ok_nadawca;
