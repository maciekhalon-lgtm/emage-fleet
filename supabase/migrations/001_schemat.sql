-- ============================================================================
-- Emage FLEET — schemat bazy danych (Supabase / PostgreSQL)
-- Rejestracja: e-mail + hasło. Nowe konto ma status 'pending' i nie widzi
-- żadnych danych, dopóki kierownik floty nie zatwierdzi go i nie nada roli.
-- Role: floty (kierownik floty), serwisu (kierownik serwisu), kierowca.
-- Uprawnienia egzekwuje baza (Row Level Security), nie tylko interfejs.
-- ============================================================================

create extension if not exists pgcrypto;

-- ---------------------------------------------------------------------------
-- Profile użytkowników (1:1 z auth.users)
-- ---------------------------------------------------------------------------
create table public.drivers (
  id              uuid primary key default gen_random_uuid(),
  full_name       text not null,
  phone           text,
  categories      text,                       -- kategorie prawa jazdy, np. 'B, C'
  license_expiry  date,
  medical_expiry  date,
  created_at      timestamptz not null default now(),
  created_by      uuid default auth.uid(),
  updated_at      timestamptz not null default now(),
  updated_by      uuid default auth.uid()
);

create table public.profiles (
  id           uuid primary key references auth.users(id) on delete cascade,
  email        text not null,
  full_name    text not null default '',
  status       text not null default 'pending' check (status in ('pending','active','blocked')),
  role         text check (role in ('floty','serwisu','kierowca')),
  driver_id    uuid references public.drivers(id) on delete set null,
  created_at   timestamptz not null default now(),
  approved_at  timestamptz,
  approved_by  uuid references auth.users(id),
  constraint active_needs_role check (status <> 'active' or role is not null)
);

-- Po rejestracji w Supabase Auth tworzymy profil oczekujący na zatwierdzenie.
create or replace function public.handle_new_user() returns trigger
language plpgsql security definer set search_path = public as $$
begin
  insert into public.profiles (id, email, full_name)
  values (new.id, new.email, coalesce(new.raw_user_meta_data->>'full_name', ''));
  return new;
end $$;

create trigger on_auth_user_created
  after insert on auth.users
  for each row execute function public.handle_new_user();

-- ---------------------------------------------------------------------------
-- Funkcje pomocnicze używane w regułach dostępu
-- (security definer: czytają profil bez rekurencji reguł)
-- ---------------------------------------------------------------------------
create or replace function public.app_role() returns text
language sql stable security definer set search_path = public as $$
  select role from public.profiles where id = auth.uid() and status = 'active'
$$;

create or replace function public.app_driver_id() returns uuid
language sql stable security definer set search_path = public as $$
  select driver_id from public.profiles where id = auth.uid() and status = 'active'
$$;

create or replace function public.is_active() returns boolean
language sql stable as $$ select public.app_role() is not null $$;

create or replace function public.is_fleet() returns boolean
language sql stable as $$ select public.app_role() = 'floty' $$;

create or replace function public.is_staff() returns boolean
language sql stable as $$ select public.app_role() in ('floty','serwisu') $$;

-- ---------------------------------------------------------------------------
-- Dane floty
-- ---------------------------------------------------------------------------
create table public.vehicles (
  id             uuid primary key default gen_random_uuid(),
  plate          text not null,
  make           text not null,
  model          text not null,
  year           int,
  vin            text,
  fuel           text not null default 'Diesel' check (fuel in ('Diesel','Benzyna','Hybryda','Elektryczny','LPG')),
  km             int check (km >= 0),
  driver_id      uuid references public.drivers(id) on delete set null,   -- stały kierowca
  status         text not null default 'aktywny' check (status in ('aktywny','serwis','wycofany')),
  monthly_limit  numeric(12,2) check (monthly_limit >= 0),
  notes          text,
  created_at     timestamptz not null default now(),
  created_by     uuid default auth.uid(),
  updated_at     timestamptz not null default now(),
  updated_by     uuid default auth.uid()
);
create unique index vehicles_plate_uq on public.vehicles (upper(replace(plate, ' ', '')));

