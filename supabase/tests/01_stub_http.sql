create schema if not exists extensions;
create table if not exists public._nbp_up (up boolean);
insert into public._nbp_up values (true);
create or replace function extensions.http_set_curlopt(a text, b text) returns boolean language sql as $$ select true $$;
create or replace function extensions.http_get(url text, out status int, out content text) language plpgsql as $$
begin
  if not (select up from public._nbp_up limit 1) then raise exception 'timeout'; end if;
  status := 200;
  content := case when url like '%/eur/%' then '{"table":"A","code":"EUR","rates":[{"no":"211/A/NBP/2026","effectiveDate":"2026-10-30","mid":4.2500},{"no":"212/A/NBP/2026","effectiveDate":"2026-11-02","mid":4.2600}]}'
             else '{"table":"A","code":"CZK","rates":[{"no":"212/A/NBP/2026","effectiveDate":"2026-11-02","mid":0.1710}]}' end;
end $$;
grant usage on schema extensions to authenticated;
