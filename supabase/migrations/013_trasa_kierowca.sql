-- ============================================================================
-- Emage FLEET — kierowca wybiera trasę z listy (uruchom po 012_kontrole.sql)
-- Przy przejęciu auta i w trakcie dnia; trasa od kierownika jest podpowiedziana i można ją zmienić.
-- Kierowca może wybrać tylko aktywną trasę. Zmiany zapisują się w historii.
-- ============================================================================
create or replace function public.route_guard() returns trigger
language plpgsql security definer set search_path = public as $$
begin
  if coalesce(current_setting('app.crew_rpc', true), '') = 'on' or coalesce(public.is_staff(), false) then return new; end if;
  if new.route_id is not null and (tg_op = 'INSERT' or new.route_id is distinct from old.route_id)
     and not exists (select 1 from public.routes where id = new.route_id and active) then
    raise exception 'Tej trasy nie można wybrać – jest nieaktywna.' using errcode = 'P0001';
  end if;
  return new;
end $$;
