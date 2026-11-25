-- ============================================================================
-- Emage FLEET — szybszy odczyt licznika GPS (uruchom po 069)
-- Harmonogram „emage-fleet-gps” co 5 minut (2:00 i 7:00–23:59 UTC, jak dotąd), a funkcja „powiadomienia”
-- odczytuje licznik GPS 10 minut po tankowaniu / przejęciu / zdaniu (było 30) – wynik w rankingu po 10–15 min.
-- Włączenie/wyłączenie harmonogramu zostaje bez zmian (na wersji testowej wyłączony).
-- ============================================================================
do $$
declare jid bigint;
begin
  if to_regprocedure('cron.schedule(text,text,text)') is null then return; end if;   -- bez pg_cron (testy lokalne)
  select jobid into jid from cron.job where jobname = 'emage-fleet-gps';
  if jid is null then raise notice 'Brak harmonogramu emage-fleet-gps – pomijam'; return; end if;
  perform cron.alter_job(jid, schedule := '*/5 2,7-23 * * *');
end $$;
