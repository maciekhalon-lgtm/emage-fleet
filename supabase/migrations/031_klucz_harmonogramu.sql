-- ============================================================================
-- Emage FLEET — klucz porannego harmonogramu bez ręcznego wpisywania sekretów (uruchom po 030)
-- Baza sama losuje klucz (nikt go nie widzi ani nie przepisuje). Harmonogram pg_cron wysyła go
-- w nagłówku x-cron-secret, a funkcja „powiadomienia” sprawdza go w bazie (public.cron_token_ok),
-- dostępnej tylko dla klucza serwisowego funkcji. CRON_SECRET w sekretach funkcji nie jest już potrzebny.
-- ============================================================================
create schema if not exists private;
create table if not exists private.cron_token (
  id     int primary key default 1 check (id = 1),
  token  text not null default replace(gen_random_uuid()::text || gen_random_uuid()::text, '-', '')
);
insert into private.cron_token (id) values (1) on conflict (id) do nothing;

create or replace function public.cron_token_ok(t text) returns boolean
language sql stable security definer set search_path = private, public as $$
  select coalesce(t, '') <> '' and t = (select token from private.cron_token where id = 1);
$$;
-- klucz i jego sprawdzanie: tylko klucz serwisowy funkcji (anon / authenticated nie mają dostępu)
revoke all on private.cron_token from public;
revoke all on function public.cron_token_ok(text) from public;
do $$
declare r text;
begin
  foreach r in array array['anon', 'authenticated'] loop
    if exists (select 1 from pg_roles where rolname = r) then
      execute format('revoke all on private.cron_token from %I', r);
      execute format('revoke all on function public.cron_token_ok(text) from %I', r);
    end if;
  end loop;
  if exists (select 1 from pg_roles where rolname = 'service_role') then
    grant usage on schema private to service_role;
    grant execute on function public.cron_token_ok(text) to service_role;
  end if;
end $$;

-- harmonogram: ten sam czas (6:30 UTC = 7:30 zimą), klucz czytany z bazy przy każdym uruchomieniu
do $$
declare jid bigint;
begin
  if to_regprocedure('cron.schedule(text,text,text)') is null then return; end if;   -- bez pg_cron (np. testy lokalne)
  select jobid into jid from cron.job where jobname = 'emage-fleet-powiadomienia';
  if jid is not null then perform cron.unschedule(jid); end if;
  perform cron.schedule('emage-fleet-powiadomienia', '30 6 * * *', $cmd$
    select net.http_post(
      url := 'https://nsvtnpvpbhnbrmygsbxy.supabase.co/functions/v1/powiadomienia',
      headers := jsonb_build_object('Content-Type', 'application/json', 'x-cron-secret', (select token from private.cron_token where id = 1)),
      body := '{}'::jsonb, timeout_milliseconds := 60000)
  $cmd$);
end $$;
