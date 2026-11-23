-- ============================================================================
-- Emage FLEET — powiadomienia o tankowaniach wybranych kierowców + spalanie odcinka (uruchom po 064)
--  • settings 'notify' = {"fuelDrivers": ["<id kierowcy>", …]} – kierownik floty wybiera kierowców,
--    o których każdym tankowaniu chce dostać powiadomienie na telefon (Ustawienia → Powiadomienia).
--  • każde tankowanie kierowcy na liście powiadomień ma teraz km i spalanie odcinka „do pełna – do pełna”
--    (od poprzedniego tankowania do pełna albo przejęcia z pełnym bakiem; liczniki wpisane przez kierowców).
-- ============================================================================

/* spalanie odcinka zamkniętego tym tankowaniem: {km, l, rate} albo null */
create or replace function private.fuel_leg(c public.costs) returns jsonb
language plpgsql stable security definer set search_path = public as $$
declare a numeric; f numeric; p numeric; l numeric; km numeric;
begin
  if c.full_tank is not true or coalesce(c.odometer, 0) <= 0 or coalesce(c.liters, 0) <= 0 then return null; end if;
  select max(x.odometer) into f from public.costs x
   where x.vehicle_id = c.vehicle_id and x.category = c.category and x.full_tank and x.id <> c.id and x.odometer < c.odometer and x.odometer > c.odometer - 5000;
  select max(b.pickup_km) into p from public.bookings b
   where b.vehicle_id = c.vehicle_id and b.pickup_fuel = 100 and not b.pickup_fuel_doubt and b.pickup_km < c.odometer and b.pickup_km > c.odometer - 5000;
  a := greatest(coalesce(f, 0), coalesce(p, 0));
  if a <= 0 then return null; end if;
  km := c.odometer - a;
  select coalesce(sum(x.liters), 0) into l from public.costs x
   where x.vehicle_id = c.vehicle_id and x.category = c.category and x.id <> c.id and x.odometer > a and x.odometer < c.odometer;
  l := l + c.liters;
  if km < 50 or km > 5000 then return null; end if;
  return jsonb_build_object('km', km, 'l', l, 'rate', round(l / km * 100, 1));
end $$;

-- tankowanie wpisane przez kierowcę: na liście powiadomień z km i spalaniem odcinka; push dla wybranych kierowców
create or replace function public.event_cost() returns trigger
language plpgsql security definer set search_path = public, private as $$
declare leg jsonb; txt text; watch boolean := false;
begin
  if new.category in ('Paliwo','Ładowanie') and exists (select 1 from public.profiles p where p.id = new.created_by and p.role = 'kierowca') then
    begin leg := private.fuel_leg(new); exception when others then leg := null; end;
    txt := coalesce(to_char(new.liters, 'FM999990D0') || ' l · ', '') || to_char(new.amount, 'FM999G990D00') || ' ' || coalesce(new.currency, 'PLN')
        || coalesce(' · licznik ' || to_char(new.odometer, 'FM999G999G999'), '')
        || coalesce(' · odcinek ' || to_char((leg->>'km')::numeric, 'FM999G999') || ' km · ' || replace(leg->>'rate', '.', ',') || ' l/100 km', '')
        || case when cardinality(new.flags) > 0 then ' · podejrzane: ' || array_to_string(new.flags, ', ') else '' end;
    perform private.event_add('tankowanie', new.vehicle_id, new.driver_id,
      private.drv_name(new.driver_id) || ' zatankował(a) ' || private.plate(new.vehicle_id), txt, new.id, cardinality(new.flags) > 0);
    -- wybrani kierowcy: powiadomienie na telefon przy każdym tankowaniu (podejrzane i tak idzie osobno – bez dubla)
    begin
      select exists (select 1 from public.settings s, jsonb_array_elements_text(coalesce(s.value->'fuelDrivers', '[]'::jsonb)) d(id)
                      where s.key = 'notify' and d.id in (new.driver_id::text, coalesce(new.co_driver_id::text, '-'))) into watch;
      if watch and coalesce(cardinality(new.flags), 0) = 0 then
        perform private.push(array['floty'], null, left(private.drv_name(new.driver_id) || ' zatankował(a) ' || private.plate(new.vehicle_id), 120), left(txt, 140), 'fuel-' || new.id);
      end if;
    exception when others then null;   -- powiadomienie nigdy nie blokuje zapisu
    end;
  end if;
  return null;
end $$;
