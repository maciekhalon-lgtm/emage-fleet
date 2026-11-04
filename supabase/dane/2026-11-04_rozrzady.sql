-- Emage FLEET — dane z pliku „EMAGE_rozrzady_28_pojazdow_status.xlsx” (2026-11-04)
-- Termin „Wymiana rozrządu” (ostatnia wymiana + 80 000 km, przypomnienie 5 000 km wcześniej)
-- oraz aktualny przebieg auta, jeśli w pliku jest wyższy niż w systemie.
-- Pominięte (brak danych o wymianie): DW 3UA13, DW 4VS51, WGM 4792V, WGM 7098U.
with src(plate, last_km, cur_km) as (values
  ('DW 1SK98', 454210, 531864), ('DW 2UR55', 453170, null), ('DW 3UN01', 538555, 539555), ('DW 3UR07', 543345, 565971),
  ('DW 4VS52', 513000, 514405), ('DW 5SW82', 540000, 616105), ('DW 7SG13', 389055, 439841), ('DW 8UN40', 415590, 438997),
  ('DZG 79992', 381638, 391466), ('DZG 82027', 90000, null), ('DZG 82791', 376084, 441146), ('DZG 85526', 151000, 163500),
  ('DZG 90903', 499000, 503455), ('PKE 85F7', 285407, 342822), ('PO 6XA26', 446547, null), ('WGM 3312V', 150000, 193252),
  ('WJ 2028H', 562728, null), ('WND 3193A', 570000, 606969), ('WND 7466A', 564122, 565122), ('WU 1218M', 873250, 873250),
  ('WU 6413M', 701908, 701908), ('WZ 376HP', 457709, 457709), ('WZ 682HU', 362000, 362000), ('WZ 917JL', 450806, 512316)
), m as (
  select s.*, v.id as vid from src s join public.vehicles v on upper(replace(v.plate, ' ', '')) = upper(replace(s.plate, ' ', ''))
), km_up as (
  update public.vehicles v set km = m.cur_km from m where v.id = m.vid and m.cur_km is not null and m.cur_km > coalesce(v.km, 0) returning v.id
), dl_up as (
  update public.deadlines d set km_due = m.last_km + 80000, interval_km = 80000, interval_months = 60, remind_km = 5000,
      note = 'Z rejestru rozrządów: ostatnia wymiana przy ' || m.last_km || ' km'
    from m where d.vehicle_id = m.vid and d.type = 'Wymiana rozrządu' returning d.vehicle_id
), dl_new as (
  insert into public.deadlines (vehicle_id, type, date, km_due, interval_months, interval_km, remind_km, note)
  select m.vid, 'Wymiana rozrządu', (current_date + interval '60 months')::date, m.last_km + 80000, 60, 80000, 5000,
         'Z rejestru rozrządów: ostatnia wymiana przy ' || m.last_km || ' km'
  from m where not exists (select 1 from public.deadlines d where d.vehicle_id = m.vid and d.type = 'Wymiana rozrządu')
  returning vehicle_id
)
select (select count(*) from m) as dopasowane_auta,
       (select count(*) from dl_new) + (select count(*) from dl_up) as terminy_rozrzadu,
       (select count(*) from km_up) as zaktualizowane_przebiegi,
       (select string_agg(plate, ', ') from src where plate not in (select plate from m)) as brak_w_systemie;
