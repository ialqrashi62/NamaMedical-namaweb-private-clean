-- Migration for Electrophysiology (EP) Specialized Data
-- Target: namaweb/migrations/e52_ep_specialized_up.sql

CREATE TABLE IF NOT EXISTS ep_ablation_logs (
    id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
    procedure_id UUID NOT NULL, -- Linked to cath_lab_procedures or general encounter
    tenant_id UUID NOT NULL,
    site_name TEXT NOT NULL, -- e.g., 'Pulmonary Vein', 'AV Node'
    energy_joules DECIMAL(5,2),
    duration_sec DECIMAL(5,2),
    modality TEXT CHECK (modality IN ('RF', 'Cryo', 'Laser')),
    success_indicator BOOLEAN DEFAULT FALSE,
    created_at TIMESTAMP WITH TIME ZONE DEFAULT CURRENT_TIMESTAMP
);

CREATE TABLE IF NOT EXISTS ep_device_registry (
    id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
    patient_id UUID NOT NULL REFERENCES patients(id) ON DELETE CASCADE,
    tenant_id UUID NOT NULL,
    device_type TEXT CHECK (device_type IN ('Pacemaker', 'ICD', 'CRT', 'Other')),
    model TEXT,
    lead_position TEXT,
    sensitivity DECIMAL(5,2),
    output_voltage DECIMAL(5,2),
    implantation_date DATE,
    created_at TIMESTAMP WITH TIME ZONE DEFAULT CURRENT_TIMESTAMP
);

-- Enable RLS
ALTER TABLE ep_ablation_logs ENABLE ROW LEVEL SECURITY;
ALTER TABLE ep_device_registry ENABLE ROW LEVEL SECURITY;

CREATE POLICY tenant_isolation_policy ON ep_ablation_logs 
    USING (tenant_id = current_setting('app.current_tenant')::uuid);

CREATE POLICY tenant_isolation_policy ON ep_device_registry 
    USING (tenant_id = current_setting('app.current_tenant')::uuid);
