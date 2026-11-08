\set ON_ERROR_STOP 0
set role authenticated;
select set_config('request.jwt.claim.sub','00000000-0000-0000-0000-00000000000a',false) \g /dev/null
insert into vehicles (id, plate, make, model, km, tires) values ('22222222-0000-0000-0000-0000000000c1','DW OP1','FIAT','DUCATO',150000,'letnie');
\echo '1 komplet zimowy w magazynie, letni na aucie'
insert into tires (id, vehicle_id, season, size, dot, tread_mm, location, storage) values
 ('99999999-0000-0000-0000-0000000000c1','22222222-0000-0000-0000-0000000000c1','letnie','225/75 R16C',2023,6.5,'na_aucie',null),
 ('99999999-0000-0000-0000-0000000000c2','22222222-0000-0000-0000-0000000000c1','zimowe','225/75 R16C',2021,7.0,'magazyn','Regał A3');
select count(*) = 2 as ok_dodane from tires where vehicle_id='22222222-0000-0000-0000-0000000000c1';
\echo '2 drugi komplet na tym samym aucie -> błąd'
update tires set location='na_aucie' where id='99999999-0000-0000-0000-0000000000c2';
\echo '3 wymiana: letnie do magazynu, zimowe na auto -> vehicles.tires = zimowe'
update tires set location='magazyn', storage='Regał A3' where id='99999999-0000-0000-0000-0000000000c1';
update tires set location='na_aucie', mounted_at='2026-11-09', mounted_km=150500 where id='99999999-0000-0000-0000-0000000000c2';
select tires = 'zimowe' as ok_sezon_na_aucie from vehicles where id='22222222-0000-0000-0000-0000000000c1';
\echo '4 zły bieżnik / zły sezon -> błąd'
insert into tires (season, tread_mm) values ('letnie', 25);
insert into tires (season) values ('zimowa');
\echo '5 kierowca nie widzi opon'
select set_config('request.jwt.claim.sub','00000000-0000-0000-0000-00000000000b',false) \g /dev/null
select count(*) = 0 as ok_kierowca_nie_widzi from tires;
reset role;
select count(*) > 0 as ok_historia from change_log where entity = 'tires';
