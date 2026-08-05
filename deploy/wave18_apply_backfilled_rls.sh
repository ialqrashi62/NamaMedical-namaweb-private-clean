#!/bin/bash
# Wave 18 — apply FORCE RLS on 5 backfilled tables + verify
set -e
cd /var/www/namaweb

echo "=== applying Wave 18 backfilled RLS (5 tables with live data) ==="
sudo -u postgres psql -d nama_medical_web -v ON_ERROR_STOP=1 -f migrations/p1_09_wave18_backfilled_rls_up.sql 2>&1 | grep -v "could not change directory" | tail -40

echo ""
echo "=== verifying RLS + policy attached for each table ==="
TABLES=(pharmacy_drug_catalog tenant_plan_assignments company_settings dental_records user_tenants)
APP_PW=$(grep "^DB_PASSWORD=" /var/www/namaweb/.env | cut -d= -f2- | tr -d "\r\n")
total_ok=0
total_fail=0
for t in "${TABLES[@]}"; do
  rls=$(sudo -u postgres psql -d nama_medical_web -tA -c "SELECT relrowsecurity FROM pg_class WHERE relname = '$t';" 2>/dev/null | grep -v "could not change directory")
  force=$(sudo -u postgres psql -d nama_medical_web -tA -c "SELECT relforcerowsecurity FROM pg_class WHERE relname = '$t';" 2>/dev/null | grep -v "could not change directory")
  pol=$(sudo -u postgres psql -d nama_medical_web -tA -c "SELECT count(*) FROM pg_policies WHERE tablename = '$t';" 2>/dev/null | grep -v "could not change directory")
  if [ "$rls" = "t" ] && [ "$force" = "t" ] && [ "$pol" -ge "1" ]; then
    rows=$(PGPASSWORD="$APP_PW" psql -h 127.0.0.1 -U nama_medical_app -d nama_medical_web -tA -c "SET app.tenant_id = '1'; SELECT count(*) FROM $t;" 2>&1 | grep -v "could not change directory" | head -1)
    echo "  $t: RLS=t FORCE=t POLICIES=$pol ROWS_VISIBLE=$rows OK"
    total_ok=$((total_ok + 1))
  else
    echo "  $t: RLS=$rls FORCE=$force POLICIES=$pol FAIL"
    total_fail=$((total_fail + 1))
  fi
done
echo ""
echo "=== summary: $total_ok OK / $total_fail FAIL ==="

echo ""
echo "=== smoke: app role + tenant context, read all 5 ==="
PGPASSWORD="$APP_PW" psql -h 127.0.0.1 -U nama_medical_app -d nama_medical_web -c "SET app.tenant_id = '1'; SELECT count(*) AS pharmacy_drug_catalog FROM pharmacy_drug_catalog;" 2>&1 | grep -v "could not change directory"

echo ""
echo "=== smoke: app role WITHOUT tenant context (fail-closed) ==="
PGPASSWORD="$APP_PW" psql -h 127.0.0.1 -U nama_medical_app -d nama_medical_web -c "SELECT count(*) AS pharmacy_drug_catalog FROM pharmacy_drug_catalog;" 2>&1 | grep -v "could not change directory"

echo ""
echo "=== app still serving traffic ==="
for p in "api/health" "api/v4/olap/views"; do
  code=$(curl -s -o /tmp/b.txt -w "%{http_code}" -H "x-tenant-id: tnt-demo" -H "x-user-id: dr-test" -H "x-user-role: admin" "http://127.0.0.1:3000/$p")
  body=$(head -c 60 /tmp/b.txt)
  echo "$p => $code | $body"
done
