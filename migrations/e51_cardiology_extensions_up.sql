-- Migration: e50_cardiology_extensions_up.sql
-- Description: Adds specialized tables for Interventional, EP, and Nuclear Cardiology.
-- Compliance: PDPL / RLS Enabled

BEGIN;

-- 1. Interventional Cardiology (Cath Lab)
CREATE TABLE IF NOT EXISTS cardiology_procedures (
    id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
    tenant_id UUID NOT NULL,
    patient_id UUID NOT NULL,
    procedure_date TIMESTAMP WITH TIME ZONE DEFAULT CURRENT_TIMESTAMP,
    operator_id UUID NOT NULL,
    procedure_type VARCHAR(100), -- e.g., PCI, TAVI, Angiography
    d2b_time_minutes INTEGER,     -- Door-to-Balloon time for STEMI
    contrast_volume_ml INTEGER,
    vessel_target VARCHAR(255),
    stenosis_percentage INTEGER,
    stent_type VARCHAR(100),
    outcome VARCHAR(255),
    notes TEXT,
    created_at TIMESTAMP WITH TIME ZONE DEFAULT CURRENT_TIMESTAMP,
    updated_at TIMESTAMP WITH TIME ZONE DEFAULT CURRENT_TIMESTAMP,
    CONSTRAINT fk_tenant FOREIGN KEY (tenant_id) REFERENCES tenants(id) ON DELETE CASCADE,
    CONSTRAINT fk_patient FOREIGN KEY (patient_id) REFERENCES patients(id) ON DELETE CASCADE
);

-- 2. Electrophysiology (EP) Mapping
CREATE TABLE IF NOT EXISTS ep_mapping_data (
    id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
    tenant_id UUID NOT NULL,
    procedure_id UUID NOT NULL,
    electrode_site VARCHAR(100),
    voltage_mv FLOAT,
    timing_ms INTEGER,
    ablation_energy_joules FLOAT,
    is_successful BOOLEAN DEFAULT FALSE,
    created_at TIMESTAMP WITH TIME ZONE DEFAULT CURRENT_TIMESTAMP,
    CONSTRAINT fk_tenant_ep FOREIGN KEY (tenant_id) REFERENCES tenants(id) ON DELETE CASCADE,
    CONSTRAINT fk_proc_ep FOREIGN KEY (procedure_id) REFERENCES cardiology_procedures(id) ON DELETE CASCADE
);

-- 3. Nuclear Cardiology Results
CREATE TABLE IF NOT EXISTS nuclear_imaging_results (
    id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
    tenant_id UUID NOT NULL,
    patient_id UUID NOT NULL,
    isotope_used VARCHAR(100),
    perfusion_score INTEGER,
    ejection_fraction_pct INTEGER,
    is_reversible_ischemia BOOLEAN,
    imaging_report_path TEXT, -- Path to phi_vault/
    created_at TIMESTAMP WITH TIME ZONE DEFAULT CURRENT_TIMESTAMP,
    CONSTRAINT fk_tenant_nuc FOREIGN KEY (tenant_id) REFERENCES tenants(id) ON DELETE CASCADE,
    CONSTRAINT fk_patient_nuc FOREIGN KEY (patient_id) REFERENCES patients(id) ON DELETE CASCADE
);

-- Enable Row Level Security (RLS)
ALTER TABLE cardiology_procedures ENABLE ROW LEVEL SECURITY;
ALTER TABLE ep_mapping_data ENABLE ROW LEVEL SECURITY;
ALTER TABLE nuclear_imaging_results ENABLE ROW LEVEL SECURITY;

-- Create RLS Policies (Golden Access Rule: Tenant Isolation)
CREATE POLICY tenant_isolation_policy ON cardiology_procedures 
    USING (tenant_id = current_setting('app.current_tenant')::UUID);

CREATE POLICY tenant_isolation_policy ON ep_mapping_data 
    USING (tenant_id = current_setting('app.current_tenant')::UUID);

CREATE POLICY tenant_isolation_policy ON nuclear_imaging_results 
    USING (tenant_id = current_setting('app.current_tenant')::UUID);

COMMIT;