create table public.deadlines (
  id               uuid primary key default gen_random_uuid(),
  vehicle_id       uuid not null references public.vehicles(id) on delete cascade,
  type             text not null,
  date             date not null,
  km_due           int check (km_due >= 0),
  interval_months  int check (interval_months > 0),
  interval_km      int check (interval_km > 0),
  note             text,
  created_at       timestamptz not null default now(),
  created_by       uuid default auth.uid(),
  updated_at       timestamptz not null default now(),
  updated_by       uuid default auth.uid()
);

create table public.bookings (
  id             uuid primary key default gen_random_uuid(),
  vehicle_id     uuid not null references public.vehicles(id) on delete cascade,
  driver_id      uuid not null references public.drivers(id) on delete cascade,
  date_from      date not null,
  date_to        date not null,
  purpose        text,
  -- wydanie auta
  pickup_at      date,
  pickup_km      int check (pickup_km >= 0),
  pickup_fuel    smallint check (pickup_fuel in (0,25,50,75,100)),
  pickup_note    text,
  pickup_photos  text[] not null default '{}',
  pickup_by      uuid,
  -- zwrot auta
  return_at      date,
  return_km      int check (return_km >= 0),
  return_fuel    smallint check (return_fuel in (0,25,50,75,100)),
  return_note    text,
  return_photos  text[] not null default '{}',
  return_by      uuid,
  created_at     timestamptz not null default now(),
  created_by     uuid default auth.uid(),
  updated_at     timestamptz not null default now(),
  updated_by     uuid default auth.uid(),
  constraint dates_ok  check (date_to >= date_from),
  constraint return_after_pickup check (return_km is null or (pickup_km is not null and return_km >= pickup_km))
);

create table public.costs (
  id          uuid primary key default gen_random_uuid(),
  date        date not null,
  vehicle_id  uuid not null references public.vehicles(id) on delete cascade,
  driver_id   uuid references public.drivers(id) on delete set null,     -- kto tankował / jeździł
  category    text not null check (category in ('Paliwo','Ładowanie','Serwis i naprawy','Ubezpieczenie','Opony','Myjnia','Opłaty i parkingi','Leasing','Inne')),
  amount      numeric(12,2) not null check (amount >= 0),
  liters      numeric(10,2) check (liters > 0),                          -- litry albo kWh
  odometer    int check (odometer >= 0),
  full_tank   boolean not null default false,
  note        text,
  photos      text[] not null default '{}',
  created_at  timestamptz not null default now(),
  created_by  uuid default auth.uid(),
  updated_at  timestamptz not null default now(),
  updated_by  uuid default auth.uid(),
  -- przy tankowaniu i ładowaniu stan licznika oraz ilość są obowiązkowe
  constraint fuel_needs_odometer check (category not in ('Paliwo','Ładowanie') or (odometer is not null and liters is not null))
);

create table public.issues (
  id           uuid primary key default gen_random_uuid(),
  vehicle_id   uuid not null references public.vehicles(id) on delete cascade,
  title        text not null,
  description  text,
  severity     text not null default 'istotna' check (severity in ('drobna','istotna','stop')),
  status       text not null default 'nowe' check (status in ('nowe','naprawa','naprawione')),
  date         date not null default current_date,
  km           int check (km >= 0),
  repair_note  text,
  resolved_at  date,
  photos       text[] not null default '{}',
  created_at   timestamptz not null default now(),
  created_by   uuid default auth.uid(),
  updated_at   timestamptz not null default now(),
  updated_by   uuid default auth.uid()
);

create table public.documents (
  id            uuid primary key default gen_random_uuid(),
  vehicle_id    uuid not null references public.vehicles(id) on delete cascade,
  kind          text not null,
  name          text,
  valid_until   date,
  storage_path  text not null,          -- ścieżka w magazynie plików 'pliki'
  file_name     text,
  content_type  text,
  size_bytes    bigint,
  created_at    timestamptz not null default now(),
  created_by    uuid default auth.uid(),
  updated_at    timestamptz not null default now(),
  updated_by    uuid default auth.uid()
);

