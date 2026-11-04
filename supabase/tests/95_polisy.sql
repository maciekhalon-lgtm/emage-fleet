\set ON_ERROR_STOP 0
set role authenticated;
select set_config('request.jwt.claim.sub','00000000-0000-0000-0000-00000000000a',false) \g /dev/null
insert into vehicles (id, plate, make, model, km) values ('22222222-0000-0000-0000-000000000095','DW 95','FIAT','DUCATO',300000);
\echo '1 polisa w aucie -> termin OC'
update vehicles set insurer='PZU', policy_no='PL123', policy_until=current_date+100, assistance_phone='+48 22 566 55 55' where id='22222222-0000-0000-0000-000000000095';
select date = current_date+100 and note = 'PZU · PL123' as ok_oc_z_auta from deadlines where vehicle_id='22222222-0000-0000-0000-000000000095' and type='Ubezpieczenie OC';
\echo '2 zmiana daty w aucie -> ten sam termin'
update vehicles set policy_until=current_date+200 where id='22222222-0000-0000-0000-000000000095';
select count(*) = 1 and max(date) = current_date+200 as ok_jeden_termin from deadlines where vehicle_id='22222222-0000-0000-0000-000000000095' and type='Ubezpieczenie OC';
\echo '3 OC odnowione w terminach -> auto'
update deadlines set date=current_date+565 where vehicle_id='22222222-0000-0000-0000-000000000095' and type='Ubezpieczenie OC';
select policy_until = current_date+565 as ok_auto_z_terminu from vehicles where id='22222222-0000-0000-0000-000000000095';
\echo '4 kierowca nie zmienia polisy'
select set_config('request.jwt.claim.sub','00000000-0000-0000-0000-00000000000c',false) \g /dev/null
update vehicles set assistance_phone='0' where id='22222222-0000-0000-0000-000000000095';
reset role;
select assistance_phone = '+48 22 566 55 55' as ok_kierowca_bez_zmian from vehicles where id='22222222-0000-0000-0000-000000000095';
