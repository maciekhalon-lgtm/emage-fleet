-- 032: rozmiar opon przypisany do auta (np. 225/75 R16C) – do zamawiania opon i porównania z kompletami w module Opony.
alter table public.vehicles add column if not exists tire_size text;
alter table public.vehicles drop constraint if exists vehicles_tire_size_len;
alter table public.vehicles add constraint vehicles_tire_size_len check (tire_size is null or length(tire_size) <= 40);
