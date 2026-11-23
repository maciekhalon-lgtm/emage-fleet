-- ============================================================================
-- Emage FLEET — VAT na paliwo w Polsce z Ustawień (uruchom po 066)
--  • settings 'vat' = {"fuelPL": [{"from":"2026-10-03","to":"2026-12-31","rate":8}, …]}
--    okresy ustawia kierownik floty (Ustawienia → VAT na paliwo); stawkę dobieramy po dacie tankowania.
--  • data poza wszystkimi okresami = brak stawki → liczymy 23% (aplikacja pokazuje „brak stawki VAT”).
--  • domyślnie: dotychczasowe okresy obniżki (17–31.08.2026 i 3.10–31.12.2026 – 8%, reszta 23%).
-- ============================================================================

insert into public.settings (key, value) values ('vat', jsonb_build_object('fuelPL', jsonb_build_array(
  jsonb_build_object('from', '2020-01-01', 'to', '2026-08-16', 'rate', 23),
  jsonb_build_object('from', '2026-08-17', 'to', '2026-08-31', 'rate', 8),
  jsonb_build_object('from', '2026-09-01', 'to', '2026-10-02', 'rate', 23),
  jsonb_build_object('from', '2026-10-03', 'to', '2026-12-31', 'rate', 8))))
on conflict (key) do nothing;

create or replace function private.fuel_vat(d date) returns numeric
language sql stable security definer set search_path = public as $$
  select coalesce((
    select (p->>'rate')::numeric
      from public.settings s, jsonb_array_elements(coalesce(s.value->'fuelPL', '[]'::jsonb)) p
     where s.key = 'vat' and d >= (p->>'from')::date and d <= coalesce(nullif(p->>'to', '')::date, date '9999-12-31')
     order by (p->>'from')::date desc limit 1), 23)
$$;
grant execute on function private.fuel_vat(date) to authenticated;
