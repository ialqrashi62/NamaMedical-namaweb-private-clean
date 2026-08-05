#!/bin/bash
# Wave 19 — apply FORCE RLS on 69 specialty tables (simple version, bash-safe)
set -e
cd /var/www/namaweb

echo "[1/3] applying FORCE RLS on 69 specialty tables"
sudo -u postgres psql -d nama_medical_web -v ON_ERROR_STOP=1 -f migrations/p1_10_wave19_force_rls_69_specialty_up.sql 2>&1 | grep -v "could not change directory" | tail -10

echo ""
echo "[2/3] verifying post-state"
TABLES=$(sudo -u postgres psql -d nama_medical_web -tA -c "SELECT string_agg(c.relname, ' ') FROM pg_class c JOIN pg_namespace n ON n.oid = c.relnamespace WHERE n.nspname = 'public' AND c.relkind = 'r' AND c.relrowsecurity = true AND c.relforcerowsecurity = true;" 2>&1 | grep -v "could not change directory")
COUNT=$(echo $TABLES | wc -w)
echo "Tables with FORCE RLS now: $COUNT"
echo "First 5: $(echo $TABLES | tr ' ' '\n' | head -5)"

echo ""
echo "[3/3] running validate script"
sudo -u postgres psql -d nama_medical_web -f migrations/p1_10_wave19_force_rls_69_specialty_validate.sql 2>&1 | grep -v "could not change directory" | tail -10

echo ""
echo "=== smoke: app still serving ==="
for p in "api/health" "api/v4/olap/views"; do
  code=$(curl -s -o /tmp/b.txt -w "%{http_code}" -H "x-tenant-id: tnt-demo" -H "x-user-id: dr-test" -H "x-user-role: admin" "http://127.0.0.1:3000/$p")
  body=$(head -c 60 /tmp/b.txt)
  echo "$p => $code | $body"
done
