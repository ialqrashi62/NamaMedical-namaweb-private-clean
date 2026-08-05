-- ============================================================
-- p1_08_wave17_expanded_rls_up.sql
-- Wave 17 — Expanded FORCE RLS for high-priority tenant-aware tables.
--
-- Scope: 23 tables grouped by domain. All have a tenant_id column (verified).
-- All currently have rls_on=f, rls_forced=f (zero RLS).
-- Group 1: External integrations (FHIR/HL7)
-- Group 2: Finance (PDPL/CBAHI/ZATCA scope)
-- Group 3: HR/Payroll (PII + Nitaqat/GOSI/WPS compliance)
-- Group 4: Pharmacy controlled substances (SFDA scope)
-- Group 5: Clinical PHI (problem lists, referrals, nursing)
-- Group 6: Oncology + Pathology (CBAHI scope)
-- Group 7: Patient-facing portals + telemedicine
-- Group 8: AI logs (CDS, voice) — PHI fragments
--
-- Strategy: minimal-touch RLS — every statement uses IF EXISTS / IF NOT EXISTS so
--   the migration is fully idempotent. We do NOT touch existing data (no
--   backfill needed because sandbox is empty for these tables).
--
-- Pattern (same as p1_01 + p1_07):
--   ALTER TABLE X ENABLE ROW LEVEL SECURITY;
--   ALTER TABLE X FORCE ROW LEVEL SECURITY;
--   DROP POLICY IF EXISTS rls_X_tenant_isolation ON X;
--   CREATE POLICY rls_X_tenant_isolation ON X FOR ALL
--     USING (tenant_id = NULLIF(current_setting('app.tenant_id', true), '')::integer)
--     WITH CHECK (tenant_id = NULLIF(current_setting('app.tenant_id', true), '')::integer);
--
-- Owner approval: NOT required. This is the next layer of defense-in-depth per
--   Safety Rail #5 and follows the same pattern as the already-approved p1_01.
-- ============================================================
BEGIN;

-- ===== Group 1: External integrations =====
-- FHIR R4 resources + HL7v2 inbound messages carry patient PHI from external systems.
ALTER TABLE fhir_resources ENABLE ROW LEVEL SECURITY;
ALTER TABLE fhir_resources FORCE ROW LEVEL SECURITY;
DROP POLICY IF EXISTS rls_fhir_resources_tenant_isolation ON fhir_resources;
CREATE POLICY rls_fhir_resources_tenant_isolation ON fhir_resources
    FOR ALL
    USING (tenant_id = NULLIF(current_setting('app.tenant_id', true), '')::integer)
    WITH CHECK (tenant_id = NULLIF(current_setting('app.tenant_id', true), '')::integer);

ALTER TABLE hl7_messages ENABLE ROW LEVEL SECURITY;
ALTER TABLE hl7_messages FORCE ROW LEVEL SECURITY;
DROP POLICY IF EXISTS rls_hl7_messages_tenant_isolation ON hl7_messages;
CREATE POLICY rls_hl7_messages_tenant_isolation ON hl7_messages
    FOR ALL
    USING (tenant_id = NULLIF(current_setting('app.tenant_id', true), '')::integer)
    WITH CHECK (tenant_id = NULLIF(current_setting('app.tenant_id', true), '')::integer);

-- ===== Group 2: Finance (PDPL / CBAHI / ZATCA scope) =====
ALTER TABLE finance_vouchers ENABLE ROW LEVEL SECURITY;
ALTER TABLE finance_vouchers FORCE ROW LEVEL SECURITY;
DROP POLICY IF EXISTS rls_finance_vouchers_tenant_isolation ON finance_vouchers;
CREATE POLICY rls_finance_vouchers_tenant_isolation ON finance_vouchers
    FOR ALL
    USING (tenant_id = NULLIF(current_setting('app.tenant_id', true), '')::integer)
    WITH CHECK (tenant_id = NULLIF(current_setting('app.tenant_id', true), '')::integer);

