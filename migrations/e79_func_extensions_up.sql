-- Migration: e79_func_extensions_up.sql
-- Description: Adds specialized tables for Functional Tests (ECG, EEG, EMG).
-- Compliance: PDPL / RLS Enabled

BEGIN;

CREATE TABLE IF NOT EXISTS functional_test_results (
    id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
    tenant_id UUID NOT NULL,
    patient_id UUID NOT NULL,
    test_type VARCHAR(100), -- ECG, EEG, EMG, PFT
    waveform_path TEXT, -- Path to phi_vault/
    interpretation TEXT,
    is_abnormal BOOLEAN DEFAULT FALSE,
    created_at TIMESTAMP WITH TIME ZONE DEFAULT CURRENT_TIMESTAMP,
    CONSTRAINT fk_tenant_func FOREIGN KEY (tenant_id) REFERENCES tenants(id) ON DELETE CASCADE,
    CONSTRAINT fk_patient_func FOREIGN KEY (patient_id) REFERENCES patients(id) ON DELETE CASCADE
);

ALTER TABLE functional_test_results ENABLE ROW LEVEL SECURITY;

CREATE POLICY tenant_isolation_policy ON functional_test_results USING (tenant_id = current_setting('app.current_tenant')::UUID);

COMMIT;
