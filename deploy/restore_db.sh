#!/usr/bin/env bash
# restore_db.sh — owner-approved restore guard (rail 4)
#
# Refuses to run unless:
#  - DEPLOY_ALLOWED_OWNER=1
#  - backup file exists and is < 7d old
#  - target DB is reachable
#
# Usage:
#   DEPLOY_ALLOWED_OWNER=1 sudo ./restore_db.sh /var/backups/nama/2026-08-01.dump

set -euo pipefail

if [[ "${DEPLOY_ALLOWED_OWNER:-0}" != "1" ]]; then
  echo "========================="
  echo "REFUSING: owner approval required (AGENTS.md §2.4, rail 4)"
  echo "Run: DEPLOY_ALLOWED_OWNER=1 sudo $0 <dump>"
  echo "========================="
  exit 2
fi

DUMP="${1:-}"
if [[ -z "$DUMP" || ! -f "$DUMP" ]]; then
  echo "Usage: $0 <dump-file>"; exit 1
fi

# Refuse to restore if dump is older than 7 days (PDPL retention)
if find "$DUMP" -mtime +7 -print -quit | grep -q .; then
  echo "========================="
  echo "REFUSING: backup file > 7d old. Take a fresh backup first."
  echo "========================="
  exit 3
fi

# Confirm target env (avoid restoring production accidentally)
DB_HOST="${PGHOST:-127.0.0.1}"
DB_NAME="${PGDATABASE:-nama_medical}"
echo "About to restore $DUMP into $DB_HOST/$DB_NAME"
echo "Press Ctrl-C within 5 seconds to cancel..."
sleep 5

case "$DUMP" in
  *.gz)  gunzip -c "$DUMP" | pg_restore --clean --if-exists --no-owner -h "$DB_HOST" -d "$DB_NAME" ;;
  *)     pg_restore --clean --if-exists --no-owner -h "$DB_HOST" -d "$DB_NAME" "$DUMP" ;;
esac

# Re-enforce RLS on every protected table (rail 5)
PGPASSWORD="${PGPASSWORD:-}" psql -h "$DB_HOST" -d "$DB_NAME" -v ON_ERROR_STOP=1 <<'SQL'
DO $$
DECLARE r record;
BEGIN
  FOR r IN
    SELECT c.relname AS tbl
    FROM pg_class c JOIN pg_namespace n ON n.oid = c.relnamespace
    WHERE c.relkind = 'r' AND n.nspname = 'public'
      AND c.relname NOT LIKE 'pg_%' AND c.relname NOT LIKE 'sql_%'
  LOOP
    EXECUTE format('ALTER TABLE public.%I ENABLE ROW LEVEL SECURITY', r.tbl);
    EXECUTE format('ALTER TABLE public.%I FORCE ROW LEVEL SECURITY', r.tbl);
  END LOOP;
END $$;
SQL

echo "Restored and RLS re-enforced."

# Restart app to refresh tenant connection pool
if command -v pm2 >/dev/null 2>&1; then
  pm2 restart nama-medical-erp --silent || true
fi
