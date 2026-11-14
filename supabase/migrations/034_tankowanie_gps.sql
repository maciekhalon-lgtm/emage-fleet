-- ============================================================================
-- Emage FLEET — tankowanie a pozycja busa z GPS (uruchom po 033)
-- Dla tankowania z karty funkcja „powiadomienia” zapisuje, gdzie był bus w chwili tankowania:
--   gps_place  – miejscowość z lokalizatora, gps_dist_km – odległość busa od stacji (km),
--   gps_ok     – true: bus był przy stacji, false: daleko (podejrzane), null: nie da się ustalić,
--   gps_checked_at – kiedy sprawdzono.
-- Zapisuje tylko funkcja (klucz serwisowy).
-- ============================================================================
alter table public.fuel_card_rows add column if not exists gps_place text;
alter table public.fuel_card_rows add column if not exists gps_dist_km numeric(8,1);
alter table public.fuel_card_rows add column if not exists gps_ok boolean;
alter table public.fuel_card_rows add column if not exists gps_checked_at timestamptz;
create index if not exists fuel_card_rows_gps_unchecked on public.fuel_card_rows(tx_date) where gps_checked_at is null;
