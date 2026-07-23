-- Migration for Pulmonology & Respiratory Specialized Data
-- Target: namaweb/migrations/e56_respiratory_specialized_up.sql

CREATE TABLE IF NOT EXISTS respiratory_pft_logs (
    id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
    patient_id UUID NOT NULL REFERENCES patients(id) ON DELETE CASCADE,
    tenant_id UUID NOT NULL,
    encounter_id UUID NOT NULL,
    fev1_predicted DECIMAL(5,2),
    fev1_actual DECIMAL(5,2),
    fvc_predicted DECIMAL(5,2),
    fvc_actual DECIMAL(5,2),
    ratio DECIMAL(4,2),
    dlco_percent DECIMAL(5,2),
    gold_stage INTEGER CHECK (gold_stage BETWEEN 1 AND 4),
    created_at TIMESTAMP WITH TIME ZONE DEFAULT CURRENT_TIMESTAMP
);

CREATE TABLE IF NOT EXISTS respiratory_oxygen_logs (
    id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
    patient_id UUID NOT NULL REFERENCES patients(id) ON DELETE CASCADE,
    tenant_id UUID NOT NULL,
    spo2_level INTEGER CHECK (spo2_level BETWEEN 0 AND 100),
    oxygen_flow_rate DECIMAL(4,1),
    delivery_method TEXT CHECK (delivery_method IN ('Nasal Cannula', 'Venturi Mask', 'BIPAP', 'CPAP', 'Intubated')),
    created_at TIMESTAMP WITH TIME ZONE DEFAULT CURRENT_TIMESTAMP
);

-- Enable RLS
ALTER TABLE respiratory_pft_logs ENABLE ROW LEVEL SECURITY;
ALTER TABLE respiratory_oxygen_logs ENABLE ROW LEVEL SECURITY;

CREATE POLICY tenant_isolation_policy ON respiratory_pft_logs 
    USING (tenant_id = current_setting('app.current_tenant')::uuid);

CREATE POLICY tenant_isolation_policy ON respiratory_oxygen_logs 
    USING (tenant_id = current_setting('app.current_tenant')::uuid);
