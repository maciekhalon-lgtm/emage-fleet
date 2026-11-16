-- ============================================================================
-- Emage FLEET — lista powiadomień dla kierowników (dzwonek) (uruchom po 039)
-- 1. events: zdanie auta (na bazę / pod domem), tankowanie wpisane przez kierowcę, zgłoszona usterka.
--    Wpisy tworzy baza (działa też dla wpisów wysłanych później bez zasięgu). Trzymamy 60 dni.
--    Kierownik floty widzi wszystko, kierownik serwisu tylko usterki.
-- 2. event_reads: do kiedy użytkownik przeczytał listę (wspólne dla telefonu i komputera).
-- 3. Naprawa powiadomień na telefon (push): od migracji 031 klucz harmonogramu jest w private.cron_token,
--    a funkcja private.push szukała go jeszcze w treści harmonogramu – powiadomienia „od razu” nie wychodziły.
-- ============================================================================
create table if not exists public.events (
  id         uuid primary key default gen_random_uuid(),
  at         timestamptz not null default now(),
  kind       text not null check (kind in ('zdanie','tankowanie','usterka')),
  vehicle_id uuid references public.vehicles(id) on delete cascade,
  driver_id  uuid references public.drivers(id) on delete set null,
  title      text not null,
  body       text,
  ref_id     uuid,
  alert      boolean not null default false
);
create index if not exists events_at on public.events(at desc);
alter table public.events enable row level security;
revoke all on public.events from authenticated;
grant select on public.events to authenticated;
drop policy if exists events_read on public.events;
create policy events_read on public.events for select using (public.is_fleet() or (public.is_staff() and kind = 'usterka'));

create table if not exists public.event_reads (
  user_id uuid primary key default auth.uid(),
  seen_at timestamptz not null default now()
);
alter table public.event_reads enable row level security;
grant select, insert, update on public.event_reads to authenticated;
drop policy if exists event_reads_own on public.event_reads;
create policy event_reads_own on public.event_reads for all using (user_id = auth.uid()) with check (user_id = auth.uid() and public.is_staff());

create or replace function private.event_add(k text, vid uuid, did uuid, t text, b text, ref uuid, al boolean)
returns void language plpgsql security definer set search_path = public, private as $$
begin
  insert into public.events (kind, vehicle_id, driver_id, title, body, ref_id, alert) values (k, vid, did, left(t, 200), left(b, 400), ref, coalesce(al, false));
  if random() < 0.02 then delete from public.events where at < now() - interval '60 days'; end if;
exception when others then null;   -- lista powiadomień nigdy nie blokuje zapisu
end $$;

create or replace function private.drv_name(did uuid) returns text
language sql stable security definer set search_path = public as $$ select coalesce((select full_name from public.drivers where id = did), 'Kierowca') $$;

-- zdanie auta (pierwszy wpis licznika przy zdaniu)
create or replace function public.event_booking() returns trigger
language plpgsql security definer set search_path = public, private as $$
begin
  if new.return_km is not null and (tg_op = 'INSERT' or old.return_km is null) then
    perform private.event_add('zdanie', new.vehicle_id, new.driver_id,
      private.drv_name(new.driver_id) || ' zdał(a) ' || private.plate(new.vehicle_id) || case when new.return_home then ' pod domem' else ' na bazę' end,
      to_char(new.return_km, 'FM999G999G999') || ' km' || coalesce(' · ' || nullif(new.return_note, ''), ''), new.id, false);
  end if;
  return null;
end $$;
drop trigger if exists bookings_event on public.bookings;
create trigger bookings_event after insert or update of return_km on public.bookings for each row execute function public.event_booking();

-- tankowanie wpisane przez kierowcę (nie import z karty i nie wpis kierownika)
create or replace function public.event_cost() returns trigger
language plpgsql security definer set search_path = public, private as $$
begin
  if new.category in ('Paliwo','Ładowanie') and exists (select 1 from public.profiles p where p.id = new.created_by and p.role = 'kierowca') then
    perform private.event_add('tankowanie', new.vehicle_id, new.driver_id,
      private.drv_name(new.driver_id) || ' zatankował(a) ' || private.plate(new.vehicle_id),
      coalesce(to_char(new.liters, 'FM999990D0') || ' l · ', '') || to_char(new.amount, 'FM999G990D00') || ' ' || coalesce(new.currency, 'PLN')
        || coalesce(' · licznik ' || to_char(new.odometer, 'FM999G999G999'), '')
        || case when cardinality(new.flags) > 0 then ' · podejrzane: ' || array_to_string(new.flags, ', ') else '' end,
      new.id, cardinality(new.flags) > 0);
  end if;
  return null;
end $$;
drop trigger if exists costs_event on public.costs;
create trigger costs_event after insert on public.costs for each row execute function public.event_cost();

-- zgłoszona usterka (bez informacji serwisowych – te wpisują kierownicy)
create or replace function public.event_issue() returns trigger
language plpgsql security definer set search_path = public, private as $$
declare who text; did uuid;
begin
  if new.service_type is null then
    select p.driver_id, coalesce(nullif(p.full_name, ''), 'Ktoś') into did, who from public.profiles p where p.id = new.created_by;
    perform private.event_add('usterka', new.vehicle_id, did,
      coalesce(who, 'Ktoś') || ' zgłosił(a) usterkę ' || private.plate(new.vehicle_id),
      case new.severity when 'stop' then 'Auto niesprawne · ' when 'istotna' then 'Istotna · ' else '' end || new.title, new.id, new.severity = 'stop');
  end if;
  return null;
end $$;
drop trigger if exists issues_event on public.issues;
create trigger issues_event after insert on public.issues for each row execute function public.event_issue();

do $$ begin
  alter publication supabase_realtime add table public.events;
exception when duplicate_object then null; when undefined_object then null; end $$;

-- push „od razu”: adres z harmonogramu, klucz z private.cron_token (migracja 031)
create or replace function private.push(roles text[], users uuid[], title text, body text, tag text)
returns void language plpgsql security definer set search_path = public, private as $$
declare cmd text; url text; secret text;
begin
  select command into cmd from cron.job where jobname = 'emage-fleet-powiadomienia' limit 1;
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