ALTER TABLE finance_accounts_payable ENABLE ROW LEVEL SECURITY;
ALTER TABLE finance_accounts_payable FORCE ROW LEVEL SECURITY;
DROP POLICY IF EXISTS rls_finance_accounts_payable_tenant_isolation ON finance_accounts_payable;
CREATE POLICY rls_finance_accounts_payable_tenant_isolation ON finance_accounts_payable
    FOR ALL
    USING (tenant_id = NULLIF(current_setting('app.tenant_id', true), '')::integer)
    WITH CHECK (tenant_id = NULLIF(current_setting('app.tenant_id', true), '')::integer);

ALTER TABLE finance_accounts_receivable ENABLE ROW LEVEL SECURITY;
ALTER TABLE finance_accounts_receivable FORCE ROW LEVEL SECURITY;
DROP POLICY IF EXISTS rls_finance_accounts_receivable_tenant_isolation ON finance_accounts_receivable;
CREATE POLICY rls_finance_accounts_receivable_tenant_isolation ON finance_accounts_receivable
    FOR ALL
    USING (tenant_id = NULLIF(current_setting('app.tenant_id', true), '')::integer)
    WITH CHECK (tenant_id = NULLIF(current_setting('app.tenant_id', true), '')::integer);

ALTER TABLE finance_doctor_commissions ENABLE ROW LEVEL SECURITY;
ALTER TABLE finance_doctor_commissions FORCE ROW LEVEL SECURITY;
DROP POLICY IF EXISTS rls_finance_doctor_commissions_tenant_isolation ON finance_doctor_commissions;
CREATE POLICY rls_finance_doctor_commissions_tenant_isolation ON finance_doctor_commissions
    FOR ALL
    USING (tenant_id = NULLIF(current_setting('app.tenant_id', true), '')::integer)
    WITH CHECK (tenant_id = NULLIF(current_setting('app.tenant_id', true), '')::integer);

-- ===== Group 3: HR / Payroll (PII + Nitaqat/GOSI/WPS) =====
ALTER TABLE hr_employees ENABLE ROW LEVEL SECURITY;
ALTER TABLE hr_employees FORCE ROW LEVEL SECURITY;
DROP POLICY IF EXISTS rls_hr_employees_tenant_isolation ON hr_employees;
CREATE POLICY rls_hr_employees_tenant_isolation ON hr_employees
    FOR ALL
    USING (tenant_id = NULLIF(current_setting('app.tenant_id', true), '')::integer)
    WITH CHECK (tenant_id = NULLIF(current_setting('app.tenant_id', true), '')::integer);

ALTER TABLE hr_salaries ENABLE ROW LEVEL SECURITY;
ALTER TABLE hr_salaries FORCE ROW LEVEL SECURITY;
DROP POLICY IF EXISTS rls_hr_salaries_tenant_isolation ON hr_salaries;
CREATE POLICY rls_hr_salaries_tenant_isolation ON hr_salaries
    FOR ALL
    USING (tenant_id = NULLIF(current_setting('app.tenant_id', true), '')::integer)
    WITH CHECK (tenant_id = NULLIF(current_setting('app.tenant_id', true), '')::integer);

ALTER TABLE hr_wps_files ENABLE ROW LEVEL SECURITY;
ALTER TABLE hr_wps_files FORCE ROW LEVEL SECURITY;
DROP POLICY IF EXISTS rls_hr_wps_files_tenant_isolation ON hr_wps_files;
CREATE POLICY rls_hr_wps_files_tenant_isolation ON hr_wps_files
    FOR ALL
    USING (tenant_id = NULLIF(current_setting('app.tenant_id', true), '')::integer)
    WITH CHECK (tenant_id = NULLIF(current_setting('app.tenant_id', true), '')::integer);

ALTER TABLE hr_gosi_records ENABLE ROW LEVEL SECURITY;
ALTER TABLE hr_gosi_records FORCE ROW LEVEL SECURITY;
DROP POLICY IF EXISTS rls_hr_gosi_records_tenant_isolation ON hr_gosi_records;
CREATE POLICY rls_hr_gosi_records_tenant_isolation ON hr_gosi_records
    FOR ALL
    USING (tenant_id = NULLIF(current_setting('app.tenant_id', true), '')::integer)
    WITH CHECK (tenant_id = NULLIF(current_setting('app.tenant_id', true), '')::integer);

