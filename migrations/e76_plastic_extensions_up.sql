-- Migration: e76_plastic_extensions_up.sql
-- Description: Adds specialized tables for Plastic & Reconstructive Surgery.
-- Compliance: PDPL / RLS Enabled

BEGIN;

CREATE TABLE IF NOT EXISTS plastic_surgery_sessions (
    id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
    tenant_id UUID NOT NULL,
    patient_id UUID NOT NULL,
    surgeon_id UUID NOT NULL,
    procedure_type VARCHAR(255),
    flap_used BOOLEAN,
    flap_type VARCHAR(100),
    perfusion_index FLOAT,
    created_at TIMESTAMP WITH TIME ZONE DEFAULT CURRENT_TIMESTAMP,
    CONSTRAINT fk_tenant_plas FOREIGN KEY (tenant_id) REFERENCES tenants(id) ON DELETE CASCADE,
    CONSTRAINT fk_patient_plas FOREIGN KEY (patient_id) REFERENCES patients(id) ON DELETE CASCADE
);

CREATE TABLE IF NOT EXISTS aesthetic_logs (
    id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
    session_id UUID NOT NULL,
    tenant_id UUID NOT NULL,
    target_area VARCHAR(255),
    material_used TEXT,
    session_count INTEGER,
    created_at TIMESTAMP WITH TIME ZONE DEFAULT CURRENT_TIMESTAMP,
    CONSTRAINT fk_tenant_aes FOREIGN KEY (tenant_id) REFERENCES tenants(id) ON DELETE CASCADE,
    CONSTRAINT fk_session_aes FOREIGN KEY (session_id) REFERENCES plastic_surgery_sessions(id) ON DELETE CASCADE
);

ALTER TABLE plastic_surgery_sessions ENABLE ROW LEVEL SECURITY;
ALTER TABLE aesthetic_logs ENABLE ROW LEVEL SECURITY;

CREATE POLICY tenant_isolation_policy ON plastic_surgery_sessions USING (tenant_id = current_setting('app.current_tenant')::UUID);
CREATE POLICY tenant_isolation_policy ON aesthetic_logs USING (tenant_id = current_setting('app.current_tenant')::UUID);

COMMIT;
