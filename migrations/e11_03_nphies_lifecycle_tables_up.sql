-- ============================================================
-- e11_03_nphies_lifecycle_tables_up.sql
-- E11 INSURANCE / NPHIES — NEW tenant-isolated lifecycle tables: eligibility checks,
--   pre-authorizations, claim lines, claim denials, payer pricing tiers.
-- CANDIDATE ONLY — DO NOT EXECUTE ON PRODUCTION WITHOUT EXPLICIT DDL APPROVAL (DB gate).
--
-- الهدف: جداول جديدة لدورة حياة التأمين كلها tenant_id NOT NULL + FK -> tenants(id) + FK للكيان الأب
--   + FORCE RLS بالقالب القانوني + آلات حالة عبر CHECK. هذه جداول جديدة => down يُسقطها أولاً.
--   ممنوع إضافتها إلى bootstrap في db_postgres.js (candidate-only؛ تكسر الإقلاع). idempotent.
-- ============================================================
BEGIN;

-- ===== insurance_eligibility_checks (NPHIES eligibility intent/response) =====
CREATE TABLE IF NOT EXISTS insurance_eligibility_checks (
    id SERIAL PRIMARY KEY,
    tenant_id INTEGER NOT NULL REFERENCES tenants(id) ON DELETE CASCADE,
    patient_id INTEGER REFERENCES patients(id) ON DELETE SET NULL,
    insurance_company_id INTEGER REFERENCES insurance_companies(id) ON DELETE SET NULL,
    policy_number TEXT DEFAULT '',
    -- status: pending=intent recorded, NPHIES gated; eligible/ineligible/partial after response
    status TEXT NOT NULL DEFAULT 'pending',
    coverage_amount NUMERIC(14,2) DEFAULT 0,
    nphies_request_json TEXT DEFAULT '',
    nphies_response_json TEXT DEFAULT '',
    checked_by INTEGER,
    created_at TIMESTAMP DEFAULT now()
);
ALTER TABLE insurance_eligibility_checks DROP CONSTRAINT IF EXISTS chk_elig_status;
ALTER TABLE insurance_eligibility_checks ADD CONSTRAINT chk_elig_status
    CHECK (status IN ('pending','eligible','ineligible','partial'));
CREATE INDEX IF NOT EXISTS idx_elig_tenant_id ON insurance_eligibility_checks (tenant_id);
CREATE INDEX IF NOT EXISTS idx_elig_tenant_patient ON insurance_eligibility_checks (tenant_id, patient_id);
ALTER TABLE insurance_eligibility_checks ENABLE ROW LEVEL SECURITY;
ALTER TABLE insurance_eligibility_checks FORCE ROW LEVEL SECURITY;
DROP POLICY IF EXISTS rls_elig_tenant_isolation ON insurance_eligibility_checks;
CREATE POLICY rls_elig_tenant_isolation ON insurance_eligibility_checks
    FOR ALL
    USING (tenant_id = NULLIF(current_setting('app.tenant_id', true), '')::integer)
    WITH CHECK (tenant_id = NULLIF(current_setting('app.tenant_id', true), '')::integer);

-- ===== insurance_pre_authorizations (request -> approved/denied/partial) =====
CREATE TABLE IF NOT EXISTS insurance_pre_authorizations (
    id SERIAL PRIMARY KEY,
    tenant_id INTEGER NOT NULL REFERENCES tenants(id) ON DELETE CASCADE,
    patient_id INTEGER REFERENCES patients(id) ON DELETE SET NULL,
    admission_id INTEGER REFERENCES admissions(id) ON DELETE SET NULL,
    insurance_company_id INTEGER REFERENCES insurance_companies(id) ON DELETE SET NULL,
    requested_amount NUMERIC(14,2) DEFAULT 0,
    approved_amount NUMERIC(14,2) DEFAULT 0,
    auth_status TEXT NOT NULL DEFAULT 'requested',
    auth_number TEXT DEFAULT '',
    clinical_justification TEXT DEFAULT '',
    nphies_request_json TEXT DEFAULT '',
    nphies_response_json TEXT DEFAULT '',
    requested_by INTEGER,
    decided_at TIMESTAMP,
    created_at TIMESTAMP DEFAULT now()
);
ALTER TABLE insurance_pre_authorizations DROP CONSTRAINT IF EXISTS chk_preauth_status;
ALTER TABLE insurance_pre_authorizations ADD CONSTRAINT chk_preauth_status
    CHECK (auth_status IN ('requested','approved','denied','partial'));
