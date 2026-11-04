-- Emage FLEET — polisy aut (lista od Macieja, 2026-11-04)
-- Towarzystwo (z pakietem assistance), numer polisy, ważna do, telefon assistance.
-- Wygasłe na dzień 04.11.2026 (DZG 85526, WND 3193A, DW 3UA13) – bez daty, żeby nie blokować aut; datę dopisać po odnowieniu.
-- Pominięte: WZ 682HU (brak danych).
-- Numery assistance: Warta – warta.pl; Generali, InterRisk, PZU – rankomat.pl. Do sprawdzenia z polisą.
with src(plate, insurer, policy_no, until, phone) as (values
  ('DW 5SW82',  'Warta – Złoty+',            '920067598215',  date '2027-07-04', '+48 502 308 308'),
  ('WND 7466A', 'Generali – Komfort Plus',   '50019112354',   date '2027-03-10', '913 913 913'),
  ('DZG 85526', 'Warta',                     '920059098773',  null,              '+48 502 308 308'),
  ('DW 2UR55',  'Warta – Złoty+',            '908107071293',  date '2026-12-19', '+48 502 308 308'),
  ('DW 3UN01',  'Warta – Złoty+',            '908107071291',  date '2026-12-18', '+48 502 308 308'),
  ('DW 8UN40',  'Warta – Złoty+',            '908107071292',  date '2026-12-18', '+48 502 308 308'),
  ('DW 3UA13',  'Warta – Złoty+',            '920058881412',  null,              '+48 502 308 308'),
  ('DW 4VS51',  'InterRisk – Premium',       'FLM-L/I003687', date '2027-05-28', '22 295 82 12'),
  ('DW 4VS52',  'Warta – Złoty+',            '908107168882',  date '2027-05-28', '+48 502 308 308'),
  ('DW 1SK98',  'Warta – Złoty+',            '908107168319',  date '2027-05-10', '+48 502 308 308'),
  ('DW 7SG13',  'Warta – Złoty',             '908107168065',  date '2027-04-21', '+48 502 308 308'),
  ('WND 3193A', 'Generali – Komfort Plus',   '50018269660',   null,              '913 913 913'),
  ('WZ 376HP',  'Warta – Złoty+',            '920064881135',  date '2027-04-21', '+48 502 308 308'),
  ('WZ 917JL',  'Generali – Komfort Plus',   '50018290257',   date '2026-11-12', '913 913 913'),
  ('WGM 3312V', 'PZU – Assistance bez limitu w PL', '7ML30002488', date '2027-07-14', '22 566 55 55')
), m as (
  select s.*, v.id as vid from src s join public.vehicles v on upper(replace(v.plate, ' ', '')) = upper(replace(s.plate, ' ', ''))
), up as (
  update public.vehicles v set insurer = m.insurer, policy_no = m.policy_no, assistance_phone = m.phone,
      policy_until = coalesce(m.until, v.policy_until)
    from m where v.id = m.vid returning v.id
)
select (select count(*) from up) as uzupelnione_auta,
       (select count(*) from m where until is not null) as z_data_waznosci,
       (select string_agg(plate, ', ') from src where plate not in (select plate from m)) as brak_w_systemie;
