-- Migration for Hematology & Oncology Specialized Data
-- Target: namaweb/migrations/e61_oncology_hematology_up.sql

CREATE TABLE IF NOT EXISTS oncology_chemo_cycles (
    id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
    patient_id UUID NOT NULL REFERENCES patients(id) ON DELETE CASCADE,
    tenant_id UUID NOT NULL,
    protocol_name TEXT NOT NULL,
    cycle_number INTEGER NOT NULL,
    day_number INTEGER NOT NULL,
    drug_name TEXT NOT NULL,
    dose_mg_m2 DECIMAL(10,2),
    actual_dose_mg DECIMAL(10,2),
    admin_date TIMESTAMP WITH TIME ZONE DEFAULT CURRENT_TIMESTAMP,
    admin_status TEXT CHECK (admin_status IN ('Planned', 'Administered', 'Delayed', 'Cancelled')),
    created_at TIMESTAMP WITH TIME ZONE DEFAULT CURRENT_TIMESTAMP
);

CREATE TABLE IF NOT EXISTS oncology_toxicity_logs (
    id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
    cycle_id UUID NOT NULL REFERENCES oncology_chemo_cycles(id) ON DELETE CASCADE,
    tenant_id UUID NOT NULL,
    organ_system TEXT NOT NULL, -- e.g., 'Hematologic', 'Gastrointestinal', 'Neurologic'
    ctcae_grade INTEGER CHECK (ctcae_grade BETWEEN 1 AND 5),
    onset_date DATE,
    resolution_date DATE,
    intervention TEXT,
    created_at TIMESTAMP WITH TIME ZONE DEFAULT CURRENT_TIMESTAMP
);

CREATE TABLE IF NOT EXISTS bmt_registry (
    id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
    patient_id UUID NOT NULL REFERENCES patients(id) ON DELETE CASCADE,
    tenant_id UUID NOT NULL,
    stem_cell_source TEXT CHECK (stem_cell_source IN ('Autologous', 'Allogeneic', 'Haploidentical')),
    conditioning_regimen TEXT,
    infusion_date DATE,
    engraftment_date DATE,
    gvhd_grade INTEGER CHECK (gvhd_grade BETWEEN 0 AND 4),
    created_at TIMESTAMP WITH TIME ZONE DEFAULT CURRENT_TIMESTAMP
);

-- Enable RLS
ALTER TABLE oncology_chemo_cycles ENABLE ROW LEVEL SECURITY;
ALTER TABLE oncology_toxicity_logs ENABLE ROW LEVEL SECURITY;
ALTER TABLE bmt_registry ENABLE ROW LEVEL SECURITY;

CREATE POLICY tenant_isolation_policy ON oncology_chemo_cycles 
    USING (tenant_id = current_setting('app.current_tenant')::uuid);

CREATE POLICY tenant_isolation_policy ON oncology_toxicity_logs 
    USING (tenant_id = current_setting('app.current_tenant')::uuid);

CREATE POLICY tenant_isolation_policy ON bmt_registry 
    USING (tenant_id = current_setting('app.current_tenant')::uuid);
