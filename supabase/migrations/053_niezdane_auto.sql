-- ============================================================================
-- Emage FLEET — auto niezdane po przydziale (uruchom po 052)
--  • kierowca, który ma auto z przydziału kończącego się wcześniej niż dziś, dostaje rano powiadomienie
--    „Zdaj auto albo potwierdź, że jedziesz dalej” (harmonogram emage-fleet-zdanie, 6:15 czasu polskiego zimą)
--  • „Jadę dalej” (driver_continue) przedłuża przydział do dziś – km i spalanie liczą się dalej na tego kierowcę
--  Na wersji testowej powiadomienia są wstrzymane (jak cały harmonogram).
-- ============================================================================
create or replace function public.driver_continue(p_booking uuid)
returns void language plpgsql security definer set search_path = public as $$
declare b public.bookings; drv uuid := public.app_driver_id();
begin
  select * into b from public.bookings where id = p_booking;
  if b.id is null then raise exception 'Nie ma takiego przydziału'; end if;
  if not (public.is_fleet() or (drv is not null and drv in (b.driver_id, coalesce(b.co_driver_id, b.driver_id)))) then raise exception 'To nie jest Twój przydział'; end if;
  if b.pickup_km is null or b.return_km is not null then raise exception 'Auto nie jest teraz przejęte'; end if;
  if b.date_to < current_date then update public.bookings set date_to = current_date where id = b.id; end if;
end $$;
revoke all on function public.driver_continue(uuid) from public;
grant execute on function public.driver_continue(uuid) to authenticated;

create or replace function private.remind_unreturned() returns int
language plpgsql security definer set search_path = public, private as $$
declare r record; n int := 0; us uuid[];
begin
  for r in select b.id, b.vehicle_id, b.date_to, b.driver_id, b.co_driver_id from public.bookings b
            where b.pickup_km is not null and b.return_km is null and b.date_to < current_date loop
    select array_agg(p.id) into us from public.profiles p where p.status = 'active' and p.driver_id in (r.driver_id, r.co_driver_id);
    if us is null then continue; end if;
    perform private.push(null, us, left('Masz auto ' || private.plate(r.vehicle_id) || ' z ' || to_char(r.date_to, 'DD.MM'), 120),
                         'Zdaj je w aplikacji albo potwierdź „Jadę dalej”.', 'zdaj-' || r.id);
    n := n + 1;
  end loop;
  return n;
end $$;

do $$
declare jid bigint;
begin
  if to_regprocedure('cron.schedule(text,text,text)') is null then return; end if;   -- bez pg_cron (testy lokalne)
  select jobid into jid from cron.job where jobname = 'emage-fleet-zdanie';
  if jid is not null then perform cron.unschedule(jid); end if;
  perform cron.schedule('emage-fleet-zdanie', '15 5 * * *', 'select private.remind_unreturned()');
end $$;
