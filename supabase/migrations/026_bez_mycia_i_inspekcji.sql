-- ============================================================================
-- Emage FLEET — usunięcie nieużywanych modułów: sprzątanie/mycie aut i inspekcje (uruchom po 025)
-- Obie tabele były puste, aplikacja nie ma już do nich żadnych ekranów (v137).
-- Usuwamy tabele (z ich regułami i wyzwalaczami), funkcje pomocnicze i kolumnę vehicles.last_clean.
-- Powiadomienie „zmiana danych do akceptacji” zostaje (notify_pending bez gałęzi sprzątania).
-- ============================================================================
do $$ begin
  if exists (select 1 from pg_publication_tables where pubname = 'supabase_realtime' and tablename = 'cleanings') then
    alter publication supabase_realtime drop table public.cleanings; end if;
  if exists (select 1 from pg_publication_tables where pubname = 'supabase_realtime' and tablename = 'inspections') then
    alter publication supabase_realtime drop table public.inspections; end if;
end $$;

drop table if exists public.cleanings;
drop table if exists public.inspections;
drop function if exists public.cleaning_guard();
drop function if exists public.cleaning_sync();
alter table public.vehicles drop column if exists last_clean;

create or replace function public.notify_pending() returns trigger
language plpgsql security definer set search_path = public, private as $$
begin
  if tg_table_name = 'data_change_requests' and new.status = 'pending' then
    perform private.push(array['floty'], null, 'Zmiana danych do akceptacji',
      coalesce((select full_name from public.drivers where id = new.driver_id), 'kierowca') || ': nowy telefon ' || coalesce(new.new_value, ''), 'req-' || new.id);
  end if;
  return null;
end $$;
