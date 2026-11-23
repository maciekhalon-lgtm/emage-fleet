\set ON_ERROR_STOP 0
\echo '1 VAT na paliwo z Ustawień: listopad 2026 – 8%, sierpień przed obniżką – 23%, poza okresami – 23%'
select private.fuel_vat(date '2026-11-15') = 8 as ok_listopad_8, private.fuel_vat(date '2026-08-10') = 23 as ok_sierpien_23, private.fuel_vat(date '2027-02-01') = 23 as ok_brak_23;
\echo '2 zmiana stawki od grudnia nie zmienia listopada'
update settings set value = jsonb_set(value, '{fuelPL}', (value->'fuelPL') || '[{"from":"2026-12-01","to":"2026-12-31","rate":23}]'::jsonb) where key = 'vat';
select private.fuel_vat(date '2026-11-30') = 8 as ok_listopad_bez_zmian, private.fuel_vat(date '2026-12-05') = 23 as ok_grudzien_23;
\echo '3 108 zł brutto w listopadzie = 100 zł netto'
select round(108 / (1 + private.fuel_vat(date '2026-11-20') / 100.0), 2) = 100 as ok_108_na_100;
