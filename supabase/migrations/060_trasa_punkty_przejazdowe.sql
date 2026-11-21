-- ============================================================================
-- Emage FLEET — mapa tras: punkty przejazdowe (uruchom po 059)
-- Kierownik przeciąga linię trasy na mapie – trasa jedzie przez wskazane miejsca (bez zatrzymania).
-- via: [{"lat":..,"lng":..,"after":"start" | id przystanku}] – punkt leży za startem albo za danym przystankiem.
-- ============================================================================
alter table public.routes add column if not exists via jsonb not null default '[]'::jsonb;
