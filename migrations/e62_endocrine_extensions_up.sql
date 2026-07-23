-- Migration: e62_endocrine_extensions_up.sql
-- Description: Adds specialized tables for Endocrinology and Diabetes.
-- Compliance: PDPL / RLS Enabled

BEGIN;

-- 1. Diabetes Glucose Logs
CREATE TABLE IF NOT EXISTS diabetes_logs (
    id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
    tenant_id UUID NOT NULL,
    patient_id UUID NOT NULL,
    record_date TIMESTAMP WITH TIME ZONE DEFAULT CURRENT_TIMESTAMP,
    glucose_value_mgdl FLOAT,
    hba1c_percentage FLOAT,
    insulin_dose_units FLOAT,
    meal_type VARCHAR(50), -- Fasting, Post-Prandial, etc.
    notes TEXT,
    CONSTRAINT fk_tenant_dia FOREIGN KEY (tenant_id) REFERENCES tenants(id) ON DELETE CASCADE,
    CONSTRAINT fk_patient_dia FOREIGN KEY (patient_id) REFERENCES patients(id) ON DELETE CASCADE
);

-- 2. Thyroid & Endocrine Metrics
CREATE TABLE IF NOT EXISTS thyroid_metrics (
    id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
    tenant_id UUID NOT NULL,
    patient_id UUID NOT NULL,
    record_date TIMESTAMP WITH TIME ZONE DEFAULT CURRENT_TIMESTAMP,
    tsh_level FLOAT,
    t4_free FLOAT,
    t3_total FLOAT,
    nodule_size_mm FLOAT,
    hormone_imbalance_type VARCHAR(100),
    created_at TIMESTAMP WITH TIME ZONE DEFAULT CURRENT_TIMESTAMP,
    CONSTRAINT fk_tenant_thy FOREIGN KEY (tenant_id) REFERENCES tenants(id) ON DELETE CASCADE,
    CONSTRAINT fk_patient_thy FOREIGN KEY (patient_id) REFERENCES patients(id) ON DELETE CASCADE
);

-- Enable Row Level Security (RLS)
ALTER TABLE diabetes_logs ENABLE ROW LEVEL SECURITY;
ALTER TABLE thyroid_metrics ENABLE ROW LEVEL SECURITY;

-- Create RLS Policies (Golden Access Rule: Tenant Isolation)
CREATE POLICY tenant_isolation_policy ON diabetes_logs 
    USING (tenant_id = current_setting('app.current_tenant')::UUID);

CREATE POLICY tenant_isolation_policy ON thyroid_metrics 
    USING (tenant_id = current_setting('app.current_tenant')::UUID);

COMMIT;
