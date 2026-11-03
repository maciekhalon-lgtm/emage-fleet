-- ============================================================================
-- Emage FLEET — tachograf w aucie (uruchom po 008_trasy.sql)
-- Ustawia tylko kierownik floty; kierowca widzi na karcie auta, że auto ma tachograf.
-- ============================================================================
alter table public.vehicles add column if not exists has_tacho boolean not null default false;

create or replace function public.tacho_guard() returns trigger
language plpgsql security definer set search_path = public as $$
begin
  if coalesce(public.is_fleet(), false) then return new; end if;
  if tg_op = 'INSERT' then new.has_tacho := false; else new.has_tacho := old.has_tacho; end if;
  return new;
end $$;
drop trigger if exists vehicles_tacho_guard on public.vehicles;
create trigger vehicles_tacho_guard before insert or update on public.vehicles
  for each row execute function public.tacho_guard();
