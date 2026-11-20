-- ============================================================================
-- Emage FLEET — nocna zmiana to nie „niezdane auto” (uruchom po 055)
-- Kierowca zaczyna np. we wtorek o 23:00, a kończy w środę o 10:00 – to jedna zmiana (1 dzień pracy).
-- Poranne przypomnienie „Zdaj auto albo Jadę dalej” idzie dopiero, gdy od przejęcia minęło ponad 20 h
-- (bez godziny przejęcia – gdy przydział skończył się przedwczoraj albo wcześniej).
-- ============================================================================
create or replace function private.remind_unreturned() returns int
language plpgsql security definer set search_path = public, private as $$
declare r record; n int := 0; us uuid[];
begin
  for r in select b.id, b.vehicle_id, b.date_to, b.driver_id, b.co_driver_id, b.pickup_ts from public.bookings b
            where b.pickup_km is not null and b.return_km is null and b.date_to < current_date
              and (case when b.pickup_ts is not null then b.pickup_ts < now() - interval '20 hours' else b.date_to < current_date - 1 end) loop
    select array_agg(p.id) into us from public.profiles p where p.status = 'active' and p.driver_id in (r.driver_id, r.co_driver_id);
    if us is null then continue; end if;
    perform private.push(null, us, left('Masz auto ' || private.plate(r.vehicle_id) || ' od ' || to_char(coalesce(r.pickup_ts at time zone 'Europe/Warsaw', r.date_to::timestamp), 'DD.MM HH24:MI'), 120),
                         'Zdaj je w aplikacji albo potwierdź „Jadę dalej”.', 'zdaj-' || r.id);
    n := n + 1;
  end loop;
  return n;
end $$;
