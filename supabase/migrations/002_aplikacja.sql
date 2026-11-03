-- ============================================================================
-- Emage FLEET — uzupełnienie dla aplikacji (uruchom po 001_schemat.sql)
-- ============================================================================

-- Zmiany na żywo: aplikacja odświeża się, gdy ktoś inny coś zapisze.
-- (Realtime też respektuje reguły dostępu – każdy dostaje tylko to, co może czytać.)
alter publication supabase_realtime add table
  public.vehicles, public.drivers, public.deadlines, public.bookings,
  public.costs, public.issues, public.documents, public.settings, public.profiles;

-- Imiona i nazwiska zatwierdzonych osób – do podpisów „Zgłosił(a)”, „Dodał(a)”.
-- Bez e-maili, ról i statusów; dostępne tylko dla zatwierdzonych użytkowników.
create or replace function public.people()
returns table (id uuid, full_name text)
language sql stable security definer set search_path = public as $$
  select p.id, p.full_name from public.profiles p
  where public.is_active() and p.status = 'active'
$$;

-- Tankowania wszystkich aut bez kwot i bez danych innych kierowców.
-- Kierowca potrzebuje ich, żeby policzyć swoje spalanie metodą „do pełna”
-- (odcinek między pełnymi tankowaniami bywa przejechany przez kilka osób).
-- Cudzy kierowca jest zastąpiony pseudonimem, żeby dało się podzielić odcinek.
create or replace function public.fuel_fills()
returns table (id uuid, vehicle_id uuid, date date, category text, odometer int, liters numeric, full_tank boolean, driver_ref text)
language sql stable security definer set search_path = public as $$
  select c.id, c.vehicle_id, c.date, c.category, c.odometer, c.liters, c.full_tank,
         case when c.driver_id = public.app_driver_id() then c.driver_id::text
              when c.driver_id is null then null
              else 'inny-' || left(md5(c.driver_id::text), 8) end
  from public.costs c
  where public.is_active() and c.category in ('Paliwo','Ładowanie') and c.odometer is not null and c.liters is not null
$$;

-- Historia zmian starsza niż rok jest usuwana (wywoływane przez aplikację kierownika floty).
create or replace function public.prune_change_log()
returns void language sql security definer set search_path = public as $$
  delete from public.change_log where public.is_fleet() and at < now() - interval '365 days'
$$;

grant execute on function public.people(), public.fuel_fills(), public.prune_change_log(), public.vehicle_consumption() to authenticated;
