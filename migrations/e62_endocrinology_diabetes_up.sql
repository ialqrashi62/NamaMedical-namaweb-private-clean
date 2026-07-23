-- Migration for Endocrinology & Diabetes Specialized Data
-- Target: namaweb/migrations/e62_endocrinology_diabetes_up.sql

CREATE TABLE IF NOT EXISTS endocrine_glucose_logs (
    id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
    patient_id UUID NOT NULL REFERENCES patients(id) ON DELETE CASCADE,
    tenant_id UUID NOT NULL,
    value DECIMAL(5,2),
    timestamp TIMESTAMP WITH TIME ZONE DEFAULT CURRENT_TIMESTAMP,
    context TEXT CHECK (context IN ('Fasting', 'Post-prandial', 'Bedtime', 'Random')),
    insulin_dose DECIMAL(5,2),
    created_at TIMESTAMP WITH TIME ZONE DEFAULT CURRENT_TIMESTAMP
);

CREATE TABLE IF NOT EXISTS diabetes_complications (
    id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
    patient_id UUID NOT NULL REFERENCES patients(id) ON DELETE CASCADE,
    tenant_id UUID NOT NULL,
    complication_type TEXT CHECK (complication_type IN ('Retinopathy', 'Nephropathy', 'Neuropathy', 'Foot Ulcer')),
    severity_grade INTEGER CHECK (severity_grade BETWEEN 0 AND 4),
    last_screening_date DATE,
    notes TEXT,
    created_at TIMESTAMP WITH TIME ZONE DEFAULT CURRENT_TIMESTAMP
);

CREATE TABLE IF NOT EXISTS endocrine_thyroid_logs (
    id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
    patient_id UUID NOT NULL REFERENCES patients(id) ON DELETE CASCADE,
    tenant_id UUID NOT NULL,
    tsh DECIMAL(5,2),
    t3 DECIMAL(5,2),
    t4 DECIMAL(5,2),
    thyroid_volume DECIMAL(5,2),
    nodule_size DECIMAL(5,2),
    created_at TIMESTAMP WITH TIME ZONE DEFAULT CURRENT_TIMESTAMP
);

-- Enable RLS
ALTER TABLE endocrine_glucose_logs ENABLE ROW LEVEL SECURITY;
ALTER TABLE diabetes_complications ENABLE ROW LEVEL SECURITY;
ALTER TABLE endocrine_thyroid_logs ENABLE ROW LEVEL SECURITY;

CREATE POLICY tenant_isolation_policy ON endocrine_glucose_logs 
    USING (tenant_id = current_setting('app.current_tenant')::uuid);

CREATE POLICY tenant_isolation_policy ON diabetes_complications 
    USING (tenant_id = current_setting('app.current_tenant')::uuid);

CREATE POLICY tenant_isolation_policy ON endocrine_thyroid_logs 
    USING (tenant_id = current_setting('app.current_tenant')::uuid);
