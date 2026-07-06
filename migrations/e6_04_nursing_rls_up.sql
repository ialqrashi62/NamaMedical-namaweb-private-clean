BEGIN;

-- Create dependencies if they don't exist
CREATE TABLE IF NOT EXISTS nursing_pain_assessments (
    id SERIAL PRIMARY KEY,
    patient_id INTEGER NOT NULL REFERENCES patients(id),
    patient_name TEXT DEFAULT '',
    admission_id INTEGER REFERENCES admissions(id),
    pain_scale VARCHAR(20) DEFAULT 'NRS' CHECK (pain_scale IN ('NRS','VAS','FLACC','FACES','BPS')),
    pain_score INTEGER NOT NULL CHECK (pain_score BETWEEN 0 AND 10),
    pain_location TEXT DEFAULT '',
    pain_character TEXT DEFAULT '',
    pain_radiation TEXT DEFAULT '',
    pain_onset TEXT DEFAULT '',
    pain_duration TEXT DEFAULT '',
    aggravating_factors TEXT DEFAULT '',
    relieving_factors TEXT DEFAULT '',
    current_analgesia TEXT DEFAULT '',
    pain_goal INTEGER DEFAULT 3,
    reassessment_time TIMESTAMPTZ,
    notes TEXT DEFAULT '',
    assessed_by TEXT NOT NULL DEFAULT '',
    assessed_at TIMESTAMPTZ DEFAULT NOW(),
    tenant_id INTEGER NOT NULL DEFAULT 1,
    facility_id INTEGER,
    created_at TIMESTAMPTZ DEFAULT NOW()
);
CREATE INDEX IF NOT EXISTS idx_nursing_pain_patient ON nursing_pain_assessments(patient_id, tenant_id);
CREATE INDEX IF NOT EXISTS idx_nursing_pain_admission ON nursing_pain_assessments(admission_id, tenant_id);
CREATE INDEX IF NOT EXISTS idx_nursing_pain_score ON nursing_pain_assessments(pain_score, tenant_id);


-- 1. Hardening nursing_io table
ALTER TABLE nursing_io ALTER COLUMN tenant_id SET NOT NULL;
ALTER TABLE nursing_io DROP CONSTRAINT IF EXISTS fk_nursing_io_tenant;
ALTER TABLE nursing_io ADD CONSTRAINT fk_nursing_io_tenant FOREIGN KEY (tenant_id) REFERENCES tenants(id) ON DELETE CASCADE;
ALTER TABLE nursing_io ALTER COLUMN tenant_id SET DEFAULT (NULLIF(current_setting('app.tenant_id', true), '')::integer);

ALTER TABLE nursing_io ENABLE ROW LEVEL SECURITY;
ALTER TABLE nursing_io FORCE ROW LEVEL SECURITY;

DROP POLICY IF EXISTS rls_nursing_io_tenant_isolation ON nursing_io;
CREATE POLICY rls_nursing_io_tenant_isolation ON nursing_io
    FOR ALL
    USING (tenant_id = NULLIF(current_setting('app.tenant_id', true), '')::integer)
    WITH CHECK (tenant_id = NULLIF(current_setting('app.tenant_id', true), '')::integer);

CREATE INDEX IF NOT EXISTS idx_nursing_io_tenant_id ON nursing_io(tenant_id);


-- 2. Hardening nursing_handover table
ALTER TABLE nursing_handover ALTER COLUMN tenant_id SET NOT NULL;
ALTER TABLE nursing_handover DROP CONSTRAINT IF EXISTS fk_nursing_handover_tenant;
ALTER TABLE nursing_handover ADD CONSTRAINT fk_nursing_handover_tenant FOREIGN KEY (tenant_id) REFERENCES tenants(id) ON DELETE CASCADE;
ALTER TABLE nursing_handover ALTER COLUMN tenant_id SET DEFAULT (NULLIF(current_setting('app.tenant_id', true), '')::integer);

ALTER TABLE nursing_handover ENABLE ROW LEVEL SECURITY;
ALTER TABLE nursing_handover FORCE ROW LEVEL SECURITY;

DROP POLICY IF EXISTS rls_nursing_handover_tenant_isolation ON nursing_handover;
CREATE POLICY rls_nursing_handover_tenant_isolation ON nursing_handover
    FOR ALL
    USING (tenant_id = NULLIF(current_setting('app.tenant_id', true), '')::integer)
    WITH CHECK (tenant_id = NULLIF(current_setting('app.tenant_id', true), '')::integer);

CREATE INDEX IF NOT EXISTS idx_nursing_handover_tenant_id ON nursing_handover(tenant_id);


-- 3. Hardening nursing_pain_assessments table
ALTER TABLE nursing_pain_assessments ALTER COLUMN tenant_id SET DEFAULT (NULLIF(current_setting('app.tenant_id', true), '')::integer);

ALTER TABLE nursing_pain_assessments ENABLE ROW LEVEL SECURITY;
ALTER TABLE nursing_pain_assessments FORCE ROW LEVEL SECURITY;

DROP POLICY IF EXISTS rls_nursing_pain_assessments_tenant_isolation ON nursing_pain_assessments;
CREATE POLICY rls_nursing_pain_assessments_tenant_isolation ON nursing_pain_assessments
    FOR ALL
    USING (tenant_id = NULLIF(current_setting('app.tenant_id', true), '')::integer)
    WITH CHECK (tenant_id = NULLIF(current_setting('app.tenant_id', true), '')::integer);

CREATE INDEX IF NOT EXISTS idx_nursing_pain_assessments_tenant_id ON nursing_pain_assessments(tenant_id);

COMMIT;
