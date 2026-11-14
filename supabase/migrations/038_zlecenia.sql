-- ============================================================================
-- Emage FLEET — serwis w trzech krokach: zgłoszenie → zlecenie → zakończenie naprawy (uruchom po 037)
-- 1. „Informacja serwisowa” (np. wymienić rozrząd) = zgłoszenie z rodzajem service_type (olej / rozrząd / inne).
-- 2. Zlecenie dla warsztatu (work_orders) z pozycjami (work_order_items): usterki, informacje serwisowe
--    i zbliżające się terminy oleju i rozrządu – jedno lub kilka aut. Numer ZL/RRRR/NNN nadaje baza.
--    Pozycja z usterką ustawia ją „w naprawie”.
-- 3. Zakończenie: aplikacja zapisuje wpis w książce serwisowej (on zamyka usterki i odnawia olej / rozrząd)
--    i oznacza pozycje jako zrobione albo niezrobione (usterka wraca wtedy do „nowe”).
-- Kierowca widzi tylko swoje zgłoszenia (oraz otwarte „auto niesprawne”, żeby nie wziąć zepsutego auta).
-- ============================================================================
alter table public.issues add column if not exists service_type text check (service_type is null or service_type in ('olej','rozrzad','inne'));

drop policy if exists issues_select on public.issues;
create policy issues_select on public.issues for select using (
  public.is_staff() or (public.is_active() and (created_by = auth.uid() or (severity = 'stop' and status <> 'naprawione'))));

create table if not exists public.work_orders (
  id          uuid primary key default gen_random_uuid(),
  no          text unique,
  workshop_id uuid references public.workshops(id) on delete set null,
  workshop    text,
  date        date not null default current_date,
  note        text,
  status      text not null default 'otwarte' check (status in ('otwarte','zakonczone','anulowane')),
  created_by  uuid default auth.uid(),
  created_at  timestamptz not null default now(),
  closed_at   timestamptz
);
create table if not exists public.work_order_items (
  id               uuid primary key default gen_random_uuid(),
  order_id         uuid not null references public.work_orders(id) on delete cascade,
  vehicle_id       uuid not null references public.vehicles(id) on delete cascade,
  issue_id         uuid references public.issues(id) on delete set null,
  deadline_id      uuid references public.deadlines(id) on delete set null,
  kind             text not null default 'usterka' check (kind in ('usterka','olej','rozrzad','inne')),
  title            text not null check (length(trim(title)) > 0),
  status           text not null default 'zlecone' check (status in ('zlecone','zrobione','niezrobione')),
  service_entry_id uuid references public.service_entries(id) on delete set null,
  created_at       timestamptz not null default now()
);
create index if not exists work_order_items_order on public.work_order_items(order_id);
create index if not exists work_order_items_issue on public.work_order_items(issue_id);

grant select, insert, update, delete on public.work_orders, public.work_order_items to authenticated;
alter table public.work_orders enable row level security;
alter table public.work_order_items enable row level security;
drop policy if exists work_orders_staff on public.work_orders;
create policy work_orders_staff on public.work_orders for all using (public.is_staff()) with check (public.is_staff());
drop policy if exists work_order_items_staff on public.work_order_items;
create policy work_order_items_staff on public.work_order_items for all using (public.is_staff()) with check (public.is_staff());

-- numer zlecenia ZL/RRRR/NNN (kolejny w roku)
create or replace function public.work_order_no() returns trigger
language plpgsql security definer set search_path = public as $$
declare y text := to_char(coalesce(new.date, current_date), 'YYYY'); n int;
begin
  if new.no is not null then return new; end if;
  perform pg_advisory_xact_lock(hashtext('work_order_no' || y));
  select coalesce(max(substring(no from '^ZL/' || y || '/([0-9]+)$')::int), 0) + 1 into n from public.work_orders where no like 'ZL/' || y || '/%';
  new.no := 'ZL/' || y || '/' || lpad(n::text, 3, '0');
  return new;
end $$;
drop trigger if exists work_orders_no on public.work_orders;
create trigger work_orders_no before insert on public.work_orders for each row execute function public.work_order_no();

-- usterka na zleceniu = „w naprawie”; pozycja niezrobiona albo usunięta = usterka wraca do „nowe”
create or replace function public.work_item_issue() returns trigger
language plpgsql security definer set search_path = public as $$
begin
  if tg_op = 'DELETE' then
    if old.issue_id is not null and old.status = 'zlecone' then
      update public.issues set status = 'nowe' where id = old.issue_id and status = 'naprawa';
    end if;
    return old;
  end if;
  if new.issue_id is not null then
    if new.status = 'zlecone' then
      update public.issues set status = 'naprawa' where id = new.issue_id and status = 'nowe';
    elsif new.status = 'niezrobione' then
      update public.issues set status = 'nowe' where id = new.issue_id and status = 'naprawa';
    end if;
  end if;
  return new;
end $$;
drop trigger if exists work_order_items_issue on public.work_order_items;
create trigger work_order_items_issue after insert or update of status or delete on public.work_order_items
  for each row execute function public.work_item_issue();

do $$ begin
  alter publication supabase_realtime add table public.work_orders, public.work_order_items;
exception when duplicate_object then null; when undefined_object then null; end $$;

drop trigger if exists work_orders_log on public.work_orders;
create trigger work_orders_log after insert or update or delete on public.work_orders for each row execute function public.log_change();
