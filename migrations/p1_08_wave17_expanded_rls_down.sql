-- p1_08_wave17_expanded_rls_down.sql
-- Wave 17 — Reverse: drop RLS + policy from all 23 expanded-coverage tables.
BEGIN;

DO $$
DECLARE
  tbl text;
  tables text[] := ARRAY[
    'fhir_resources', 'hl7_messages',
    'finance_vouchers', 'finance_accounts_payable', 'finance_accounts_receivable', 'finance_doctor_commissions',
    'hr_employees', 'hr_salaries', 'hr_wps_files', 'hr_gosi_records',
    'pharmacy_controlled_substances', 'pharmacy_cs_transactions',
    'patient_problem_list', 'patient_referrals', 'nursing_care_plans', 'nursing_assessments',
    'pathology_cases', 'oncology_patient_regimens',
    'telemedicine_sessions', 'portal_messages', 'online_bookings',
    'ai_cds_log', 'ai_voice_sessions'
  ];
BEGIN
  FOREACH tbl IN ARRAY tables LOOP
    EXECUTE format('DROP POLICY IF EXISTS rls_%I_tenant_isolation ON %I', tbl, tbl);
    EXECUTE format('ALTER TABLE %I DISABLE ROW LEVEL SECURITY', tbl);
    EXECUTE format('ALTER TABLE %I NO FORCE ROW LEVEL SECURITY', tbl);
  END LOOP;
END $$;

COMMIT;
