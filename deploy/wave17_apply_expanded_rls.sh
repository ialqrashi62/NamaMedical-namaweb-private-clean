#!/bin/bash
# Wave 17 — apply expanded RLS to 23 tables + verify
set -e
cd /var/www/namaweb

echo "=== applying Wave 17 expanded RLS (23 tables, 8 groups) ==="
sudo -u postgres psql -d nama_medical_web -v ON_ERROR_STOP=1 -f migrations/p1_08_wave17_expanded_rls_up.sql 2>&1 | grep -v "could not change directory" | tail -50

echo ""
echo "=== verifying RLS + policy attached for each table ==="
TABLES=(
  fhir_resources hl7_messages
  finance_vouchers finance_accounts_payable finance_accounts_receivable finance_doctor_commissions
  hr_employees hr_salaries hr_wps_files hr_gosi_records
  pharmacy_controlled_substances pharmacy_cs_transactions
  patient_problem_list patient_referrals nursing_care_plans nursing_assessments
  pathology_cases oncology_patient_regimens
  telemedicine_sessions portal_messages online_bookings
  ai_cds_log ai_voice_sessions
)
APP_PW=$(grep "^DB_PASSWORD=" /var/www/namaweb/.env | cut -d= -f2- | tr -d "\r\n")
total_ok=0
total_fail=0
for t in "${TABLES[@]}"; do
  rls=$(sudo -u postgres psql -d nama_medical_web -tA -c "SELECT relrowsecurity FROM pg_class WHERE relname = '$t';" 2>/dev/null | grep -v "could not change directory")
  force=$(sudo -u postgres psql -d nama_medical_web -tA -c "SELECT relforcerowsecurity FROM pg_class WHERE relname = '$t';" 2>/dev/null | grep -v "could not change directory")
  pol=$(sudo -u postgres psql -d nama_medical_web -tA -c "SELECT count(*) FROM pg_policies WHERE tablename = '$t';" 2>/dev/null | grep -v "could not change directory")
  if [ "$rls" = "t" ] && [ "$force" = "t" ] && [ "$pol" -ge "1" ]; then
    echo "  $t: RLS=t FORCE=t POLICIES=$pol OK"
    total_ok=$((total_ok + 1))
  else
    echo "  $t: RLS=$rls FORCE=$force POLICIES=$pol FAIL"
    total_fail=$((total_fail + 1))
  fi
done
echo ""
echo "=== summary: $total_ok OK / $total_fail FAIL ==="

echo ""
echo "=== smoke: app role + tenant context, read fhir_resources ==="
PGPASSWORD="$APP_PW" psql -h 127.0.0.1 -U nama_medical_app -d nama_medical_web -c "SET app.tenant_id = '1'; SELECT count(*) FROM fhir_resources;" 2>&1 | grep -v "could not change directory"

echo ""
echo "=== smoke: app role WITHOUT tenant context (fail-closed) ==="
PGPASSWORD="$APP_PW" psql -h 127.0.0.1 -U nama_medical_app -d nama_medical_web -c "SELECT count(*) FROM fhir_resources;" 2>&1 | grep -v "could not change directory"

echo ""
echo "=== smoke: app role + mismatched tenant context (fail-closed) ==="
PGPASSWORD="$APP_PW" psql -h 127.0.0.1 -U nama_medical_app -d nama_medical_web -c "SET app.tenant_id = '999'; SELECT count(*) FROM hr_employees;" 2>&1 | grep -v "could not change directory"
