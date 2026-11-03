-- ============================================================================
-- Emage FLEET — tankowanie w walucie (PLN, EUR, CZK) z kursem NBP i stacja (uruchom po 009)
-- Kurs pobiera baza z API NBP (tabela A, kurs średni z dnia tankowania; gdy go jeszcze nie ma
-- – weekend, święto, przed publikacją – z ostatniego wcześniejszego dnia). Kwota w zł liczy się sama.
-- Kurs ręcznie może wpisać tylko kierownik floty.
-- ============================================================================
create extension if not exists http with schema extensions;

alter table public.costs add column if not exists currency    text not null default 'PLN' check (currency in ('PLN','EUR','CZK'));
alter table public.costs add column if not exists amount_orig numeric(12,2) check (amount_orig >= 0);
alter table public.costs add column if not exists fx_rate     numeric(12,6) check (fx_rate > 0);
alter table public.costs add column if not exists fx_date     date;
alter table public.costs add column if not exists fx_table    text;
alter table public.costs add column if not exists fx_manual   boolean not null default false;
alter table public.costs add column if not exists station     text;

-- Kursy pobrane z NBP (pamięć podręczna i zapas, gdy NBP chwilowo nie odpowiada)
create table if not exists public.fx_rates (
  code     text not null,
  eff_date date not null,
  mid      numeric(12,6) not null,
  tbl      text,
  fetched  timestamptz not null default now(),
  primary key (code, eff_date)
);
alter table public.fx_rates enable row level security;
drop policy if exists fx_rates_select on public.fx_rates;
create policy fx_rates_select on public.fx_rates for select using (public.is_active());
grant select on public.fx_rates to authenticated;

-- Kurs średni NBP dla waluty na dzień d (ostatni opublikowany nie później niż d)
create or replace function public.nbp_rate(cur text, d date)
returns table (rate numeric, eff_date date, tbl text)
language plpgsql security definer set search_path = public, extensions as $$
#variable_conflict use_column
declare resp record; j jsonb; r jsonb;
begin
  cur := upper(btrim(cur));
  if cur not in ('EUR','CZK') then raise exception 'Nieobsługiwana waluta: %', cur using errcode = 'P0001'; end if;
  if d is null or d > current_date then d := current_date; end if;
  begin
    perform extensions.http_set_curlopt('CURLOPT_TIMEOUT', '6');
    select * into resp from extensions.http_get(format('https://api.nbp.pl/api/exchangerates/rates/a/%s/%s/%s/?format=json', lower(cur), d - 10, d));
    if resp.status = 200 then
      j := resp.content::jsonb;
      for r in select * from jsonb_array_elements(j->'rates') loop
        insert into public.fx_rates (code, eff_date, mid, tbl) values (cur, (r->>'effectiveDate')::date, (r->>'mid')::numeric, r->>'no')
          on conflict (code, eff_date) do update set mid = excluded.mid, tbl = excluded.tbl, fetched = now();
      end loop;
    end if;
  exception when others then null;   -- brak połączenia z NBP – spróbujemy z zapisanych kursów
  end;
  return query select f.mid, f.eff_date, f.tbl from public.fx_rates f
    where f.code = cur and f.eff_date <= d and f.eff_date >= d - 10 order by f.eff_date desc limit 1;
end $$;
grant execute on function public.nbp_rate(text, date) to authenticated;

-- Przeliczenie przy zapisie kosztu
create or replace function public.cost_fx() returns trigger
language plpgsql security definer set search_path = public as $$
declare x record; fleet boolean := coalesce(public.is_fleet(), false);
begin
  new.currency := coalesce(nullif(upper(btrim(new.currency)), ''), 'PLN');
  if new.currency = 'PLN' then
    new.amount_orig := null; new.fx_rate := null; new.fx_date := null; new.fx_table := null; new.fx_manual := false;
    return new;
  end if;
  if new.amount_orig is null then raise exception 'Podaj kwotę w walucie %.', new.currency using errcode = 'P0001'; end if;
  if new.fx_manual and fleet and new.fx_rate is not null then
    new.fx_table := 'ręcznie'; new.fx_date := coalesce(new.fx_date, new.date);
  elsif tg_op = 'UPDATE' and not fleet and new.currency = old.currency and new.date = old.date and old.fx_rate is not null then
    -- kierowca nie zmienia kursu: zostaje ten zapisany
    new.fx_rate := old.fx_rate; new.fx_date := old.fx_date; new.fx_table := old.fx_table; new.fx_manual := old.fx_manual;
  elsif tg_op = 'UPDATE' and new.currency = old.currency and new.date = old.date and old.fx_rate is not null and not new.fx_manual and old.fx_manual = new.fx_manual then
    new.fx_rate := old.fx_rate; new.fx_date := old.fx_date; new.fx_table := old.fx_table;
  else
    select * into x from public.nbp_rate(new.currency, new.date);
    if x.rate is null then
      raise exception 'Nie udało się pobrać kursu NBP dla % – spróbuj za chwilę.', new.currency using errcode = 'P0001';
    end if;
    new.fx_rate := x.rate; new.fx_date := x.eff_date; new.fx_table := x.tbl; new.fx_manual := false;
  end if;
  new.amount := round(new.amount_orig * new.fx_rate, 2);
  return new;
end $$;
-- nazwa zaczyna się od „a”, żeby przeliczenie było przed innymi sprawdzeniami kosztu
drop trigger if exists costs_a_fx on public.costs;
create trigger costs_a_fx before insert or update on public.costs
  for each row execute function public.cost_fx();
