-- Migration: e75_urology_extensions_up.sql
-- Description: Adds specialized tables for Urology Surgery.
-- Compliance: PDPL / RLS Enabled

BEGIN;

CREATE TABLE IF NOT EXISTS urology_surgery_sessions (
    id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
    tenant_id UUID NOT NULL,
    patient_id UUID NOT NULL,
    surgeon_id UUID NOT NULL,
    procedure_type VARCHAR(255),
    stent_used BOOLEAN,
    stent_type VARCHAR(100),
    duration_min INTEGER,
    created_at TIMESTAMP WITH TIME ZONE DEFAULT CURRENT_TIMESTAMP,
    CONSTRAINT fk_tenant_uro FOREIGN KEY (tenant_id) REFERENCES tenants(id) ON DELETE CASCADE,
    CONSTRAINT fk_patient_uro FOREIGN KEY (patient_id) REFERENCES patients(id) ON DELETE CASCADE
);

CREATE TABLE IF NOT EXISTS urology_stone_logs (
    id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
    session_id UUID NOT NULL,
    tenant_id UUID NOT NULL,
    stone_size_mm FLOAT,
    stone_location VARCHAR(255),
    fragmentation_rate_pct FLOAT,
    created_at TIMESTAMP WITH TIME ZONE DEFAULT CURRENT_TIMESTAMP,
    CONSTRAINT fk_tenant_stone FOREIGN KEY (tenant_id) REFERENCES tenants(id) ON DELETE CASCADE,
    CONSTRAINT fk_session_stone FOREIGN KEY (session_id) REFERENCES urology_surgery_sessions(id) ON DELETE CASCADE
);

ALTER TABLE urology_surgery_sessions ENABLE ROW LEVEL SECURITY;
ALTER TABLE urology_stone_logs ENABLE ROW LEVEL SECURITY;

CREATE POLICY tenant_isolation_policy ON urology_surgery_sessions USING (tenant_id = current_setting('app.current_tenant')::UUID);
CREATE POLICY tenant_isolation_policy ON urology_stone_logs USING (tenant_id = current_setting('app.current_tenant')::UUID);

COMMIT;
