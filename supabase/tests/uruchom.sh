#!/usr/bin/env bash
# Emage FLEET — testy bazy na lokalnym PostgreSQL 16 (bez Supabase).
# Użycie: PGHOST=... PGPORT=... PGUSER=postgres ./supabase/tests/uruchom.sh
# Tworzy bazę emage_test, wgrywa zaślepki Supabase, wszystkie migracje i uruchamia testy.
# Każdy test wypisuje sprawdzenia; oczekiwane błędy (np. „Auto zablokowane”) są częścią testu.
set -euo pipefail
cd "$(dirname "$0")/../.."
DB=emage_test
psql -q -d postgres -c "drop database if exists $DB" -c "create database $DB" >/dev/null
{
  cat supabase/tests/00_stub_supabase.sql
  echo 'create publication supabase_realtime;'
  cat supabase/tests/01_stub_http.sql
  echo "create schema cron; create table cron.job (jobname text, command text);"
  echo "insert into cron.job values ('emage-fleet-powiadomienia', \$q\$ select net.http_post(url := 'https://test.supabase.co/functions/v1/powiadomienia', headers := jsonb_build_object('Content-Type','application/json','x-cron-secret','TEST'), body := '{}'::jsonb) \$q\$);"
  echo "create schema if not exists net; create table net._calls (url text, headers jsonb, body jsonb);"
  echo "create or replace function net.http_post(url text, headers jsonb, body jsonb, timeout_milliseconds int default 5000) returns bigint language sql as \$\$ insert into net._calls values (url, headers, body); select 1::bigint \$\$;"
  echo '\set ON_ERROR_STOP 1'
  for f in supabase/migrations/0*.sql; do grep -v 'create extension if not exists http with schema extensions' "$f"; echo; done
  echo "insert into settings (key, value) values ('receipts', '{\"percent\":0}');"
} | psql -q -d $DB 2>&1 | grep -v 'NOTICE\|WARNING\|HINT' || true
for t in supabase/tests/[1-9]*.sql; do
  echo "===== $t"
  psql -q -d $DB -f "$t" 2>&1 | grep -v '^CONTEXT\|^$'
done
