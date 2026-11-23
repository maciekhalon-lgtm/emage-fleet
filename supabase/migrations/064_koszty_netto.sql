-- ============================================================================
-- Emage FLEET — koszty netto i składka ubezpieczenia (uruchom po 063)
--  • costs.gross: kwota wpisana z VAT (paragon kierowcy) – aplikacja liczy z niej netto
--    (PLN 23%, EUR 19%, CZK 21%). Kierownicy wpisują netto (gross = false), chyba że zaznaczą „brutto”.
--    Wpisy kierowców zawsze brutto – pilnuje tego wyzwalacz. Dotychczasowe wpisy kierowców i pozycje z kart → brutto.
--  • vehicles.ins_premium: roczna składka ubezpieczenia netto – w kosztach rozkładana po 1/12 na każdy miesiąc
--    okresu polisy (12 miesięcy kończących się w miesiącu „Polisa ważna do”).
-- ============================================================================
alter table public.costs add column if not exists gross boolean not null default false;
alter table public.vehicles add column if not exists ins_premium numeric(12,2) check (ins_premium is null or ins_premium >= 0);

update public.costs c set gross = true
 where not c.gross and (coalesce(c.note, '') like 'Karta:%'
    or exists (select 1 from public.profiles p where p.id = c.created_by and p.role = 'kierowca'));

create or replace function public.costs_gross_driver() returns trigger
language plpgsql security definer set search_path = public as $$
begin
  if public.app_role() = 'kierowca' then new.gross := true; end if;
  if tg_op = 'INSERT' and coalesce(new.note, '') like 'Karta:%' then new.gross := true; end if;
  return new;
end $$;
drop trigger if exists costs_gross_driver on public.costs;
create trigger costs_gross_driver before insert or update on public.costs
  for each row execute function public.costs_gross_driver();
