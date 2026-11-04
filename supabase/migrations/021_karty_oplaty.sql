-- ============================================================================
-- Emage FLEET — karty paliwowe: paliwo osobno, przejazdy i parkingi osobno (uruchom po 020_karty_paliwowe.sql)
-- Pozycje z karty, które nie są paliwem (opłaty drogowe, parkingi, myjnia, AdBlue…), dopisują się same do kosztów auta.
-- Usunięcie zestawienia usuwa też te koszty.
-- ============================================================================
alter table public.fuel_card_rows add column if not exists kind text not null default 'fuel';
alter table public.fuel_card_rows drop constraint if exists fuel_card_rows_kind;
alter table public.fuel_card_rows add constraint fuel_card_rows_kind check (kind in ('fuel', 'other'));
alter table public.fuel_card_rows add column if not exists cost_id uuid references public.costs(id) on delete set null;

create or replace function public.fuel_card_cost() returns trigger
language plpgsql security definer set search_path = public as $$
declare cid uuid; cat text; drv uuid; p text := lower(coalesce(new.product, '') || ' ' || coalesce(new.station, ''));
begin
  if new.kind <> 'other' or coalesce(new.amount, 0) <= 0 then return null; end if;
  cat := case when p ~ 'myjn|wash|wäsche' then 'Myjnia'
              when p ~ 'park|opłat|oplat|autostr|toll|maut|myto|e-toll|viatoll|winiet|vignet|przejazd|bramk|droga|road' then 'Opłaty i parkingi'
              else 'Inne' end;
  select b.driver_id into drv from public.bookings b
    where b.vehicle_id = new.vehicle_id and b.date_from <= new.tx_date and b.date_to >= new.tx_date order by b.date_from limit 1;
  begin
    insert into public.costs (date, vehicle_id, category, amount, currency, amount_orig, driver_id, note)
      values (new.tx_date, new.vehicle_id, cat,
              case when coalesce(new.currency, 'PLN') = 'PLN' then new.amount else 0 end,
              coalesce(new.currency, 'PLN'), case when coalesce(new.currency, 'PLN') = 'PLN' then null else new.amount end,
              drv, left('Karta: ' || concat_ws(' · ', nullif(btrim(new.product), ''), nullif(btrim(new.station), ''), new.tx_time), 500))
      returning id into cid;
    update public.fuel_card_rows set cost_id = cid where id = new.id;
  exception when others then
    null;   -- np. brak kursu NBP: pozycja zostaje w zestawieniu, koszt można dopisać ręcznie
  end;
  return null;
end $$;
drop trigger if exists fuel_card_rows_cost on public.fuel_card_rows;
create trigger fuel_card_rows_cost after insert on public.fuel_card_rows for each row execute function public.fuel_card_cost();

create or replace function public.fuel_card_cost_delete() returns trigger
language plpgsql security definer set search_path = public as $$
begin
  if old.cost_id is not null then delete from public.costs where id = old.cost_id; end if;
  return old;
end $$;
drop trigger if exists fuel_card_rows_cost_delete on public.fuel_card_rows;
create trigger fuel_card_rows_cost_delete after delete on public.fuel_card_rows for each row execute function public.fuel_card_cost_delete();