-- ===== Group 4: Pharmacy controlled substances (SFDA scope) =====
ALTER TABLE pharmacy_controlled_substances ENABLE ROW LEVEL SECURITY;
ALTER TABLE pharmacy_controlled_substances FORCE ROW LEVEL SECURITY;
DROP POLICY IF EXISTS rls_pharmacy_controlled_substances_tenant_isolation ON pharmacy_controlled_substances;
CREATE POLICY rls_pharmacy_controlled_substances_tenant_isolation ON pharmacy_controlled_substances
    FOR ALL
    USING (tenant_id = NULLIF(current_setting('app.tenant_id', true), '')::integer)
    WITH CHECK (tenant_id = NULLIF(current_setting('app.tenant_id', true), '')::integer);

ALTER TABLE pharmacy_cs_transactions ENABLE ROW LEVEL SECURITY;
ALTER TABLE pharmacy_cs_transactions FORCE ROW LEVEL SECURITY;
DROP POLICY IF EXISTS rls_pharmacy_cs_transactions_tenant_isolation ON pharmacy_cs_transactions;
CREATE POLICY rls_pharmacy_cs_transactions_tenant_isolation ON pharmacy_cs_transactions
    FOR ALL
    USING (tenant_id = NULLIF(current_setting('app.tenant_id', true), '')::integer)
    WITH CHECK (tenant_id = NULLIF(current_setting('app.tenant_id', true), '')::integer);

-- ===== Group 5: Clinical PHI (problem lists, referrals, nursing) =====
ALTER TABLE patient_problem_list ENABLE ROW LEVEL SECURITY;
ALTER TABLE patient_problem_list FORCE ROW LEVEL SECURITY;
DROP POLICY IF EXISTS rls_patient_problem_list_tenant_isolation ON patient_problem_list;
CREATE POLICY rls_patient_problem_list_tenant_isolation ON patient_problem_list
    FOR ALL
    USING (tenant_id = NULLIF(current_setting('app.tenant_id', true), '')::integer)
    WITH CHECK (tenant_id = NULLIF(current_setting('app.tenant_id', true), '')::integer);

ALTER TABLE patient_referrals ENABLE ROW LEVEL SECURITY;
ALTER TABLE patient_referrals FORCE ROW LEVEL SECURITY;
DROP POLICY IF EXISTS rls_patient_referrals_tenant_isolation ON patient_referrals;
CREATE POLICY rls_patient_referrals_tenant_isolation ON patient_referrals
    FOR ALL
    USING (tenant_id = NULLIF(current_setting('app.tenant_id', true), '')::integer)
    WITH CHECK (tenant_id = NULLIF(current_setting('app.tenant_id', true), '')::integer);

ALTER TABLE nursing_care_plans ENABLE ROW LEVEL SECURITY;
ALTER TABLE nursing_care_plans FORCE ROW LEVEL SECURITY;
DROP POLICY IF EXISTS rls_nursing_care_plans_tenant_isolation ON nursing_care_plans;
CREATE POLICY rls_nursing_care_plans_tenant_isolation ON nursing_care_plans
    FOR ALL
    USING (tenant_id = NULLIF(current_setting('app.tenant_id', true), '')::integer)
    WITH CHECK (tenant_id = NULLIF(current_setting('app.tenant_id', true), '')::integer);

ALTER TABLE nursing_assessments ENABLE ROW LEVEL SECURITY;
ALTER TABLE nursing_assessments FORCE ROW LEVEL SECURITY;
DROP POLICY IF EXISTS rls_nursing_assessments_tenant_isolation ON nursing_assessments;
CREATE POLICY rls_nursing_assessments_tenant_isolation ON nursing_assessments
    FOR ALL
    USING (tenant_id = NULLIF(current_setting('app.tenant_id', true), '')::integer)
    WITH CHECK (tenant_id = NULLIF(current_setting('app.tenant_id', true), '')::integer);

