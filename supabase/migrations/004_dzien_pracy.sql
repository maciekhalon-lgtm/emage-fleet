-- ============================================================================
-- Emage FLEET — dzień pracy kierowcy: przejęcie auta z checklistą i zdanie pojazdu
-- (uruchom po 003_powiadomienia.sql)
-- ============================================================================

-- Wynik checklisty przy przejęciu: [{"item":"Opony","ok":true,"note":""}, …]
alter table public.bookings add column if not exists pickup_checklist jsonb not null default '[]'::jsonb;

-- Jedno auto może mieć naraz tylko jednego kierowcę (chroni przed jednoczesnym przejęciem).
create or replace function public.prevent_double_pickup() returns trigger
language plpgsql security definer set search_path = public as $$
declare other text;
begin
  if new.pickup_km is not null and new.return_km is null then
    select d.full_name into other
    from public.bookings b left join public.drivers d on d.id = b.driver_id
    where b.vehicle_id = new.vehicle_id and b.id <> new.id and b.pickup_km is not null and b.return_km is null
    limit 1;
    if found then
      raise exception 'To auto jest już przejęte przez: %. Wybierz inne auto.', coalesce(other, 'innego kierowcę')
        using errcode = 'P0001';
    end if;
  end if;
  return new;
end $$;

drop trigger if exists bookings_one_driver on public.bookings;
create trigger bookings_one_driver before insert or update of pickup_km, return_km, vehicle_id on public.bookings
  for each row execute function public.prevent_double_pickup();

-- Checklistę (ustawienie 'checklist') czytają wszyscy zatwierdzeni – kierowcy jej potrzebują.
drop policy if exists settings_select_push on public.settings;
create policy settings_select_public on public.settings for select
  using (key in ('push', 'checklist') and public.is_active());

-- Wieczorne przypomnienie o zdaniu auta: kopia porannego harmonogramu z trybem "wieczor",
-- codziennie 17:00 UTC (18:00 zimą, 19:00 latem). Wymaga harmonogramu z kroku powiadomień.
do $$
declare cmd text;
begin
  if not exists (select 1 from pg_namespace where nspname = 'cron') then
    raise notice 'Rozszerzenie pg_cron nie jest włączone – wieczorne przypomnienie pominięte.';
    return;
  end if;
  select command into cmd from cron.job where jobname = 'emage-fleet-powiadomienia';
  if cmd is null then
    raise notice 'Brak porannego harmonogramu emage-fleet-powiadomienia – wieczorne przypomnienie pominięte.';
  else
    perform cron.unschedule(jobid) from cron.job where jobname = 'emage-fleet-wieczor';
    perform cron.schedule('emage-fleet-wieczor', '0 17 * * *', replace(cmd, $q$'{}'::jsonb$q$, $q$'{"mode":"wieczor"}'::jsonb$q$));
  end if;
end $$;
