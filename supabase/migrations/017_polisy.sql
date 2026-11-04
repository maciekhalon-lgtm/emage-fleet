-- ============================================================================
-- Emage FLEET — polisa auta (uruchom po 016_rozrzad.sql)
-- Towarzystwo, numer polisy, ważna do, numer assistance.
-- „Ważna do” = termin „Ubezpieczenie OC” (ten, który blokuje auto) – oba pola są zsynchronizowane.
-- ============================================================================
alter table public.vehicles add column if not exists insurer          text;
alter table public.vehicles add column if not exists policy_until     date;
alter table public.vehicles add column if not exists assistance_phone text;

-- auto → termin OC
create or replace function public.vehicle_policy_sync() returns trigger
language plpgsql security definer set search_path = public as $$
declare oc uuid;
begin
  if pg_trigger_depth() > 1 or new.policy_until is null then return null; end if;
  if tg_op = 'UPDATE' and new.policy_until is not distinct from old.policy_until
     and new.policy_no is not distinct from old.policy_no and new.insurer is not distinct from old.insurer then return null; end if;
  select id into oc from public.deadlines where vehicle_id = new.id and type = 'Ubezpieczenie OC' order by date desc limit 1;
  if oc is null then
    insert into public.deadlines (vehicle_id, type, date, interval_months, note)
      values (new.id, 'Ubezpieczenie OC', new.policy_until, 12,
              left(concat_ws(' · ', nullif(btrim(new.insurer), ''), nullif(btrim(new.policy_no), '')), 500));
  else
    update public.deadlines set date = new.policy_until,
        note = coalesce(left(nullif(concat_ws(' · ', nullif(btrim(new.insurer), ''), nullif(btrim(new.policy_no), '')), ''), 500), note)
      where id = oc;
  end if;
  return null;
end $$;
drop trigger if exists vehicles_policy_sync on public.vehicles;
create trigger vehicles_policy_sync after insert or update of policy_until, policy_no, insurer on public.vehicles
  for each row execute function public.vehicle_policy_sync();

-- termin OC (np. „OC odnowione”) → auto
create or replace function public.deadline_policy_sync() returns trigger
language plpgsql security definer set search_path = public as $$
begin
  if pg_trigger_depth() > 1 or new.type <> 'Ubezpieczenie OC' then return null; end if;
  update public.vehicles set policy_until = new.date
    where id = new.vehicle_id and policy_until is distinct from new.date
      and not exists (select 1 from public.deadlines d where d.vehicle_id = new.vehicle_id and d.type = 'Ubezpieczenie OC' and d.date > new.date);
  return null;
end $$;
drop trigger if exists deadlines_policy_sync on public.deadlines;
create trigger deadlines_policy_sync after insert or update of date, type on public.deadlines
  for each row execute function public.deadline_policy_sync();

-- istniejące terminy OC → „ważna do” w aucie
update public.vehicles v set policy_until = d.date
  from (select distinct on (vehicle_id) vehicle_id, date from public.deadlines where type = 'Ubezpieczenie OC' order by vehicle_id, date desc) d
  where d.vehicle_id = v.id and v.policy_until is null;
