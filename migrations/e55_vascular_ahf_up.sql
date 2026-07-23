-- Migration for Peripheral Vascular & Advanced Heart Failure
-- Target: namaweb/migrations/e55_vascular_ahf_up.sql

CREATE TABLE IF NOT EXISTS vascular_abi_logs (
    id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
    patient_id UUID NOT NULL REFERENCES patients(id) ON DELETE CASCADE,
    tenant_id UUID NOT NULL,
    left_ankle_sys DECIMAL(5,2),
    right_ankle_sys DECIMAL(5,2),
    left_arm_sys DECIMAL(5,2),
    right_arm_sys DECIMAL(5,2),
    calculated_abi_l DECIMAL(4,2),
    calculated_abi_r DECIMAL(4,2),
    rutherford_class INTEGER CHECK (rutherford_class BETWEEN 0 AND 6),
    created_at TIMESTAMP WITH TIME ZONE DEFAULT CURRENT_TIMESTAMP
);

CREATE TABLE IF NOT EXISTS ahf_monitoring (
    id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
    patient_id UUID NOT NULL REFERENCES patients(id) ON DELETE CASCADE,
    tenant_id UUID NOT NULL,
    bnp_level DECIMAL(10,2),
    weight_kg DECIMAL(5,2),
    nyha_class INTEGER CHECK (nyha_class BETWEEN 1 AND 4),
    lvef_percent DECIMAL(5,2),
    fluid_balance_liters DECIMAL(5,2),
    created_at TIMESTAMP WITH TIME ZONE DEFAULT CURRENT_TIMESTAMP
);

CREATE TABLE IF NOT EXISTS vad_registry (
    id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
    patient_id UUID NOT NULL REFERENCES patients(id) ON DELETE CASCADE,
    tenant_id UUID NOT NULL,
    device_model TEXT,
    flow_rate DECIMAL(5,2),
    speed_rpm INTEGER,
    power_watts DECIMAL(5,2),
    created_at TIMESTAMP WITH TIME ZONE DEFAULT CURRENT_TIMESTAMP
);

-- Enable RLS
ALTER TABLE vascular_abi_logs ENABLE ROW LEVEL SECURITY;
ALTER TABLE ahf_monitoring ENABLE ROW LEVEL SECURITY;
ALTER TABLE vad_registry ENABLE ROW LEVEL SECURITY;

CREATE POLICY tenant_isolation_policy ON vascular_abi_logs 
    USING (tenant_id = current_setting('app.current_tenant')::uuid);

CREATE POLICY tenant_isolation_policy ON ahf_monitoring 
    USING (tenant_id = current_setting('app.current_tenant')::uuid);

CREATE POLICY tenant_isolation_policy ON vad_registry 
    USING (tenant_id = current_setting('app.current_tenant')::uuid);
