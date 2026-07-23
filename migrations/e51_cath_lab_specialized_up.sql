-- Migration for Interventional Cardiology (Cath Lab)
-- Target: namaweb/migrations/e51_cath_lab_specialized_up.sql

CREATE TABLE IF NOT EXISTS cath_lab_procedures (
    id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
    patient_id UUID NOT NULL REFERENCES patients(id) ON DELETE CASCADE,
    encounter_id UUID NOT NULL,
    tenant_id UUID NOT NULL,
    operator_id UUID NOT NULL REFERENCES system_users(id),
    access_site TEXT CHECK (access_site IN ('Radial', 'Femoral', 'Brachial', 'Other')),
    fluoroscopy_time_min DECIMAL(5,2),
    contrast_volume_ml DECIMAL(6,2),
    procedure_date TIMESTAMP WITH TIME ZONE DEFAULT CURRENT_TIMESTAMP,
    status TEXT CHECK (status IN ('Scheduled', 'In-Progress', 'Completed', 'Cancelled')),
    created_at TIMESTAMP WITH TIME ZONE DEFAULT CURRENT_TIMESTAMP,
    updated_at TIMESTAMP WITH TIME ZONE DEFAULT CURRENT_TIMESTAMP
);

CREATE TABLE IF NOT EXISTS stent_registry (
    id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
    procedure_id UUID NOT NULL REFERENCES cath_lab_procedures(id) ON DELETE CASCADE,
    tenant_id UUID NOT NULL,
    vessel_segment TEXT NOT NULL, -- e.g., LAD, LCx, RCA
    stent_brand TEXT,
    diameter_mm DECIMAL(4,2),
    length_mm DECIMAL(4,2),
    material TEXT, -- e.g., DES, BMS
    pressure_post_dilation DECIMAL(5,2),
    created_at TIMESTAMP WITH TIME ZONE DEFAULT CURRENT_TIMESTAMP
);

-- Enable RLS
ALTER TABLE cath_lab_procedures ENABLE ROW LEVEL SECURITY;
ALTER TABLE stent_registry ENABLE ROW LEVEL SECURITY;

CREATE POLICY tenant_isolation_policy ON cath_lab_procedures 
    USING (tenant_id = current_setting('app.current_tenant')::uuid);

CREATE POLICY tenant_isolation_policy ON stent_registry 
    USING (tenant_id = current_setting('app.current_tenant')::uuid);
