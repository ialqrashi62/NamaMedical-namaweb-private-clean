-- Migration for Nephrology & Dialysis Specialized Data
-- Target: namaweb/migrations/e60_nephrology_dialysis_up.sql

CREATE TABLE IF NOT EXISTS nephrology_gfr_logs (
    id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
    patient_id UUID NOT NULL REFERENCES patients(id) ON DELETE CASCADE,
    tenant_id UUID NOT NULL,
    creatinine DECIMAL(5,2),
    age INTEGER,
    sex TEXT CHECK (sex IN ('Male', 'Female')),
    calculated_egfr DECIMAL(5,2),
    stage INTEGER CHECK (stage BETWEEN 1 AND 5),
    created_at TIMESTAMP WITH TIME ZONE DEFAULT CURRENT_TIMESTAMP
);

CREATE TABLE IF NOT EXISTS dialysis_sessions (
    id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
    patient_id UUID NOT NULL REFERENCES patients(id) ON DELETE CASCADE,
    tenant_id UUID NOT NULL,
    session_date DATE DEFAULT CURRENT_DATE,
    pre_weight DECIMAL(5,2),
    post_weight DECIMAL(5,2),
    uf_volume DECIMAL(5,2),
    blood_flow_rate INTEGER,
    la_duration_min INTEGER,
    created_at TIMESTAMP WITH TIME ZONE DEFAULT CURRENT_TIMESTAMP
);

CREATE TABLE IF NOT EXISTS renal_transplant_logs (
    id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
    patient_id UUID NOT NULL REFERENCES patients(id) ON DELETE CASCADE,
    tenant_id UUID NOT NULL,
    donor_type TEXT CHECK (donor_type IN ('Living', 'Deceased')),
    transplant_date DATE,
    immunosuppressant_regimen TEXT,
    created_at TIMESTAMP WITH TIME ZONE DEFAULT CURRENT_TIMESTAMP
);

-- Enable RLS
ALTER TABLE nephrology_gfr_logs ENABLE ROW LEVEL SECURITY;
ALTER TABLE dialysis_sessions ENABLE ROW LEVEL SECURITY;
ALTER TABLE renal_transplant_logs ENABLE ROW LEVEL SECURITY;

CREATE POLICY tenant_isolation_policy ON nephrology_gfr_logs 
    USING (tenant_id = current_setting('app.current_tenant')::uuid);

CREATE POLICY tenant_isolation_policy ON dialysis_sessions 
    USING (tenant_id = current_setting('app.current_tenant')::uuid);

CREATE POLICY tenant_isolation_policy ON renal_transplant_logs 
    USING (tenant_id = current_setting('app.current_tenant')::uuid);