create table public.settings (
  key         text primary key,         -- np. 'budget' → {"monthly": 15000}
  value       jsonb not null default '{}',
  updated_at  timestamptz not null default now(),
  updated_by  uuid default auth.uid()
);

-- Historia zmian – zapisywana wyłącznie przez wyzwalacze, nie przez aplikację.
create table public.change_log (
  id          bigint generated always as identity primary key,
  at          timestamptz not null default now(),
  actor       uuid,
  action      text not null,            -- insert / update / delete
  entity      text not null,            -- nazwa tabeli
  entity_id   text,
  vehicle_id  uuid,
  data        jsonb                     -- stan wiersza po zmianie (albo przed usunięciem)
);
create index change_log_at_idx on public.change_log (at desc);

-- Indeksy pod najczęstsze zapytania
create index deadlines_vehicle_idx on public.deadlines (vehicle_id, date);
create index bookings_vehicle_idx  on public.bookings (vehicle_id, date_from, date_to);
create index bookings_driver_idx   on public.bookings (driver_id, date_from);
create index costs_vehicle_idx     on public.costs (vehicle_id, date);
create index costs_driver_idx      on public.costs (driver_id, date);
create index issues_vehicle_idx    on public.issues (vehicle_id, status);

-- ---------------------------------------------------------------------------
-- Wyzwalacze: znaczniki czasu, historia zmian, przebieg auta
-- ---------------------------------------------------------------------------
create or replace function public.touch_updated() returns trigger
language plpgsql as $$
begin
  new.updated_at := now();
  new.updated_by := auth.uid();
  return new;
end $$;

create or replace function public.log_change() returns trigger
language plpgsql security definer set search_path = public as $$
declare r jsonb;
begin
  r := case when tg_op = 'DELETE' then to_jsonb(old) else to_jsonb(new) end;
  insert into public.change_log (actor, action, entity, entity_id, vehicle_id, data)
  values (auth.uid(), lower(tg_op), tg_table_name, r->>'id',
          case when tg_table_name = 'vehicles' then (r->>'id')::uuid else nullif(r->>'vehicle_id','')::uuid end,
          r);
  return null;
end $$;

-- Licznik z tankowania lub zwrotu podnosi przebieg auta (nigdy go nie obniża).
-- Działa z uprawnieniami bazy, więc kierowca nie potrzebuje prawa edycji pojazdów.
create or replace function public.bump_vehicle_km() returns trigger
language plpgsql security definer set search_path = public as $$
declare k int;
begin
  if tg_table_name = 'costs' then
    k := (to_jsonb(new)->>'odometer')::int;
  else
    k := greatest(coalesce((to_jsonb(new)->>'pickup_km')::int, 0), coalesce((to_jsonb(new)->>'return_km')::int, 0));
  end if;
  if k is not null and k > 0 then
    update public.vehicles set km = k where id = new.vehicle_id and (km is null or km < k);
  end if;
  return null;
end $$;

-- Licznik nie może być niższy niż ostatni znany odczyt z tej samej lub wcześniejszej daty.
create or replace function public.check_odometer() returns trigger
language plpgsql security definer set search_path = public as $$
declare prev int;
begin
  if new.odometer is null then return new; end if;
  select max(x) into prev from (
    select odometer as x from public.costs where vehicle_id = new.vehicle_id and date <= new.date and id <> new.id and odometer is not null
    union all select pickup_km from public.bookings where vehicle_id = new.vehicle_id and pickup_at <= new.date
    union all select return_km from public.bookings where vehicle_id = new.vehicle_id and return_at <= new.date
  ) s;
  if prev is not null and new.odometer < prev then
    raise exception 'Stan licznika % km jest niższy niż ostatni zapisany dla tego auta (% km).', new.odometer, prev
      using errcode = 'check_violation';
  end if;
  return new;
end $$;

do $$
declare t text;
begin
  foreach t in array array['drivers','vehicles','deadlines','bookings','costs','issues','documents','settings'] loop
    execute format('create trigger %I_touch before update on public.%I for each row execute function public.touch_updated()', t, t);
    execute format('create trigger %I_log after insert or update or delete on public.%I for each row execute function public.log_change()', t, t);
  end loop;