ALTER TABLE insurance_pre_authorizations DROP CONSTRAINT IF EXISTS chk_preauth_amounts;
ALTER TABLE insurance_pre_authorizations ADD CONSTRAINT chk_preauth_amounts
    CHECK (requested_amount >= 0 AND approved_amount >= 0);
CREATE INDEX IF NOT EXISTS idx_preauth_tenant_id ON insurance_pre_authorizations (tenant_id);
CREATE INDEX IF NOT EXISTS idx_preauth_tenant_status ON insurance_pre_authorizations (tenant_id, auth_status);
ALTER TABLE insurance_pre_authorizations ENABLE ROW LEVEL SECURITY;
ALTER TABLE insurance_pre_authorizations FORCE ROW LEVEL SECURITY;
DROP POLICY IF EXISTS rls_preauth_tenant_isolation ON insurance_pre_authorizations;
CREATE POLICY rls_preauth_tenant_isolation ON insurance_pre_authorizations
    FOR ALL
    USING (tenant_id = NULLIF(current_setting('app.tenant_id', true), '')::integer)
    WITH CHECK (tenant_id = NULLIF(current_setting('app.tenant_id', true), '')::integer);

-- ===== insurance_claim_lines (claim -> service line; links chargemaster medical_services) =====
CREATE TABLE IF NOT EXISTS insurance_claim_lines (
    id SERIAL PRIMARY KEY,
    tenant_id INTEGER NOT NULL REFERENCES tenants(id) ON DELETE CASCADE,
    claim_id INTEGER NOT NULL REFERENCES insurance_claims(id) ON DELETE CASCADE,
    service_id INTEGER REFERENCES medical_services(id) ON DELETE SET NULL,
    description TEXT DEFAULT '',
    quantity NUMERIC(10,2) DEFAULT 1,
    unit_price NUMERIC(14,2) DEFAULT 0,
    line_amount NUMERIC(14,2) DEFAULT 0,
    approved_amount NUMERIC(14,2) DEFAULT 0,
    created_at TIMESTAMP DEFAULT now()
);
ALTER TABLE insurance_claim_lines DROP CONSTRAINT IF EXISTS chk_claimline_amounts;
ALTER TABLE insurance_claim_lines ADD CONSTRAINT chk_claimline_amounts
    CHECK (quantity >= 0 AND unit_price >= 0 AND line_amount >= 0 AND approved_amount >= 0);
CREATE INDEX IF NOT EXISTS idx_claimline_tenant_id ON insurance_claim_lines (tenant_id);
CREATE INDEX IF NOT EXISTS idx_claimline_tenant_claim ON insurance_claim_lines (tenant_id, claim_id);
ALTER TABLE insurance_claim_lines ENABLE ROW LEVEL SECURITY;
ALTER TABLE insurance_claim_lines FORCE ROW LEVEL SECURITY;
DROP POLICY IF EXISTS rls_claimline_tenant_isolation ON insurance_claim_lines;
CREATE POLICY rls_claimline_tenant_isolation ON insurance_claim_lines
    FOR ALL
    USING (tenant_id = NULLIF(current_setting('app.tenant_id', true), '')::integer)
    WITH CHECK (tenant_id = NULLIF(current_setting('app.tenant_id', true), '')::integer);

