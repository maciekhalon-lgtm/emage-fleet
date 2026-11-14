-- ============================================================================
-- Emage FLEET — bez kontroli paragonów, stałe km tras do faktury (uruchom po 036)
-- 1. Koniec wyrywkowej kontroli paragonów: tankowanie zapisuje się bez zdjęcia.
--    Zdjęcia dodane wcześniej zostają (kolumny photos bez zmian).
-- 2. Trasa ma stałe km do faktury za jeden kurs (routes.km). Wpisane wcześniej
--    w Rentowności tras (settings 'route_fin') przenosimy do trasy.
-- ============================================================================
drop trigger if exists costs_d_receipt on public.costs;
drop function if exists public.cost_receipt();
drop function if exists public.my_receipt_today();
drop function if exists public.receipt_required(uuid, date);

alter table public.routes add column if not exists km numeric(8,1) check (km is null or km >= 0);
update public.routes r set km = (s.value->'routes'->r.id::text->>'km')::numeric
  from public.settings s
  where s.key = 'route_fin' and r.km is null
    and (s.value->'routes'->r.id::text->>'km') ~ '^[0-9]+(\.[0-9]+)?$';
