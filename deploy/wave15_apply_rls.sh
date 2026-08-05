#!/bin/bash
# Wave 15 — apply medical_records RLS + verify
set -e
cd /var/www/namaweb

echo "=== applying medical_records RLS ==="
sudo -u postgres psql -d nama_medical_web -v ON_ERROR_STOP=1 -f migrations/p1_01_medical_records_rls_apply_up.sql 2>&1 | grep -v "could not change directory"

echo ""
echo "=== verifying RLS + policy attached ==="
sudo -u postgres psql -d nama_medical_web -c "SELECT tablename, rowsecurity FROM pg_tables WHERE schemaname = 'public' AND tablename = 'medical_records';" 2>&1 | grep -v "could not change directory"

sudo -u postgres psql -d nama_medical_web -c "SELECT tablename, policyname, cmd FROM pg_policies WHERE schemaname = 'public' AND tablename = 'medical_records';" 2>&1 | grep -v "could not change directory"

echo ""
echo "=== smoke: app still works after RLS (using non-superuser role) ==="
# Note: dev tenant is 1; the migration backfilled any NULL tenant_id to 1
PGPASSWORD="nama_medical_app_pw" psql -h 127.0.0.1 -U nama_medical_app -d nama_medical_web -c "SET app.tenant_id = '1'; SELECT count(*) FROM medical_records;" 2>&1 | grep -v "could not change directory"

echo ""
echo "=== smoke: app role blocked without tenant context (fail-closed) ==="
PGPASSWORD="nama_medical_app_pw" psql -h 127.0.0.1 -U nama_medical_app -d nama_medical_web -c "SELECT count(*) FROM medical_records;" 2>&1 | grep -v "could not change directory"
