-- ============================================================================
-- Emage FLEET — zwroty: klient przy zwrocie (uruchom po 074)
--  client_id – klient z bazy klientów (Planer tras), client_name – nazwa (też wpisana ręcznie, gdy klienta nie ma w bazie).
-- ============================================================================
alter table public.return_scans add column if not exists client_id uuid references public.clients(id) on delete set null;
alter table public.return_scans add column if not exists client_name text;
create index if not exists return_scans_code on public.return_scans(code);
