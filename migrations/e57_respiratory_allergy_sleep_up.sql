-- Migration for Respiratory Allergy & Sleep Medicine
-- Target: namaweb/migrations/e57_respiratory_allergy_sleep_up.sql

CREATE TABLE IF NOT EXISTS respiratory_allergy_tests (
    id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
    patient_id UUID NOT NULL REFERENCES patients(id) ON DELETE CASCADE,
    tenant_id UUID NOT NULL,
    allergen_name TEXT NOT NULL,
    wheal_size_mm DECIMAL(4,2),
    result TEXT CHECK (result IN ('Positive', 'Negative', 'Equivocal')),
    created_at TIMESTAMP WITH TIME ZONE DEFAULT CURRENT_TIMESTAMP
);

CREATE TABLE IF NOT EXISTS respiratory_biologicals (
    id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
    patient_id UUID NOT NULL REFERENCES patients(id) ON DELETE CASCADE,
    tenant_id UUID NOT NULL,
    drug_name TEXT NOT NULL,
    dose TEXT,
    frequency TEXT,
    response_score INTEGER CHECK (response_score BETWEEN 0 AND 10),
    created_at TIMESTAMP WITH TIME ZONE DEFAULT CURRENT_TIMESTAMP
);

CREATE TABLE IF NOT EXISTS respiratory_sleep_psg (
    id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
    patient_id UUID NOT NULL REFERENCES patients(id) ON DELETE CASCADE,
    tenant_id UUID NOT NULL,
    ahi DECIMAL(5,2),
    rdi DECIMAL(5,2),
    lowest_spo2 INTEGER CHECK (lowest_spo2 BETWEEN 0 AND 100),
    sleep_efficiency_percent DECIMAL(5,2),
    created_at TIMESTAMP WITH TIME ZONE DEFAULT CURRENT_TIMESTAMP
);

CREATE TABLE IF NOT EXISTS respiratory_cpap_logs (
    id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
    patient_id UUID NOT NULL REFERENCES patients(id) ON DELETE CASCADE,
    tenant_id UUID NOT NULL,
    usage_hours DECIMAL(4,2),
    leak_rate DECIMAL(5,2),
    pressure_cmh2o DECIMAL(4,1),
    created_at TIMESTAMP WITH TIME ZONE DEFAULT CURRENT_TIMESTAMP
);

-- Enable RLS
ALTER TABLE respiratory_allergy_tests ENABLE ROW LEVEL SECURITY;
ALTER TABLE respiratory_biologicals ENABLE ROW LEVEL SECURITY;
ALTER TABLE respiratory_sleep_psg ENABLE ROW LEVEL SECURITY;
ALTER TABLE respiratory_cpap_logs ENABLE ROW LEVEL SECURITY;

CREATE POLICY tenant_isolation_policy ON respiratory_allergy_tests 
    USING (tenant_id = current_setting('app.current_tenant')::uuid);

CREATE POLICY tenant_isolation_policy ON respiratory_biologicals 
    USING (tenant_id = current_setting('app.current_tenant')::uuid);

CREATE POLICY tenant_isolation_policy ON respiratory_sleep_psg 
    USING (tenant_id = current_setting('app.current_tenant')::uuid);

CREATE POLICY tenant_isolation_policy ON respiratory_cpap_logs 
    USING (tenant_id = current_setting('app.current_tenant')::uuid);
