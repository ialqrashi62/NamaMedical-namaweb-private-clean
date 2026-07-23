-- Migration for Dermatology & Cosmetic Surgery Specialized Data
-- Target: namaweb/migrations/e65_dermatology_up.sql

CREATE TABLE IF NOT EXISTS dermatology_lesion_logs (
    id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
    patient_id UUID NOT NULL REFERENCES patients(id) ON DELETE CASCADE,
    tenant_id UUID NOT NULL,
    anatomical_site TEXT NOT NULL,
    morphology TEXT,
    size_mm DECIMAL(5,2),
    color TEXT,
    border_type TEXT,
    texture TEXT,
    created_at TIMESTAMP WITH TIME ZONE DEFAULT CURRENT_TIMESTAMP,
    updated_at TIMESTAMP WITH TIME ZONE DEFAULT CURRENT_TIMESTAMP
);

CREATE TABLE IF NOT EXISTS dermatology_cosmetic_logs (
    id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
    patient_id UUID NOT NULL REFERENCES patients(id) ON DELETE CASCADE,
    tenant_id UUID NOT NULL,
    procedure_type TEXT,
    product_used TEXT,
    dose_volume DECIMAL(6,2),
    site TEXT,
    session_number INTEGER,
    created_at TIMESTAMP WITH TIME ZONE DEFAULT CURRENT_TIMESTAMP
);

-- Enable RLS
ALTER TABLE dermatology_lesion_logs ENABLE ROW LEVEL SECURITY;
ALTER TABLE dermatology_cosmetic_logs ENABLE ROW LEVEL SECURITY;

CREATE POLICY tenant_isolation_policy ON dermatology_lesion_logs 
    USING (tenant_id = current_setting('app.current_tenant')::uuid);

CREATE POLICY tenant_isolation_policy ON dermatology_cosmetic_logs 
    USING (tenant_id = current_setting('app.current_tenant')::uuid);
