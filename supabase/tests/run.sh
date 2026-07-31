#!/usr/bin/env bash
#
# Applies the migrations to a throwaway Postgres database and runs the RLS
# suite against them.
#
# The migrations are applied as a role that is neither superuser nor BYPASSRLS,
# which matters more than it sounds: a superuser owner is exempt from FORCE row
# level security, so running these as `postgres` would quietly pass even if the
# policies were recursive or wide open.
#
# Usage: supabase/tests/run.sh [host] [port]
#
# `host` may be a hostname or a Unix socket directory, e.g.
#   supabase/tests/run.sh localhost 5432
#   supabase/tests/run.sh /var/run/postgresql 5432

set -euo pipefail

HOST="${1:-/tmp/fgkpg/run}"
PORT="${2:-5433}"
DB="fgk_test_$$"
OWNER="fgk_test_owner"

export PGHOST="$HOST"
export PGPORT="$PORT"

root="$(cd "$(dirname "${BASH_SOURCE[0]}")/../.." && pwd)"

cleanup() {
  psql -q -U postgres -d postgres -c "drop database if exists $DB" >/dev/null 2>&1 || true
}
trap cleanup EXIT

echo "Creating database $DB owned by $OWNER (nosuperuser, nobypassrls)"
psql -q -U postgres -d postgres -tAc \
  "select 1 from pg_roles where rolname='$OWNER'" | grep -q 1 \
  || psql -q -U postgres -d postgres -c \
     "create role $OWNER login nosuperuser nobypassrls" >/dev/null
psql -q -U postgres -d postgres -c "create database $DB owner $OWNER" >/dev/null

# Supabase provisions these before any project migration runs.
psql -q -U postgres -v ON_ERROR_STOP=1 -d "$DB" \
  -f "$root/supabase/tests/00_shim.sql" 2>&1 | grep -v 'already been granted' || true
psql -q -U postgres -v ON_ERROR_STOP=1 -d "$DB" \
  -c "grant all on schema public to $OWNER" \
  -c "grant usage on schema auth to $OWNER" \
  -c "grant select, insert, references on auth.users to $OWNER" \
  -c "grant anon, authenticated, service_role to $OWNER with admin option" >/dev/null

echo "Applying migrations"
for file in "$root"/supabase/migrations/*.sql; do
  PGUSER="$OWNER" psql -q -v ON_ERROR_STOP=1 -d "$DB" -f "$file"
  echo "  applied $(basename "$file")"
done

echo "Running row-level security suite"
output=$(PGUSER="$OWNER" psql -q -v ON_ERROR_STOP=1 -d "$DB" \
  -f "$root/supabase/tests/01_rls.sql" 2>&1)

echo "$output" | grep -E 'NOTICE|ERROR' | sed 's/^psql:[^ ]*:[0-9]*: //' || true

if echo "$output" | grep -qE 'ERROR|FAIL'; then
  echo
  echo "FAILED"
  exit 1
fi

passed=$(echo "$output" | grep -c 'ok  ' || true)
echo
echo "$passed checks passed"
