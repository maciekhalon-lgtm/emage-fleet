-- ============================================================================
-- Emage FLEET — przebiegi z lokalizatorów (Geotab) co godzinę od 7 do 24, w nocy raz (uruchom po 043)
-- Osobny harmonogram „emage-fleet-gps” wywołuje funkcję „powiadomienia” w trybie gps (tylko przebiegi,
-- bez powiadomień). Poranny harmonogram 7:30 zostaje bez zmian (on też pobiera przebiegi).
-- Godziny w UTC: 7–22 i 23 UTC = 8:00–24:00 czasu polskiego zimą, 2 UTC = 3:00 w nocy.
-- Latem (czas letni) wszystko przesuwa się o godzinę później (9:00–1:00 i 4:00).
-- Adres funkcji i włączenie/wyłączenie: tak jak w porannym harmonogramie (na wersji testowej wyłączony).
-- ============================================================================
do $$
declare jid bigint; cmd text; url text; act boolean;
begin
  if to_regprocedure('cron.schedule(text,text,text)') is null then return; end if;   -- bez pg_cron (testy lokalne)
  select command, active into cmd, act from cron.job where jobname = 'emage-fleet-powiadomienia' limit 1;
  url := (regexp_match(coalesce(cmd, ''), '(https://[^'']+/functions/v1/powiadomienia)'))[1];
  if url is null then raise notice 'Brak porannego harmonogramu – pomijam'; return; end if;
  select jobid into jid from cron.job where jobname = 'emage-fleet-gps';
  if jid is not null then perform cron.unschedule(jid); end if;
  perform cron.schedule('emage-fleet-gps', '0 2,7-23 * * *', format($cmd$
    select net.http_post(
      url := %L,
      headers := jsonb_build_object('Content-Type', 'application/json', 'x-cron-secret', (select token from private.cron_token where id = 1)),
      body := '{"mode":"gps"}'::jsonb, timeout_milliseconds := 60000)
  $cmd$, url));
  select jobid into jid from cron.job where jobname = 'emage-fleet-gps';
  perform cron.alter_job(jid, active := coalesce(act, true));
end $$;
