-- Migration: e72_urology_up.sql
-- Purpose: Implement specialized tables for Urology

BEGIN;

-- 1. Urology Surgical Logs
CREATE TABLE IF NOT EXISTS urology_surgical_logs (
    id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
    tenant_id UUID NOT NULL,
    patient_id UUID NOT NULL,
    surgeon_id UUID NOT NULL,
    operation_date TIMESTAMP WITH TIME ZONE DEFAULT CURRENT_TIMESTAMP,
    procedure_type VARCHAR(100), -- e.g., Robotic Prostatectomy, TURBT, PCNL
    approach VARCHAR(100), -- e.g., Laparoscopic, Endoscopic, Open
    duration_minutes INTEGER,
    blood_loss_ml INTEGER,
    complications TEXT,
    created_at TIMESTAMP WITH TIME ZONE DEFAULT CURRENT_TIMESTAMP,
    updated_at TIMESTAMP WITH TIME ZONE DEFAULT CURRENT_TIMESTAMP
);

-- 2. Urology Stone Registry
CREATE TABLE IF NOT EXISTS urology_stone_registry (
    id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
    tenant_id UUID NOT NULL,
    patient_id UUID NOT NULL,
    procedure_id UUID REFERENCES urology_surgical_logs(id),
    stone_location VARCHAR(100), -- e.g., Upper Pole Left Kidney
    stone_size_mm FLOAT,
    stone_composition VARCHAR(50), -- e.g., Calcium Oxalate, Uric Acid
    fragmentation_success BOOLEAN,
    created_at TIMESTAMP WITH TIME ZONE DEFAULT CURRENT_TIMESTAMP
);

-- 3. Urology Oncology Metrics
CREATE TABLE IF NOT EXISTS urology_oncology_metrics (
    id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
    tenant_id UUID NOT NULL,
    patient_id UUID NOT NULL,
    log_time TIMESTAMP WITH TIME ZONE DEFAULT CURRENT_TIMESTAMP,
    psa_level FLOAT, -- ng/mL
    gleason_score VARCHAR(10), -- e.g., 3+4=7
    tumor_grade VARCHAR(20),
    treatment_response VARCHAR(50),
    created_at TIMESTAMP WITH TIME ZONE DEFAULT CURRENT_TIMESTAMP
);

-- Enable RLS
ALTER TABLE urology_surgical_logs ENABLE ROW LEVEL SECURITY;
ALTER TABLE urology_stone_registry ENABLE ROW LEVEL SECURITY;
ALTER TABLE urology_oncology_metrics ENABLE ROW LEVEL SECURITY;

-- RLS Policies
CREATE POLICY urology_surgical_logs_tenant_policy ON urology_surgical_logs 
    USING (tenant_id = current_setting('app.current_tenant_id')::uuid);

CREATE POLICY urology_stone_registry_tenant_policy ON urology_stone_registry 
    USING (tenant_id = current_setting('app.current_tenant_id')::uuid);

CREATE POLICY urology_oncology_metrics_tenant_policy ON urology_oncology_metrics 
    USING (tenant_id = current_setting('app.current_tenant_id')::uuid);

COMMIT;
