-- Migration: e69_derm_extensions_up.sql
-- Description: Adds specialized tables for Dermatology and Cosmetic Procedures.
-- Compliance: PDPL / RLS Enabled

BEGIN;

-- 1. Dermatology Lesion Records
CREATE TABLE IF NOT EXISTS derm_lesion_records (
    id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
    tenant_id UUID NOT NULL,
    patient_id UUID NOT NULL,
    lesion_location VARCHAR(255),
    description TEXT,
    biopsy_status VARCHAR(50), -- e.g., Pending, Benign, Malignant
    image_path TEXT, -- Path to phi_vault/
    created_at TIMESTAMP WITH TIME ZONE DEFAULT CURRENT_TIMESTAMP,
    CONSTRAINT fk_tenant_derm FOREIGN KEY (tenant_id) REFERENCES tenants(id) ON DELETE CASCADE,
    CONSTRAINT fk_patient_derm FOREIGN KEY (patient_id) REFERENCES patients(id) ON DELETE CASCADE
);

-- 2. Cosmetic & Laser Logs
CREATE TABLE IF NOT EXISTS derm_cosmetic_logs (
    id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
    tenant_id UUID NOT NULL,
    patient_id UUID NOT NULL,
    procedure_type VARCHAR(100),
    laser_settings JSONB, -- { "wavelength": "532nm", "energy": "10mJ" }
    session_number INTEGER,
    outcome_notes TEXT,
    created_at TIMESTAMP WITH TIME ZONE DEFAULT CURRENT_TIMESTAMP,
    CONSTRAINT fk_tenant_cosm FOREIGN KEY (tenant_id) REFERENCES tenants(id) ON DELETE CASCADE,
    CONSTRAINT fk_patient_cosm FOREIGN KEY (patient_id) REFERENCES patients(id) ON DELETE CASCADE
);

-- Enable Row Level Security (RLS)
ALTER TABLE derm_lesion_records ENABLE ROW LEVEL SECURITY;
ALTER TABLE derm_cosmetic_logs ENABLE ROW LEVEL SECURITY;

-- Create RLS Policies (Golden Access Rule: Tenant Isolation)
CREATE POLICY tenant_isolation_policy ON derm_lesion_records 
    USING (tenant_id = current_setting('app.current_tenant')::UUID);

CREATE POLICY tenant_isolation_policy ON derm_cosmetic_logs 
    USING (tenant_id = current_setting('app.current_tenant')::UUID);

COMMIT;
