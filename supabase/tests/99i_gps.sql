\set ON_ERROR_STOP 0
\echo '1 tabela przebiegów GPS'
select to_regclass('public.gps_odometer') is not null as ok_tabela;
\echo '2 jeden wpis na auto i dzień'
insert into public.gps_odometer(vehicle_id, day, km) select id, current_date, 1000 from public.vehicles order by plate limit 1;
do $$ declare ok boolean := false; begin
  begin insert into public.gps_odometer(vehicle_id, day, km) select id, current_date, 1001 from public.vehicles order by plate limit 1;
  exception when unique_violation then ok := true; end;
  perform set_config('t.ok', ok::text, false);
end $$;
select current_setting('t.ok')::boolean as ok_unikalny;
\echo '3 RLS włączone i tylko odczyt (zapis wyłącznie kluczem serwisowym)'
select (select relrowsecurity from pg_class where oid = 'public.gps_odometer'::regclass)
   and not exists (select 1 from pg_policies where tablename = 'gps_odometer' and cmd <> 'SELECT') as ok_bez_zapisu;
delete from public.gps_odometer;
\echo '4 kolumny sprawdzenia tankowania z GPS'
select count(*) = 4 as ok_kolumny_gps from information_schema.columns where table_schema='public' and table_name='fuel_card_rows' and column_name in ('gps_place','gps_dist_km','gps_ok','gps_checked_at');
