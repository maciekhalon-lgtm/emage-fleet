-- ============================================================================
-- Emage FLEET — koszty planów tras tylko dla kierownictwa (uruchom po 062)
-- Kierowcy dostają podgląd mapy tras (trasy, przystanki, adresy) – tabela route_plans jest dla nich czytelna.
-- Wyliczenia kosztów (stawki, pensje, przelicznik, dopłaty, ceny paliwa) przenosimy do osobnej tabeli
-- route_plan_calc, którą czyta i zmienia tylko kierownik floty. W route_plans kolumna calc zostaje pusta.
-- Gdyby starsza wersja aplikacji zapisała koszty do route_plans, wyzwalacz od razu przenosi je do route_plan_calc.
-- ============================================================================
create table if not exists public.route_plan_calc (
  id         uuid primary key references public.route_plans(id) on delete cascade,   -- = id planu
  calc       jsonb not null default '{}'::jsonb,
  updated_at timestamptz not null default now()
);
grant select, insert, update, delete on public.route_plan_calc to authenticated;
alter table public.route_plan_calc enable row level security;
drop policy if exists route_plan_calc_fleet on public.route_plan_calc;
create policy route_plan_calc_fleet on public.route_plan_calc for all using (public.is_fleet()) with check (public.is_fleet());

-- przeniesienie dotychczasowych wyliczeń
insert into public.route_plan_calc (id, calc)
  select id, calc from public.route_plans where calc is not null and calc <> '{}'::jsonb
  on conflict (id) do update set calc = excluded.calc, updated_at = now();
update public.route_plans set calc = '{}'::jsonb where calc <> '{}'::jsonb;

create or replace function public.route_plans_calc_move() returns trigger language plpgsql as $$
begin
  if new.calc is not null and new.calc <> '{}'::jsonb then
    insert into public.route_plan_calc (id, calc) values (new.id, new.calc)
      on conflict (id) do update set calc = excluded.calc, updated_at = now();
    update public.route_plans set calc = '{}'::jsonb where id = new.id;
  end if;
  return null;
end $$;
drop trigger if exists route_plans_calc_move on public.route_plans;
create trigger route_plans_calc_move after insert or update of calc on public.route_plans
  for each row execute function public.route_plans_calc_move();

do $$ begin
  alter publication supabase_realtime add table public.route_plan_calc;
exception when duplicate_object then null; when undefined_object then null; end $$;
