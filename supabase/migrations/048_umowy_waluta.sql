-- ============================================================================
-- Emage FLEET — waluta umowy leasingu / najmu (uruchom po 047)
-- Rata, wykup i opłata za km ponad limit są w walucie umowy (PLN albo EUR).
-- Aplikacja przelicza ratę na złote po średnim kursie NBP (ostatni dzień roboczy danego miesiąca,
-- dla bieżącego miesiąca – najnowszy kurs). Dotychczasowe umowy: PLN.
-- ============================================================================
alter table public.vehicle_contracts add column if not exists currency text not null default 'PLN';
alter table public.vehicle_contracts drop constraint if exists vehicle_contracts_currency_check;
alter table public.vehicle_contracts add constraint vehicle_contracts_currency_check check (currency in ('PLN','EUR','CZK'));
