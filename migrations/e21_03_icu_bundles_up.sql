-- e21_03_icu_bundles_up.sql
-- Migration to add icu_prevention_bundles table for Infection Control (Phase F3)

CREATE TABLE IF NOT EXISTS icu_prevention_bundles (
    id SERIAL PRIMARY KEY,
    tenant_id INTEGER NOT NULL REFERENCES tenants(id) ON DELETE CASCADE,
    facility_id INTEGER,
    admission_id INTEGER NOT NULL REFERENCES admissions(id) ON DELETE CASCADE,
    bundle_type VARCHAR(50) NOT NULL, -- 'VAP' | 'CLABSI' | 'CAUTI'
    audit_date DATE NOT NULL,
    checked_items JSONB NOT NULL,     -- e.g. {"head_elevation": true, "dvt_prophylaxis": false}
    compliance_rate DECIMAL(5,2) NOT NULL, -- e.g. 80.00
    non_compliance_reason TEXT,       -- mandatory if compliance_rate < 100
    recorded_by INTEGER REFERENCES system_users(id) ON DELETE SET NULL,
    created_at TIMESTAMP DEFAULT CURRENT_TIMESTAMP,
    CONSTRAINT unique_admission_bundle_date UNIQUE (tenant_id, admission_id, bundle_type, audit_date),
    CONSTRAINT chk_bundle_type CHECK (bundle_type IN ('VAP', 'CLABSI', 'CAUTI'))
);

-- Enable Row Level Security
ALTER TABLE icu_prevention_bundles ENABLE ROW LEVEL SECURITY;
ALTER TABLE icu_prevention_bundles FORCE ROW LEVEL SECURITY;

-- Create Tenant isolation policy
DROP POLICY IF EXISTS rls_icu_prevention_bundles ON icu_prevention_bundles;
CREATE POLICY rls_icu_prevention_bundles ON icu_prevention_bundles
    USING (tenant_id = NULLIF(current_setting('app.tenant_id', true), '')::integer)
    WITH CHECK (tenant_id = NULLIF(current_setting('app.tenant_id', true), '')::integer);

-- Grant privileges to nama_medical_app
GRANT ALL PRIVILEGES ON TABLE icu_prevention_bundles TO nama_medical_app;
