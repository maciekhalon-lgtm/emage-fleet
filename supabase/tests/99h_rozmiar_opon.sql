\set ON_ERROR_STOP 0
\echo '1 kolumna rozmiaru opon w aucie'
select exists (select 1 from information_schema.columns where table_schema='public' and table_name='vehicles' and column_name='tire_size') as ok_kolumna;
\echo '2 rozmiar zapisuje się, za długi jest odrzucany'
update public.vehicles set tire_size = '225/75 R16C' where id = (select id from public.vehicles order by plate limit 1);
select (select tire_size from public.vehicles order by plate limit 1) = '225/75 R16C' as ok_zapis;
do $$ declare ok boolean := false; begin
  begin update public.vehicles set tire_size = repeat('x', 41) where id = (select id from public.vehicles order by plate limit 1);
  exception when check_violation then ok := true; end;
  perform set_config('t.ok', ok::text, false);
end $$;
select current_setting('t.ok')::boolean as ok_limit;
update public.vehicles set tire_size = null;
