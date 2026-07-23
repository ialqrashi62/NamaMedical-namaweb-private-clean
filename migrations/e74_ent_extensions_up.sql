-- Migration: e74_ent_extensions_up.sql
-- Description: Adds specialized tables for ENT Surgery.
-- Compliance: PDPL / RLS Enabled

BEGIN;

CREATE TABLE IF NOT EXISTS ent_surgery_sessions (
    id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
    tenant_id UUID NOT NULL,
    patient_id UUID NOT NULL,
    surgeon_id UUID NOT NULL,
    side VARCHAR(20), -- Left, Right, Bilateral
    procedure_type VARCHAR(255),
    implant_model VARCHAR(100),
    outcome_hearing_gain_db FLOAT,
    created_at TIMESTAMP WITH TIME ZONE DEFAULT CURRENT_TIMESTAMP,
    CONSTRAINT fk_tenant_ent FOREIGN KEY (tenant_id) REFERENCES tenants(id) ON DELETE CASCADE,
    CONSTRAINT fk_patient_ent FOREIGN KEY (patient_id) REFERENCES patients(id) ON DELETE CASCADE
);

CREATE TABLE IF NOT EXISTS ent_audiometry_logs (
    id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
    session_id UUID NOT NULL,
    tenant_id UUID NOT NULL,
    frequency_hz INTEGER,
    decibel_level FLOAT,
    test_type VARCHAR(50), -- Air, Bone
    created_at TIMESTAMP WITH TIME ZONE DEFAULT CURRENT_TIMESTAMP,
    CONSTRAINT fk_tenant_aud FOREIGN KEY (tenant_id) REFERENCES tenants(id) ON DELETE CASCADE,
    CONSTRAINT fk_session_aud FOREIGN KEY (session_id) REFERENCES ent_surgery_sessions(id) ON DELETE CASCADE
);

ALTER TABLE ent_surgery_sessions ENABLE ROW LEVEL SECURITY;
ALTER TABLE ent_audiometry_logs ENABLE ROW LEVEL SECURITY;

CREATE POLICY tenant_isolation_policy ON ent_surgery_sessions USING (tenant_id = current_setting('app.current_tenant')::UUID);
CREATE POLICY tenant_isolation_policy ON ent_audiometry_logs USING (tenant_id = current_setting('app.current_tenant')::UUID);

COMMIT;
