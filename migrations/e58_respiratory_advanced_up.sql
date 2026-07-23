-- Migration for Respiratory Care, Bronchoscopy, and Home Oxygen
-- Target: namaweb/migrations/e58_respiratory_advanced_up.sql

CREATE TABLE IF NOT EXISTS respiratory_vent_logs (
    id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
    patient_id UUID NOT NULL REFERENCES patients(id) ON DELETE CASCADE,
    tenant_id UUID NOT NULL,
    mode TEXT, -- e.g., 'AC', 'SIMV', 'PSV'
    peep DECIMAL(4,1),
    fio2 DECIMAL(4,2),
    tidal_volume INTEGER,
    respiratory_rate INTEGER,
    created_at TIMESTAMP WITH TIME ZONE DEFAULT CURRENT_TIMESTAMP
);

CREATE TABLE IF NOT EXISTS respiratory_abg_logs (
    id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
    patient_id UUID NOT NULL REFERENCES patients(id) ON DELETE CASCADE,
    tenant_id UUID NOT NULL,
    ph DECIMAL(4,3),
    po2 DECIMAL(5,2),
    pco2 DECIMAL(5,2),
    hco3 DECIMAL(5,2),
    spo2 INTEGER,
    created_at TIMESTAMP WITH TIME ZONE DEFAULT CURRENT_TIMESTAMP
);

CREATE TABLE IF NOT EXISTS respiratory_bronchoscopy_logs (
    id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
    patient_id UUID NOT NULL REFERENCES patients(id) ON DELETE CASCADE,
    tenant_id UUID NOT NULL,
    procedure_type TEXT CHECK (procedure_type IN ('Diagnostic', 'Therapeutic')),
    sedation_type TEXT,
    duration_min INTEGER,
    created_at TIMESTAMP WITH TIME ZONE DEFAULT CURRENT_TIMESTAMP
);

CREATE TABLE IF NOT EXISTS respiratory_biopsy_samples (
    id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
    procedure_id UUID NOT NULL REFERENCES respiratory_bronchoscopy_logs(id) ON DELETE CASCADE,
    tenant_id UUID NOT NULL,
    site_location TEXT,
    sample_type TEXT, -- e.g., 'BAL', 'Forceps'
    created_at TIMESTAMP WITH TIME ZONE DEFAULT CURRENT_TIMESTAMP
);

CREATE TABLE IF NOT EXISTS respiratory_home_ox_setup (
    id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
    patient_id UUID NOT NULL REFERENCES patients(id) ON DELETE CASCADE,
    tenant_id UUID NOT NULL,
    device_type TEXT CHECK (device_type IN ('Concentrator', 'Cylinder')),
    initial_flow_rate DECIMAL(4,1),
    start_date DATE,
    created_at TIMESTAMP WITH TIME ZONE DEFAULT CURRENT_TIMESTAMP
);

CREATE TABLE IF NOT la_respiratory_home_ox_logs (
    id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
    setup_id UUID NOT NULL REFERENCES respiratory_home_ox_setup(id) ON DELETE CASCADE,
    tenant_id UUID NOT NULL,
    spo2_level INTEGER,
    current_flow_rate DECIMAL(4,1),
    compliance_hours DECIMAL(4,2),
    created_at TIMESTAMP WITH TIME ZONE DEFAULT CURRENT_TIMESTAMP
);

-- Enable RLS
ALTER TABLE respiratory_vent_logs ENABLE ROW LEVEL SECURITY;
ALTER TABLE respiratory_abg_logs ENABLE ROW LEVEL SECURITY;
ALTER TABLE respiratory_bronchoscopy_logs ENABLE ROW LEVEL SECURITY;
ALTER TABLE respiratory_biopsy_samples ENABLE ROW LEVEL SECURITY;
ALTER TABLE respiratory_home_ox_setup ENABLE ROW LEVEL SECURITY;
ALTER TABLE la_respiratory_home_ox_logs ENABLE ROW LEVEL SECURITY;

CREATE POLICY tenant_isolation_policy ON respiratory_vent_logs USING (tenant_id = current_setting('app.current_tenant')::uuid);
CREATE POLICY tenant_isolation_policy ON respiratory_abg_logs USING (tenant_id = current_setting('app.current_tenant')::uuid);
CREATE POLICY tenant_isolation_policy ON respiratory_bronchoscopy_logs USING (tenant_id = current_setting('app.current_tenant')::uuid);
CREATE POLICY tenant_isolation_policy ON respiratory_biopsy_samples USING (tenant_id = current_setting('app.current_tenant')::uuid);
CREATE POLICY tenant_isolation_policy ON respiratory_home_ox_setup USING (tenant_id = current_setting('app.current_tenant')::uuid);
CREATE POLICY tenant_isolation_policy ON la_respiratory_home_ox_logs USING (tenant_id = current_setting('app.current_tenant')::uuid);