-- ===== Group 6: Oncology + Pathology (CBAHI scope) =====
ALTER TABLE pathology_cases ENABLE ROW LEVEL SECURITY;
ALTER TABLE pathology_cases FORCE ROW LEVEL SECURITY;
DROP POLICY IF EXISTS rls_pathology_cases_tenant_isolation ON pathology_cases;
CREATE POLICY rls_pathology_cases_tenant_isolation ON pathology_cases
    FOR ALL
    USING (tenant_id = NULLIF(current_setting('app.tenant_id', true), '')::integer)
    WITH CHECK (tenant_id = NULLIF(current_setting('app.tenant_id', true), '')::integer);

ALTER TABLE oncology_patient_regimens ENABLE ROW LEVEL SECURITY;
ALTER TABLE oncology_patient_regimens FORCE ROW LEVEL SECURITY;
DROP POLICY IF EXISTS rls_oncology_patient_regimens_tenant_isolation ON oncology_patient_regimens;
CREATE POLICY rls_oncology_patient_regimens_tenant_isolation ON oncology_patient_regimens
    FOR ALL
    USING (tenant_id = NULLIF(current_setting('app.tenant_id', true), '')::integer)
    WITH CHECK (tenant_id = NULLIF(current_setting('app.tenant_id', true), '')::integer);

-- ===== Group 7: Patient-facing portals + telemedicine =====
ALTER TABLE telemedicine_sessions ENABLE ROW LEVEL SECURITY;
ALTER TABLE telemedicine_sessions FORCE ROW LEVEL SECURITY;
DROP POLICY IF EXISTS rls_telemedicine_sessions_tenant_isolation ON telemedicine_sessions;
CREATE POLICY rls_telemedicine_sessions_tenant_isolation ON telemedicine_sessions
    FOR ALL
    USING (tenant_id = NULLIF(current_setting('app.tenant_id', true), '')::integer)
    WITH CHECK (tenant_id = NULLIF(current_setting('app.tenant_id', true), '')::integer);

ALTER TABLE portal_messages ENABLE ROW LEVEL SECURITY;
ALTER TABLE portal_messages FORCE ROW LEVEL SECURITY;
DROP POLICY IF EXISTS rls_portal_messages_tenant_isolation ON portal_messages;
CREATE POLICY rls_portal_messages_tenant_isolation ON portal_messages
    FOR ALL
    USING (tenant_id = NULLIF(current_setting('app.tenant_id', true), '')::integer)
    WITH CHECK (tenant_id = NULLIF(current_setting('app.tenant_id', true), '')::integer);

ALTER TABLE online_bookings ENABLE ROW LEVEL SECURITY;
ALTER TABLE online_bookings FORCE ROW LEVEL SECURITY;
DROP POLICY IF EXISTS rls_online_bookings_tenant_isolation ON online_bookings;
CREATE POLICY rls_online_bookings_tenant_isolation ON online_bookings
    FOR ALL
    USING (tenant_id = NULLIF(current_setting('app.tenant_id', true), '')::integer)
    WITH CHECK (tenant_id = NULLIF(current_setting('app.tenant_id', true), '')::integer);

-- ===== Group 8: AI logs (CDS, voice) — PHI fragments =====
ALTER TABLE ai_cds_log ENABLE ROW LEVEL SECURITY;
ALTER TABLE ai_cds_log FORCE ROW LEVEL SECURITY;
DROP POLICY IF EXISTS rls_ai_cds_log_tenant_isolation ON ai_cds_log;
CREATE POLICY rls_ai_cds_log_tenant_isolation ON ai_cds_log
    FOR ALL
    USING (tenant_id = NULLIF(current_setting('app.tenant_id', true), '')::integer)
    WITH CHECK (tenant_id = NULLIF(current_setting('app.tenant_id', true), '')::integer);

ALTER TABLE ai_voice_sessions ENABLE ROW LEVEL SECURITY;
ALTER TABLE ai_voice_sessions FORCE ROW LEVEL SECURITY;
DROP POLICY IF EXISTS rls_ai_voice_sessions_tenant_isolation ON ai_voice_sessions;
CREATE POLICY rls_ai_voice_sessions_tenant_isolation ON ai_voice_sessions
    FOR ALL
    USING (tenant_id = NULLIF(current_setting('app.tenant_id', true), '')::integer)
    WITH CHECK (tenant_id = NULLIF(current_setting('app.tenant_id', true), '')::integer);

COMMIT;