end $$;

create trigger costs_odometer_check before insert or update of odometer, date, vehicle_id on public.costs
  for each row execute function public.check_odometer();
create trigger costs_bump_km after insert or update of odometer on public.costs
  for each row execute function public.bump_vehicle_km();
create trigger bookings_bump_km after insert or update of pickup_km, return_km on public.bookings
  for each row execute function public.bump_vehicle_km();

-- Zmiany ról też trafiają do historii.
create trigger profiles_log after update of role, status, driver_id on public.profiles
  for each row execute function public.log_change();

-- ---------------------------------------------------------------------------
-- Reguły dostępu (RLS)
-- ---------------------------------------------------------------------------
alter table public.profiles   enable row level security;
alter table public.drivers    enable row level security;
alter table public.vehicles   enable row level security;
alter table public.deadlines  enable row level security;
alter table public.bookings   enable row level security;
alter table public.costs      enable row level security;
alter table public.issues     enable row level security;
alter table public.documents  enable row level security;
alter table public.settings   enable row level security;
alter table public.change_log enable row level security;

-- Profile: każdy widzi swój; kierownik floty widzi i zatwierdza wszystkich.
-- Nikt poza kierownikiem floty nie zmieni roli ani statusu – także swojego.
create policy profiles_select on public.profiles for select
  using (id = auth.uid() or public.is_fleet());
create policy profiles_update on public.profiles for update
  using (public.is_fleet()) with check (public.is_fleet());

-- Kierowcy (osoby): widzą wszyscy zatwierdzeni, zmienia kierownik floty.
create policy drivers_select on public.drivers for select using (public.is_active());
create policy drivers_write  on public.drivers for all    using (public.is_fleet()) with check (public.is_fleet());

-- Pojazdy i terminy: widzą wszyscy zatwierdzeni, zmieniają kierownicy.
create policy vehicles_select  on public.vehicles  for select using (public.is_active());
create policy vehicles_write   on public.vehicles  for all    using (public.is_staff()) with check (public.is_staff());
create policy deadlines_select on public.deadlines for select using (public.is_active());
create policy deadlines_write  on public.deadlines for all    using (public.is_staff()) with check (public.is_staff());

-- Rezerwacje: widzą wszyscy (żeby było wiadomo, które auto jest wolne).
-- Kierownik floty zmienia wszystkie, kierowca tylko swoje.
create policy bookings_select on public.bookings for select using (public.is_active());
create policy bookings_fleet  on public.bookings for all
  using (public.is_fleet()) with check (public.is_fleet());
create policy bookings_driver_insert on public.bookings for insert
  with check (public.app_role() = 'kierowca' and driver_id = public.app_driver_id());
create policy bookings_driver_update on public.bookings for update
  using (public.app_role() = 'kierowca' and driver_id = public.app_driver_id())
  with check (driver_id = public.app_driver_id());
create policy bookings_driver_delete on public.bookings for delete
  using (public.app_role() = 'kierowca' and driver_id = public.app_driver_id() and pickup_km is null);

-- Koszty: kierownicy widzą wszystko; kierowca tylko swoje wpisy
-- i tylko w kategoriach: paliwo, ładowanie, myjnia, opłaty.
create policy costs_staff on public.costs for all
  using (public.is_staff()) with check (public.is_staff());
create policy costs_driver_select on public.costs for select
  using (public.app_role() = 'kierowca' and (driver_id = public.app_driver_id() or created_by = auth.uid()));
create policy costs_driver_insert on public.costs for insert
  with check (public.app_role() = 'kierowca' and driver_id = public.app_driver_id()
              and category in ('Paliwo','Ładowanie','Myjnia','Opłaty i parkingi'));
create policy costs_driver_update on public.costs for update
  using (public.app_role() = 'kierowca' and created_by = auth.uid())
  with check (driver_id = public.app_driver_id() and category in ('Paliwo','Ładowanie','Myjnia','Opłaty i parkingi'));
