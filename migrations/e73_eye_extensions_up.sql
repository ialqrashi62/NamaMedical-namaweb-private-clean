-- Migration: e73_eye_extensions_up.sql
-- Description: Adds specialized tables for Ophthalmology Surgery.
-- Compliance: PDPL / RLS Enabled

BEGIN;

CREATE TABLE IF NOT EXISTS eye_surgery_sessions (
    id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
    tenant_id UUID NOT NULL,
    patient_id UUID NOT NULL,
    surgeon_id UUID NOT NULL,
    eye_side VARCHAR(10), -- L, R, Both
    procedure_type VARCHAR(255),
    iol_model VARCHAR(100),
    iol_power FLOAT,
    axial_length FLOAT,
    outcome_visual_acuity VARCHAR(50),
    created_at TIMESTAMP WITH TIME ZONE DEFAULT CURRENT_TIMESTAMP,
    CONSTRAINT fk_tenant_eye FOREIGN KEY (tenant_id) REFERENCES tenants(id) ON DELETE CASCADE,
    CONSTRAINT fk_patient_eye FOREIGN KEY (patient_id) REFERENCES patients(id) ON DELETE CASCADE
);

CREATE TABLE IF NOT EXISTS eye_biometry_logs (
    id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
    session_id UUID NOT NULL,
    tenant_id UUID NOT NULL,
    keratometry_reading FLOAT,
    predicted_iol_power FLOAT,
    created_at TIMESTAMP WITH TIME ZONE DEFAULT CURRENT_TIMESTAMP,
    CONSTRAINT fk_tenant_bio FOREIGN KEY (tenant_id) REFERENCES tenants(id) ON DELETE CASCADE,
    CONSTRAINT fk_session_bio FOREIGN KEY (session_id) REFERENCES eye_surgery_sessions(id) ON DELETE CASCADE
);

ALTER TABLE eye_surgery_sessions ENABLE ROW LEVEL SECURITY;
ALTER TABLE eye_biometry_logs ENABLE ROW LEVEL SECURITY;

CREATE POLICY tenant_isolation_policy ON eye_surgery_sessions USING (tenant_id = current_setting('app.current_tenant')::UUID);
CREATE POLICY tenant_isolation_policy ON eye_biometry_logs USING (tenant_id = current_setting('app.current_tenant')::UUID);

COMMIT;
