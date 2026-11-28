-- ============================================================================
-- Emage FLEET — zwroty: na list przewozowy / specyfikację trafiają tylko zwroty zdane na magazyn (uruchom po 073)
-- ============================================================================
update public.return_scans set waybill_id = null where waybill_id is not null and status <> 'zdany';
alter table public.return_scans drop constraint if exists return_scans_wb_zdany;
alter table public.return_scans add constraint return_scans_wb_zdany check (waybill_id is null or status = 'zdany');
