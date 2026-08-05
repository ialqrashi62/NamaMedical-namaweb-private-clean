#!/bin/bash
# Wave 20 — apply FORCE RLS on 60 empty tables + verify
set -e
cd /var/www/namaweb

echo "[1/3] applying FORCE RLS on 60 empty tables"
sudo -u postgres psql -d nama_medical_web -v ON_ERROR_STOP=1 -f migrations/p1_11_wave20_force_rls_60_empty_up.sql 2>&1 | grep -v "could not change directory" | tail -5

echo ""
echo "[2/3] verifying post-state"
APP_PW=$(grep "^DB_PASSWORD=" /var/www/namaweb/.env | cut -d= -f2- | tr -d "\r\n")
TOTAL_FORCED=$(sudo -u postgres psql -d nama_medical_web -tA -c "SELECT count(*) FROM pg_class c JOIN pg_namespace n ON n.oid = c.relnamespace WHERE n.nspname = 'public' AND c.relkind = 'r' AND c.relrowsecurity = true AND c.relforcerowsecurity = true;" 2>&1 | grep -v "could not change directory")
UNPROTECTED=$(sudo -u postgres psql -d nama_medical_web -tA -c "SELECT count(*) FROM pg_class c JOIN pg_namespace n ON n.oid = c.relnamespace JOIN information_schema.columns col ON col.table_name = c.relname AND col.table_schema = 'public' WHERE n.nspname = 'public' AND c.relkind = 'r' AND COALESCE(c.relrowsecurity, false) = false AND col.column_name = 'tenant_id';" 2>&1 | grep -v "could not change directory")
echo "Total FORCE RLS public tables: $TOTAL_FORCED"
echo "Tenant-aware unprotected tables remaining: $UNPROTECTED"

echo ""
echo "[3/3] app smoke test"
for p in "api/health" "api/v4/olap/views"; do
  code=$(curl -s -o /tmp/b.txt -w "%{http_code}" -H "x-tenant-id: tnt-demo" -H "x-user-id: dr-test" -H "x-user-role: admin" "http://127.0.0.1:3000/$p")
  body=$(head -c 60 /tmp/b.txt)
  echo "$p => $code | $body"
done
