-- ============================================================================
-- Surgery / Operating Room domain — RLS candidate DDL (UP).
-- Idempotent. CANDIDATE ONLY — not auto-executed by the app bootstrap.
-- Applies FORCE Row Level Security + canonical tenant-isolation policy to the
-- pre-existing surgery-domain tables. (E12 NEW tables ship in migrations/e12_001_*.)
-- Canonical policy predicate: tenant_id = NULLIF(current_setting('app.tenant_id', true),'')::integer
-- ============================================================================
BEGIN;

-- surgeries
ALTER TABLE surgeries ENABLE ROW LEVEL SECURITY;
ALTER TABLE surgeries FORCE ROW LEVEL SECURITY;
DROP POLICY IF EXISTS rls_surgeries_tenant_isolation ON surgeries;
CREATE POLICY rls_surgeries_tenant_isolation ON surgeries
    USING (tenant_id = NULLIF(current_setting('app.tenant_id', true), '')::integer)
    WITH CHECK (tenant_id = NULLIF(current_setting('app.tenant_id', true), '')::integer);

-- surgery_preop_assessments
ALTER TABLE surgery_preop_assessments ENABLE ROW LEVEL SECURITY;
ALTER TABLE surgery_preop_assessments FORCE ROW LEVEL SECURITY;
DROP POLICY IF EXISTS rls_surgery_preop_assessments_tenant_isolation ON surgery_preop_assessments;
CREATE POLICY rls_surgery_preop_assessments_tenant_isolation ON surgery_preop_assessments
    USING (tenant_id = NULLIF(current_setting('app.tenant_id', true), '')::integer)
    WITH CHECK (tenant_id = NULLIF(current_setting('app.tenant_id', true), '')::integer);

-- surgery_preop_tests
ALTER TABLE surgery_preop_tests ENABLE ROW LEVEL SECURITY;
ALTER TABLE surgery_preop_tests FORCE ROW LEVEL SECURITY;
DROP POLICY IF EXISTS rls_surgery_preop_tests_tenant_isolation ON surgery_preop_tests;
CREATE POLICY rls_surgery_preop_tests_tenant_isolation ON surgery_preop_tests
    USING (tenant_id = NULLIF(current_setting('app.tenant_id', true), '')::integer)
    WITH CHECK (tenant_id = NULLIF(current_setting('app.tenant_id', true), '')::integer);

-- surgery_anesthesia_records
ALTER TABLE surgery_anesthesia_records ENABLE ROW LEVEL SECURITY;
ALTER TABLE surgery_anesthesia_records FORCE ROW LEVEL SECURITY;
DROP POLICY IF EXISTS rls_surgery_anesthesia_records_tenant_isolation ON surgery_anesthesia_records;
CREATE POLICY rls_surgery_anesthesia_records_tenant_isolation ON surgery_anesthesia_records
    USING (tenant_id = NULLIF(current_setting('app.tenant_id', true), '')::integer)
    WITH CHECK (tenant_id = NULLIF(current_setting('app.tenant_id', true), '')::integer);

-- operating_rooms
ALTER TABLE operating_rooms ENABLE ROW LEVEL SECURITY;
ALTER TABLE operating_rooms FORCE ROW LEVEL SECURITY;
DROP POLICY IF EXISTS rls_operating_rooms_tenant_isolation ON operating_rooms;
CREATE POLICY rls_operating_rooms_tenant_isolation ON operating_rooms
    USING (tenant_id = NULLIF(current_setting('app.tenant_id', true), '')::integer)
    WITH CHECK (tenant_id = NULLIF(current_setting('app.tenant_id', true), '')::integer);

-- consent_forms
ALTER TABLE consent_forms ENABLE ROW LEVEL SECURITY;
ALTER TABLE consent_forms FORCE ROW LEVEL SECURITY;
DROP POLICY IF EXISTS rls_consent_forms_tenant_isolation ON consent_forms;
CREATE POLICY rls_consent_forms_tenant_isolation ON consent_forms
    USING (tenant_id = NULLIF(current_setting('app.tenant_id', true), '')::integer)
    WITH CHECK (tenant_id = NULLIF(current_setting('app.tenant_id', true), '')::integer);

COMMIT;
