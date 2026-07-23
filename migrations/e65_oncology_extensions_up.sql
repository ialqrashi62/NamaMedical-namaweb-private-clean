-- Migration: e65_oncology_extensions_up.sql
-- Description: Adds specialized tables for Oncology and Hematology.
-- Compliance: PDPL / RLS Enabled

BEGIN;

-- 1. Chemotherapy Cycle Logs
CREATE TABLE IF NOT EXISTS oncology_chemo_logs (
    id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
    tenant_id UUID NOT NULL,
    patient_id UUID NOT NULL,
    cycle_number INTEGER,
    drug_name VARCHAR(255),
    dose_mg FLOAT,
    infusion_duration_min INTEGER,
    toxicity_grade INTEGER, -- Grade 1-4
    administered_at TIMESTAMP WITH TIME ZONE DEFAULT CURRENT_TIMESTAMP,
    notes TEXT,
    CONSTRAINT fk_tenant_onco FOREIGN KEY (tenant_id) REFERENCES tenants(id) ON DELETE CASCADE,
    CONSTRAINT fk_patient_onco FOREIGN KEY (patient_id) REFERENCES patients(id) ON DELETE CASCADE
);

-- 2. BMT (Bone Marrow Transplant) Monitoring
CREATE TABLE IF NOT EXISTS bmt_monitoring (
    id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
    tenant_id UUID NOT NULL,
    patient_id UUID NOT NULL,
    transplant_date DATE,
    cd34_count_per_kg FLOAT,
    engraftment_date DATE,
    gvhd_grade INTEGER, -- Graft-vs-Host Disease
    last_biopsy_result TEXT,
    created_at TIMESTAMP WITH TIME ZONE DEFAULT CURRENT_TIMESTAMP,
    CONSTRAINT fk_tenant_bmt FOREIGN KEY (tenant_id) REFERENCES tenants(id) ON DELETE CASCADE,
    CONSTRAINT fk_patient_bmt FOREIGN KEY (patient_id) REFERENCES patients(id) ON DELETE CASCADE
);

-- Enable Row Level Security (RLS)
ALTER TABLE oncology_chemo_logs ENABLE ROW LEVEL SECURITY;
ALTER TABLE bmt_monitoring ENABLE ROW LEVEL SECURITY;

-- Create RLS Policies (Golden Access Rule: Tenant Isolation)
CREATE POLICY tenant_isolation_policy ON oncology_chemo_logs 
    USING (tenant_id = current_setting('app.current_tenant')::UUID);

CREATE POLICY tenant_isolation_policy ON bmt_monitoring 
    USING (tenant_id = current_setting('app.current_tenant')::UUID);

COMMIT;
