-- Emage FLEET — przeniesienie danych ze starej strony (artefaktu Claude), 3.11.2026
-- Na starej stronie był jeden prawdziwy wpis: pojazd FIAT Ducato DW3UR07.
-- Uruchom raz w Supabase → SQL Editor (jako właściciel projektu).
-- Jeśli pojazd o tym numerze już istnieje, nic się nie zmieni.

insert into public.vehicles (plate, make, model, year, vin, fuel, km, status)
values ('DW3UR07', 'FIAT', 'DUCATO', 2022, 'ZFA25000002W28263', 'Diesel', 567000, 'aktywny')
on conflict do nothing;
