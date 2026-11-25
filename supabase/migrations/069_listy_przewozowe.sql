-- ============================================================================
-- Emage FLEET — listy przewozowe (uruchom po 068)
--  • waybill_recipients – książka odbiorców (nazwa, adres, REGON, NIP, magazyn odbiorczy)
--  • waybills – wystawione listy: numer kolejny w roku (nr/RRRR), odbiorca zapisany w liście (kopia danych
--    z chwili wystawienia), pozycje w items (jsonb), palety, waga, auto, data wyjazdu, status
--  • numeracja: settings 'waybill' = {"startYear":2026,"startNo":370} – w 2026 pierwszy numer 370, w kolejnych latach od 1
--  • wystawia i widzi tylko kierownik floty
-- ============================================================================

create table if not exists public.waybill_recipients (
  id          uuid primary key default gen_random_uuid(),
  name        text not null check (length(trim(name)) > 0),
  address     text,
  regon       text,
  nip         text,
  wh_name     text,
  wh_address  text,
  created_by  uuid default auth.uid(),
  created_at  timestamptz not null default now(),
  updated_at  timestamptz not null default now()
);

create table if not exists public.waybills (
  id           uuid primary key default gen_random_uuid(),
  year         int,
  no           int,
  date         date not null default current_date,
  recipient_id uuid references public.waybill_recipients(id) on delete set null,
  r_name       text not null check (length(trim(r_name)) > 0),
  r_address    text,
  r_regon      text,
  r_nip        text,
  wh_name      text,
  wh_address   text,
  items        jsonb not null default '[]'::jsonb,   -- [{place, name, inna, karton, paleta}]
  pallets      int check (pallets >= 0),
  weight_kg    numeric check (weight_kg >= 0),
  vehicle_id   uuid references public.vehicles(id) on delete set null,
  plate        text,
  depart_date  date,
  status       text not null default 'wystawiony' check (status in ('wystawiony','anulowany')),
  note         text,
  printed_at   timestamptz,
  printed_by   text,
  created_by   uuid default auth.uid(),
  created_at   timestamptz not null default now(),
  updated_at   timestamptz not null default now(),
  unique (year, no)
);
create index if not exists waybills_date on public.waybills(date);

insert into public.settings (key, value) values ('waybill', '{"startYear":2026,"startNo":370}'::jsonb) on conflict (key) do nothing;

-- numer kolejny w roku daty listu; raz nadany numer się nie zmienia (także przy zmianie daty)
create or replace function public.waybill_no() returns trigger
language plpgsql security definer set search_path = public as $$
declare y int; n int; sy int; sn int;
begin
  if tg_op = 'UPDATE' then
    new.year := old.year; new.no := old.no; new.updated_at := now();
    return new;
  end if;
  y := extract(year from coalesce(new.date, current_date))::int;
  new.year := y;
  if new.no is not null then return new; end if;
  perform pg_advisory_xact_lock(hashtext('waybill_no' || y));
  select coalesce(max(no), 0) + 1 into n from public.waybills where year = y;
  select (value->>'startYear')::int, (value->>'startNo')::int into sy, sn from public.settings where key = 'waybill';
  if sy = y and n < coalesce(sn, 1) then n := sn; end if;
  new.no := n;
  return new;
end $$;
drop trigger if exists waybills_no on public.waybills;
create trigger waybills_no before insert or update on public.waybills for each row execute function public.waybill_no();

grant select, insert, update, delete on public.waybills, public.waybill_recipients to authenticated;
alter table public.waybills enable row level security;
alter table public.waybill_recipients enable row level security;
drop policy if exists waybills_fleet on public.waybills;
create policy waybills_fleet on public.waybills for all using (public.is_fleet()) with check (public.is_fleet());
drop policy if exists waybill_recipients_fleet on public.waybill_recipients;
create policy waybill_recipients_fleet on public.waybill_recipients for all using (public.is_fleet()) with check (public.is_fleet());

do $$ begin
  alter publication supabase_realtime add table public.waybills, public.waybill_recipients;
exception when duplicate_object then null; when undefined_object then null; end $$;

drop trigger if exists waybills_log on public.waybills;
create trigger waybills_log after insert or update or delete on public.waybills for each row execute function public.log_change();
