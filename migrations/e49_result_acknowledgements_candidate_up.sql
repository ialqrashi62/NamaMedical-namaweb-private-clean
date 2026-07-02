-- e49_result_acknowledgements_candidate_up.sql — CANDIDATE, NOT RUN (requires owner approval).
-- Gate 3: physician acknowledgement of verified abnormal/critical results (order↔result
-- closed loop, provider side). One row per acknowledging clinician per result.
-- The /api/results/*/acknowledge endpoints feature-detect this table and return
-- 503 RESULT_ACK_PENDING_DDL until it exists. Additive-only; no existing data touched.

BEGIN;

CREATE TABLE IF NOT EXISTS result_acknowledgements (
    id SERIAL PRIMARY KEY,
    tenant_id INTEGER NOT NULL REFERENCES tenants(id) ON DELETE CASCADE,
    facility_id INTEGER,
    result_type TEXT NOT NULL,
    result_id INTEGER NOT NULL,
    patient_id INTEGER NOT NULL REFERENCES patients(id),
    ack_level TEXT NOT NULL,
    acknowledged_by INTEGER NOT NULL,
    acknowledged_by_name TEXT DEFAULT '',
    note TEXT DEFAULT '',
    acknowledged_at TIMESTAMP DEFAULT CURRENT_TIMESTAMP,
    CONSTRAINT chk_result_ack_type CHECK (result_type IN ('lab', 'rad')),
    CONSTRAINT chk_result_ack_level CHECK (ack_level IN ('critical', 'abnormal', 'unknown')),
    CONSTRAINT uq_result_ack UNIQUE (tenant_id, result_type, result_id, acknowledged_by)
);

ALTER TABLE result_acknowledgements ENABLE ROW LEVEL SECURITY;
ALTER TABLE result_acknowledgements FORCE ROW LEVEL SECURITY;

DROP POLICY IF EXISTS rls_result_ack_tenant_isolation ON result_acknowledgements;
CREATE POLICY rls_result_ack_tenant_isolation ON result_acknowledgements
    USING (tenant_id = NULLIF(current_setting('app.tenant_id', true), '')::integer)
    WITH CHECK (tenant_id = NULLIF(current_setting('app.tenant_id', true), '')::integer);

CREATE INDEX IF NOT EXISTS idx_result_ack_tenant_result ON result_acknowledgements (tenant_id, result_type, result_id);
CREATE INDEX IF NOT EXISTS idx_result_ack_tenant_patient ON result_acknowledgements (tenant_id, patient_id);

DO $$
BEGIN
    IF EXISTS (SELECT 1 FROM pg_roles WHERE rolname = 'nama_medical_app') THEN
        EXECUTE 'GRANT ALL PRIVILEGES ON TABLE result_acknowledgements TO nama_medical_app';
        EXECUTE 'GRANT USAGE, SELECT ON SEQUENCE result_acknowledgements_id_seq TO nama_medical_app';
    END IF;
    IF EXISTS (SELECT 1 FROM pg_roles WHERE rolname = 'jumanasoft_staging_user') THEN
        EXECUTE 'GRANT ALL PRIVILEGES ON TABLE result_acknowledgements TO jumanasoft_staging_user';
        EXECUTE 'GRANT USAGE, SELECT ON SEQUENCE result_acknowledgements_id_seq TO jumanasoft_staging_user';
    END IF;
END $$;

COMMIT;
