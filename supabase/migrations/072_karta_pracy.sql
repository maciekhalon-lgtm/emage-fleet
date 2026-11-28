-- ============================================================================
-- Emage FLEET — karta pracy kierowcy z GPS (uruchom po 071)
--  work_events: aktywności kierowcy w czasie przejęcia auta (od przejęcia do zdania w aplikacji):
--    jazda (przejazdy z lokalizatora Geotab), praca inna (postój u klienta / na bazie, czas przed pierwszym wyjazdem),
--    postój (inne postoje ≥ 15 min), gotowość (tylko ręcznie). Przekroczenia granic: kraj wjazdu + godzina.
--  Wpisy z GPS liczy funkcja „powiadomienia” (tryb work, harmonogram emage-fleet-praca co 15 min).
--  Gdy kierownik poprawi wpis ręcznie, cały dzień (przejęcie) przechodzi na „manual” i GPS już go nie nadpisuje.
--  Kierownik floty: wszystko; kierowca: podgląd tylko swoich wpisów.
-- ============================================================================
create table if not exists public.work_events (
  id            uuid primary key default gen_random_uuid(),
  booking_id    uuid references public.bookings(id) on delete cascade,
  driver_id     uuid references public.drivers(id) on delete set null,
  vehicle_id    uuid references public.vehicles(id) on delete set null,
  kind          text not null check (kind in ('jazda','praca','gotowosc','postoj')),
  start_ts      timestamptz not null,
  end_ts        timestamptz,
  country       text,                -- kraj, w którym trwa aktywność (kod ISO)
  cross_country text,                -- przekroczenie granicy na początku tego wpisu: kod kraju wjazdu
  cross_ts      timestamptz,         -- … i godzina przekroczenia
  km            numeric,
  source        text not null default 'gps' check (source in ('gps','manual')),
  note          text,
  created_by    uuid default auth.uid(),
  created_at    timestamptz not null default now(),
  updated_at    timestamptz not null default now(),
  check (end_ts is null or end_ts >= start_ts)
);
create index if not exists work_events_drv on public.work_events(driver_id, start_ts);
create index if not exists work_events_bk on public.work_events(booking_id);

grant select, insert, update, delete on public.work_events to authenticated;
alter table public.work_events enable row level security;
drop policy if exists work_events_fleet on public.work_events;
create policy work_events_fleet on public.work_events for all using (public.is_fleet()) with check (public.is_fleet());
drop policy if exists work_events_own on public.work_events;
create policy work_events_own on public.work_events for select using (public.app_role() = 'kierowca' and driver_id = public.app_driver_id());

do $$ begin
  alter publication supabase_realtime add table public.work_events;
exception when duplicate_object then null; when undefined_object then null; end $$;

-- początek karty pracy (od kiedy liczyć przejęcia): settings 'workcard' = {"from":"2026-11-28"}
insert into public.settings (key, value) values ('workcard', '{"from":"2026-11-28"}'::jsonb) on conflict (key) do nothing;

-- harmonogram co 15 min (jak pobieranie liczników): tryb „work” funkcji „powiadomienia”; włączenie jak w porannym harmonogramie
do $$
declare jid bigint; cmd text; url text; act boolean;
begin
  if to_regprocedure('cron.schedule(text,text,text)') is null then return; end if;
  select command, active into cmd, act from cron.job where jobname = 'emage-fleet-powiadomienia' limit 1;
  url := (regexp_match(coalesce(cmd, ''), '(https://[^'']+/functions/v1/powiadomienia)'))[1];
  if url is null then raise notice 'Brak porannego harmonogramu – pomijam'; return; end if;
  select jobid into jid from cron.job where jobname = 'emage-fleet-praca';
  if jid is not null then perform cron.unschedule(jid); end if;
  perform cron.schedule('emage-fleet-praca', '7,22,37,52 * * * *', format($cmd$
    select net.http_post(
      url := %L,
      headers := jsonb_build_object('Content-Type', 'application/json', 'x-cron-secret', (select token from private.cron_token where id = 1)),
      body := '{"mode":"work"}'::jsonb, timeout_milliseconds := 120000)
  $cmd$, url));
  select jobid into jid from cron.job where jobname = 'emage-fleet-praca';
  perform cron.alter_job(jid, active := false);   -- włączamy po sprawdzeniu trybu „work” na prawdziwych danych
end $$;
