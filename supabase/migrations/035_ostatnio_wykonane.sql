-- ============================================================================
-- Emage FLEET — kiedy i przy jakim przebiegu ostatnio wykonano termin (uruchom po 034)
-- last_done_km / last_done_date – wpisuje kierownik (np. „rozrząd wymieniony przy 454 210 km”),
-- od nich aplikacja liczy kolejny termin. Wpis w książce serwisowej z przebiegiem też je uzupełnia.
-- ============================================================================
alter table public.deadlines add column if not exists last_done_km integer;
alter table public.deadlines add column if not exists last_done_date date;

-- przebieg z dotychczasowych notatek („ostatnia wymiana przy 454210 km”, „Ostatnio wykonane: … przy 454 210 km”)
update public.deadlines
   set last_done_km = nullif(regexp_replace(substring(note from '(?i)ostatni\S* (?:wymiana|wykonane)[^·]*?przy ([0-9  .]+) ?km'), '[^0-9]', '', 'g'), '')::int
 where last_done_km is null and note ~* 'ostatni\S* (wymiana|wykonane)[^·]*przy [0-9]';

-- książka serwisowa: wymiana rozrządu / oleju albo wpis powiązany z terminem → zapamiętaj datę i przebieg
create or replace function public.service_last_done() returns trigger
language plpgsql security definer set search_path = public as $$
begin
  if new.km is null then return new; end if;
  update public.deadlines d set last_done_km = new.km, last_done_date = new.date
   where d.vehicle_id = new.vehicle_id
     and (d.id = new.deadline_id
          or (new.timing_change and d.type = 'Wymiana rozrządu')
          or (new.oil_change and d.type = 'Serwis olejowy'))
     and (d.last_done_date is null or d.last_done_date <= new.date);
  return new;
end $$;
drop trigger if exists service_last_done on public.service_entries;
create trigger service_last_done after insert or update of km, date, timing_change, oil_change, deadline_id on public.service_entries
  for each row execute function public.service_last_done();
