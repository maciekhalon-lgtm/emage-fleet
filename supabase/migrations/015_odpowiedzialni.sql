-- ============================================================================
-- Emage FLEET — kierowcy odpowiedzialni za busa (uruchom po 014_automatyka.sql)
-- Zastępuje pole „Stały kierowca”: dotychczasowy stały kierowca staje się pierwszym odpowiedzialnym.
-- Odpowiedzialni mają pierwszeństwo przy wyborze auta i dostają powiadomienia o swoim busie.
-- ============================================================================
alter table public.vehicles add column if not exists responsible uuid[] not null default '{}';
update public.vehicles set responsible = array[driver_id] where driver_id is not null and cardinality(responsible) = 0;

-- Porządek listy (bez pustych i powtórzeń); driver_id = pierwszy odpowiedzialny (zgodność ze starszymi miejscami)
create or replace function public.vehicle_responsible() returns trigger
language plpgsql as $$
begin
  new.responsible := coalesce(array(
    select x from unnest(new.responsible) with ordinality t(x, o) where x is not null group by x order by min(o)), '{}');
  new.driver_id := new.responsible[1];
  return new;
end $$;
drop trigger if exists vehicles_responsible on public.vehicles;
create trigger vehicles_responsible before insert or update of responsible, driver_id on public.vehicles
  for each row execute function public.vehicle_responsible();

-- Usunięty kierowca znika z list odpowiedzialnych
create or replace function public.driver_drop_responsible() returns trigger
language plpgsql security definer set search_path = public as $$
begin
  update public.vehicles set responsible = array_remove(responsible, old.id) where old.id = any(responsible);
  return old;
end $$;
drop trigger if exists drivers_drop_responsible on public.drivers;
create trigger drivers_drop_responsible after delete on public.drivers
  for each row execute function public.driver_drop_responsible();

-- Auto niesprawne → obaj kierownicy i kierowcy odpowiedzialni za tego busa
create or replace function public.notify_issue() returns trigger
language plpgsql security definer set search_path = public, private as $$
declare resp uuid[];
begin
  if new.severity = 'stop' and new.status <> 'naprawione' and (tg_op = 'INSERT' or old.severity is distinct from 'stop') then
    select array_agg(p.id) into resp from public.profiles p join public.vehicles v on v.id = new.vehicle_id
      where p.status = 'active' and p.driver_id = any(v.responsible);
    perform private.push(array['floty','serwisu'], resp, 'Auto niesprawne: ' || private.plate(new.vehicle_id), left(new.title, 140), 'stop-' || new.id);
  end if;
  return null;
end $$;