-- ===== insurance_claim_denials (denial reason + appeal lifecycle) =====
CREATE TABLE IF NOT EXISTS insurance_claim_denials (
    id SERIAL PRIMARY KEY,
    tenant_id INTEGER NOT NULL REFERENCES tenants(id) ON DELETE CASCADE,
    claim_id INTEGER NOT NULL REFERENCES insurance_claims(id) ON DELETE CASCADE,
    denial_reason TEXT DEFAULT '',
    denial_code TEXT DEFAULT '',
    appeal_status TEXT NOT NULL DEFAULT 'open',
    appeal_notes TEXT DEFAULT '',
    created_by INTEGER,
    created_at TIMESTAMP DEFAULT now()
);
ALTER TABLE insurance_claim_denials DROP CONSTRAINT IF EXISTS chk_denial_appeal_status;
ALTER TABLE insurance_claim_denials ADD CONSTRAINT chk_denial_appeal_status
    CHECK (appeal_status IN ('open','appealed','upheld','overturned','closed'));
CREATE INDEX IF NOT EXISTS idx_denial_tenant_id ON insurance_claim_denials (tenant_id);
CREATE INDEX IF NOT EXISTS idx_denial_tenant_claim ON insurance_claim_denials (tenant_id, claim_id);
ALTER TABLE insurance_claim_denials ENABLE ROW LEVEL SECURITY;
ALTER TABLE insurance_claim_denials FORCE ROW LEVEL SECURITY;
DROP POLICY IF EXISTS rls_denial_tenant_isolation ON insurance_claim_denials;
CREATE POLICY rls_denial_tenant_isolation ON insurance_claim_denials
    FOR ALL
    USING (tenant_id = NULLIF(current_setting('app.tenant_id', true), '')::integer)
    WITH CHECK (tenant_id = NULLIF(current_setting('app.tenant_id', true), '')::integer);

-- ===== insurance_payer_pricing (per-payer chargemaster price tiers) =====
CREATE TABLE IF NOT EXISTS insurance_payer_pricing (
    id SERIAL PRIMARY KEY,
    tenant_id INTEGER NOT NULL REFERENCES tenants(id) ON DELETE CASCADE,
    insurance_company_id INTEGER NOT NULL REFERENCES insurance_companies(id) ON DELETE CASCADE,
    service_id INTEGER NOT NULL REFERENCES medical_services(id) ON DELETE CASCADE,
    payer_price NUMERIC(14,2) NOT NULL DEFAULT 0,
    effective_from DATE DEFAULT CURRENT_DATE,
    is_active INTEGER DEFAULT 1,
    created_by INTEGER,
    created_at TIMESTAMP DEFAULT now()
);
ALTER TABLE insurance_payer_pricing DROP CONSTRAINT IF EXISTS chk_payerprice_nonneg;
ALTER TABLE insurance_payer_pricing ADD CONSTRAINT chk_payerprice_nonneg
    CHECK (payer_price >= 0);
CREATE INDEX IF NOT EXISTS idx_payerprice_tenant_id ON insurance_payer_pricing (tenant_id);
CREATE UNIQUE INDEX IF NOT EXISTS uq_payerprice_tenant_company_service
    ON insurance_payer_pricing (tenant_id, insurance_company_id, service_id);
ALTER TABLE insurance_payer_pricing ENABLE ROW LEVEL SECURITY;
ALTER TABLE insurance_payer_pricing FORCE ROW LEVEL SECURITY;
DROP POLICY IF EXISTS rls_payerprice_tenant_isolation ON insurance_payer_pricing;
CREATE POLICY rls_payerprice_tenant_isolation ON insurance_payer_pricing
    FOR ALL
    USING (tenant_id = NULLIF(current_setting('app.tenant_id', true), '')::integer)
    WITH CHECK (tenant_id = NULLIF(current_setting('app.tenant_id', true), '')::integer);

COMMIT;
