-- ============================================================================
-- Emage FLEET — plany tras: kalkulacja kosztów i czasu kursu (uruchom po 061)
-- calc: pola wpisane przez kierownika (spalanie, cena paliwa, stawka kierowcy, opłaty, stawka przychodu,
-- kursy w miesiącu, godzina wyjazdu, postój…). Puste pole = wartość domyślna wyliczona z danych systemu.
-- ============================================================================
alter table public.route_plans add column if not exists calc jsonb not null default '{}'::jsonb;
