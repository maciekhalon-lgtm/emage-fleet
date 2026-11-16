\echo '1 zdanie auta pod domem: kolumna return_home'
reset role;
select exists (select 1 from information_schema.columns where table_schema='public' and table_name='bookings' and column_name='return_home' and column_default='false') as ok_return_home;
