-- Migration for Nuclear Cardiology Specialized Data
-- Target: namaweb/migrations/e53_nuclear_cardiology_up.sql

CREATE TABLE IF NOT EXISTS nuclear_cardiology_scans (
    id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
    patient_id UUID NOT NULL REFERENCES patients(id) ON DELETE CASCADE,
    encounter_id UUID NOT NULL,
    tenant_id UUID NOT NULL,
    tracer_used TEXT, -- e.g., 'Technetium-99m Sestamibi'
    dose_mci DECIMAL(6,2),
    scan_type TEXT CHECK (scan_type IN ('SPECT', 'PET', 'Hybrid')),
    stress_type TEXT CHECK (stress_type IN ('Exercise', 'Pharmacological', 'None')),
    created_at TIMESTAMP WITH TIME ZONE DEFAULT CURRENT_TIMESTAMP,
    updated_at TIMESTAMP WITH TIME ZONE DEFAULT CURRENT_TIMESTAMP
);

CREATE TABLE IF NOT EXISTS nuclear_perfusion_results (
    id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
    scan_id UUID NOT NULL REFERENCES nuclear_cardiology_scans(id) ON DELETE CASCADE,
    tenant_id UUID NOT NULL,
    wall_motion_abnormality TEXT,
    perfusion_defect_location TEXT,
    viability_status TEXT CHECK (viability_status IN ('Viable', 'Non-viable', 'Indeterminate')),
    ejection_fraction_nuclear DECIMAL(5,2),
    created_at TIMESTAMP WITH TIME ZONE DEFAULT CURRENT_TIMESTAMP
);

-- Enable RLS
ALTER TABLE nuclear_cardiology_scans ENABLE ROW LEVEL SECURITY;
ALTER TABLE nuclear_perfusion_results ENABLE ROW LEVEL SECURITY;

CREATE POLICY tenant_isolation_policy ON nuclear_cardiology_scans 
    USING (tenant_id = current_setting('app.current_tenant')::uuid);

CREATE POLICY tenant_isolation_policy ON nuclear_perfusion_results 
    USING (tenant_id = current_setting('app.current_tenant')::uuid);
