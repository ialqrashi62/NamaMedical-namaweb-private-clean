-- Migration: e78_lab_extensions_up.sql
-- Description: Adds specialized tables for Central Laboratory and Pathology.
-- Compliance: PDPL / RLS Enabled

BEGIN;

CREATE TABLE IF NOT EXISTS lab_results_extended (
    id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
    tenant_id UUID NOT NULL,
    patient_id UUID NOT NULL,
    test_code VARCHAR(100),
    value FLOAT,
    unit VARCHAR(50),
    reference_range VARCHAR(100),
    is_critical BOOLEAN DEFAULT FALSE,
    verification_status VARCHAR(50), -- Preliminary, Final
    created_at TIMESTAMP WITH TIME ZONE DEFAULT CURRENT_TIMESTAMP,
    CONSTRAINT fk_tenant_lab FOREIGN KEY (tenant_id) REFERENCES tenants(id) ON DELETE CASCADE,
    CONSTRAINT fk_patient_lab FOREIGN KEY (patient_id) REFERENCES patients(id) ON DELETE CASCADE
);

CREATE TABLE IF NOT EXISTS lab_qc_logs (
    id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
    tenant_id UUID NOT NULL,
    test_code VARCHAR(100),
    control_value FLOAT,
    expected_value FLOAT,
    variance_pct FLOAT,
    created_at TIMESTAMP WITH TIME ZONE DEFAULT CURRENT_TIMESTAMP,
    CONSTRAINT fk_tenant_qc FOREIGN KEY (tenant_id) REFERENCES tenants(id) ON DELETE CASCADE
);

ALTER TABLE lab_results_extended ENABLE ROW LEVEL SECURITY;
ALTER TABLE lab_qc_logs ENABLE ROW LEVEL SECURITY;

CREATE POLICY tenant_isolation_policy ON lab_results_extended USING (tenant_id = current_setting('app.current_tenant')::UUID);
CREATE POLICY tenant_isolation_policy ON lab_qc_logs USING (tenant_id = current_setting('app.current_tenant')::UUID);

COMMIT;