create policy costs_driver_delete on public.costs for delete
  using (public.app_role() = 'kierowca' and created_by = auth.uid());

-- Usterki: widzą i zgłaszają wszyscy; kierownicy obsługują;
-- kierowca poprawia swoje zgłoszenie, dopóki ma status 'nowe'.
create policy issues_select on public.issues for select using (public.is_active());
create policy issues_staff  on public.issues for all using (public.is_staff()) with check (public.is_staff());
create policy issues_driver_insert on public.issues for insert
  with check (public.app_role() = 'kierowca' and status = 'nowe');
create policy issues_driver_update on public.issues for update
  using (public.app_role() = 'kierowca' and created_by = auth.uid() and status = 'nowe')
  with check (status = 'nowe');

-- Dokumenty: widzą wszyscy, dodają i usuwają kierownicy.
create policy documents_select on public.documents for select using (public.is_active());
create policy documents_write  on public.documents for all using (public.is_staff()) with check (public.is_staff());

-- Ustawienia (budżet): widzą kierownicy, zmienia kierownik floty.
create policy settings_select on public.settings for select using (public.is_staff());
create policy settings_write  on public.settings for all using (public.is_fleet()) with check (public.is_fleet());

-- Historia zmian: tylko kierownik floty, tylko odczyt.
create policy change_log_select on public.change_log for select using (public.is_fleet());

-- ---------------------------------------------------------------------------
-- Średnie spalanie aut (metoda „do pełna”) – dostępne dla wszystkich
-- zatwierdzonych, także kierowców, którzy nie widzą cudzych tankowań.
-- Zwraca tylko sumy, bez danych osobowych.
-- ---------------------------------------------------------------------------
create or replace function public.vehicle_consumption()
returns table (vehicle_id uuid, km int, qty numeric, per100 numeric)
language sql stable security definer set search_path = public as $$
  with fills as (
    select c.vehicle_id, c.odometer, c.liters, c.full_tank,
           sum(case when c.full_tank then 1 else 0 end)
             over (partition by c.vehicle_id order by c.odometer, c.date, c.id rows between unbounded preceding and 1 preceding) as seg
    from public.costs c
    where c.category in ('Paliwo','Ładowanie') and c.odometer is not null and c.liters is not null
  ), segs as (
    -- odcinek = od jednego pełnego tankowania do następnego
    select f.vehicle_id, f.seg,
           max(f.odometer) filter (where f.full_tank) as end_km,
           sum(f.liters) as qty
    from fills f where f.seg > 0
    group by f.vehicle_id, f.seg
    having bool_or(f.full_tank)
  ), starts as (
    select vehicle_id, seg + 1 as seg, odometer as start_km
    from (select vehicle_id, odometer, row_number() over (partition by vehicle_id order by odometer, id) - 1 as seg
          from public.costs where category in ('Paliwo','Ładowanie') and full_tank and odometer is not null) s
  )
  select s.vehicle_id, sum(s.end_km - st.start_km)::int, sum(s.qty), round(sum(s.qty) / nullif(sum(s.end_km - st.start_km), 0) * 100, 2)
  from segs s join starts st using (vehicle_id, seg)
  where public.is_active() and s.end_km > st.start_km
  group by s.vehicle_id
$$;

-- ---------------------------------------------------------------------------
-- Magazyn plików (zdjęcia, dokumenty) – prywatny, tylko dla zatwierdzonych
-- ---------------------------------------------------------------------------
insert into storage.buckets (id, name, public, file_size_limit, allowed_mime_types)
values ('pliki', 'pliki', false, 20971520, array['image/jpeg','image/png','image/webp','image/gif','application/pdf'])
on conflict (id) do nothing;

create policy pliki_select on storage.objects for select
  using (bucket_id = 'pliki' and public.is_active());
create policy pliki_insert on storage.objects for insert
  with check (bucket_id = 'pliki' and public.is_active());
create policy pliki_delete on storage.objects for delete
  using (bucket_id = 'pliki' and (public.is_staff() or owner = auth.uid()));
