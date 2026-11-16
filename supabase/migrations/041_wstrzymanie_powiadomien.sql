-- ============================================================================
-- Emage FLEET — wstrzymanie powiadomień przez harmonogram (uruchom po 040)
-- Gdy zadanie „emage-fleet-powiadomienia” jest wstrzymane (cron.alter_job … active := false),
-- nie wychodzą też powiadomienia „od razu” (Auto niesprawne, podejrzane tankowanie).
-- Na stronie testowej harmonogram jest wstrzymany – test nie wysyła powiadomień, e-maili i nie pobiera GPS.
-- ============================================================================
-- push „od razu”: adres z harmonogramu, klucz z private.cron_token (migracja 031)
create or replace function private.push(roles text[], users uuid[], title text, body text, tag text)
returns void language plpgsql security definer set search_path = public, private as $$
declare cmd text; url text; secret text;
begin
  select command into cmd from cron.job where jobname = 'emage-fleet-powiadomienia' and active limit 1;   -- wstrzymany harmonogram = bez powiadomień
  if cmd is null then return; end if;
  url := (regexp_match(cmd, '(https://[^'']+/functions/v1/powiadomienia)'))[1];
  begin select token into secret from private.cron_token where id = 1; exception when others then secret := null; end;
  if secret is null or secret = '' then secret := (regexp_match(cmd, '''x-cron-secret''\s*,\s*''([^'']+)'''))[1]; end if;
  if url is null or secret is null then return; end if;
  perform net.http_post(url := url,
    headers := jsonb_build_object('Content-Type', 'application/json', 'x-cron-secret', secret),
    body := jsonb_build_object('mode', 'event', 'roles', to_jsonb(coalesce(roles, '{}')), 'users', to_jsonb(coalesce(users, '{}')),
                               'title', title, 'body', body, 'tag', tag),
    timeout_milliseconds := 10000);
exception when others then null;   -- powiadomienie nigdy nie blokuje zapisu
end $$;
