#!/bin/bash
# Wave 16 — push server.js + apply audit_trail RLS + verify
set -e
cd /var/www/namaweb

echo "=== applying audit_trail RLS ==="
sudo -u postgres psql -d nama_medical_web -v ON_ERROR_STOP=1 -f migrations/p1_07_audit_trail_rls_up.sql 2>&1 | grep -v "could not change directory"

echo ""
echo "=== verifying RLS + policy attached ==="
sudo -u postgres psql -d nama_medical_web -c "SELECT tablename, rowsecurity FROM pg_tables WHERE schemaname = 'public' AND tablename = 'audit_trail';" 2>&1 | grep -v "could not change directory"

sudo -u postgres psql -d nama_medical_web -c "SELECT tablename, policyname, cmd FROM pg_policies WHERE schemaname = 'public' AND tablename = 'audit_trail';" 2>&1 | grep -v "could not change directory"

echo ""
echo "=== smoke: app role can read audit rows for tenant 1 ==="
APP_PW=$(grep "^DB_PASSWORD=" /var/www/namaweb/.env | cut -d= -f2- | tr -d "\r\n")
PGPASSWORD="$APP_PW" psql -h 127.0.0.1 -U nama_medical_app -d nama_medical_web -c "SET app.tenant_id = '1'; SELECT count(*) FROM audit_trail;" 2>&1 | grep -v "could not change directory"

echo ""
echo "=== smoke: app role blocked without tenant context (fail-closed) ==="
PGPASSWORD="$APP_PW" psql -h 127.0.0.1 -U nama_medical_app -d nama_medical_web -c "SELECT count(*) FROM audit_trail;" 2>&1 | grep -v "could not change directory"

echo ""
echo "=== smoke: app role blocked when tenant context is mismatched ==="
PGPASSWORD="$APP_PW" psql -h 127.0.0.1 -U nama_medical_app -d nama_medical_web -c "SET app.tenant_id = '999'; SELECT count(*) FROM audit_trail;" 2>&1 | grep -v "could not change directory"

echo ""
echo "=== smoke: app role INSERT with tenant context succeeds ==="
PGPASSWORD="$APP_PW" psql -h 127.0.0.1 -U nama_medical_app -d nama_medical_web -c "SET app.tenant_id = '1'; INSERT INTO audit_trail (user_id, username, action, module, new_values, ip_address, tenant_id) VALUES (NULL, 'wave16-test', 'TEST_INSERT', 'Wave16', 'verify RLS allows tagged insert', '127.0.0.1', 1);" 2>&1 | grep -v "could not change directory"

echo ""
echo "=== smoke: app role INSERT without tenant context fails ==="
PGPASSWORD="$APP_PW" psql -h 127.0.0.1 -U nama_medical_app -d nama_medical_web -c "INSERT INTO audit_trail (user_id, username, action, module, new_values, ip_address, tenant_id) VALUES (NULL, 'wave16-test', 'TEST_INSERT_BAD', 'Wave16', 'should fail', '127.0.0.1', 1);" 2>&1 | grep -v "could not change directory"
