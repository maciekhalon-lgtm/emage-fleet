-- ============================================================================
-- Emage FLEET — zmiany danych kierowcy do akceptacji (uruchom po 004_dzien_pracy.sql)
-- Kierowca proponuje zmianę (na razie: telefon), kierownik floty akceptuje albo odrzuca.
-- ============================================================================

create table if not exists public.data_change_requests (
  id          uuid primary key default gen_random_uuid(),
  driver_id   uuid not null references public.drivers(id) on delete cascade,
  field       text not null check (field in ('phone')),
  old_value   text,
  new_value   text not null check (length(new_value) between 3 and 40),
  status      text not null default 'pending' check (status in ('pending','approved','rejected')),
  created_at  timestamptz not null default now(),
  created_by  uuid default auth.uid(),
  decided_at  timestamptz,
  decided_by  uuid
);
create index if not exists data_change_requests_status_idx on public.data_change_requests (status, created_at desc);

alter table public.data_change_requests enable row level security;
drop policy if exists dcr_select on public.data_change_requests;
drop policy if exists dcr_driver_insert on public.data_change_requests;
drop policy if exists dcr_driver_delete on public.data_change_requests;
-- Kierowca widzi swoje wnioski, kierownik floty wszystkie.
create policy dcr_select on public.data_change_requests for select
  using (public.is_fleet() or driver_id = public.app_driver_id());
-- Kierowca składa wniosek tylko dla siebie i tylko jako oczekujący.
create policy dcr_driver_insert on public.data_change_requests for insert
  with check (public.app_role() = 'kierowca' and driver_id = public.app_driver_id() and status = 'pending');
-- Kierowca może wycofać swój oczekujący wniosek.
create policy dcr_driver_delete on public.data_change_requests for delete
  using (driver_id = public.app_driver_id() and status = 'pending');

-- Akceptacja lub odrzucenie – tylko kierownik floty; przy akceptacji dane kierowcy zmieniają się od razu.
create or replace function public.decide_change_request(request_id uuid, approve boolean)
returns void language plpgsql security definer set search_path = public as $$
declare r public.data_change_requests;
begin
  if not public.is_fleet() then raise exception 'Tylko kierownik floty może akceptować zmiany danych.'; end if;
  select * into r from public.data_change_requests where id = request_id and status = 'pending' for update;
  if not found then raise exception 'Ten wniosek został już rozpatrzony.'; end if;
  if approve and r.field = 'phone' then
    update public.drivers set phone = r.new_value where id = r.driver_id;
  end if;
  update public.data_change_requests
    set status = case when approve then 'approved' else 'rejected' end, decided_at = now(), decided_by = auth.uid()
    where id = request_id;
end $$;
grant execute on function public.decide_change_request(uuid, boolean) to authenticated;

-- Historia zmian i odświeżanie na żywo.
drop trigger if exists data_change_requests_log on public.data_change_requests;
create trigger data_change_requests_log after insert or update or delete on public.data_change_requests
  for each row execute function public.log_change();
do $$ begin
  alter publication supabase_realtime add table public.data_change_requests;
exception when duplicate_object then null; end $$;
