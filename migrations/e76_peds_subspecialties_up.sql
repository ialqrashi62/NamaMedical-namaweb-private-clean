-- Migration: e76_peds_subspecialties_up.sql
-- Purpose: Implement specialized tables for Pediatric Subspecialties (Cardio, Nephro, Neuro)

BEGIN;

-- 1. Pediatric Cardiology Logs
CREATE TABLE IF NOT EXISTS peds_cardio_logs (
    id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
    tenant_id UUID NOT NULL,
    patient_id UUID NOT NULL,
    log_date TIMESTAMP WITH TIME ZONE DEFAULT CURRENT_TIMESTAMP,
    chd_diagnosis VARCHAR(100), -- Congenital Heart Disease
    aortic_zscore FLOAT,
    pulmonary_zscore FLOAT,
    ef_percent FLOAT,
    echo_findings TEXT,
    created_at TIMESTAMP WITH TIME ZONE DEFAULT CURRENT_TIMESTAMP
);

-- 2. Pediatric Nephrology Logs
CREATE TABLE IF NOT EXISTS peds_nephro_logs (
    id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
    tenant_id UUID NOT NULL,
    patient_id UUID NOT NULL,
    log_date TIMESTAMP WITH TIME ZONE DEFAULT CURRENT_TIMESTAMP,
    gfr_calculated FLOAT, -- Schwartz formula
    proteinuria_grade VARCHAR(20),
    dialysis_type VARCHAR(50), -- Peritoneal, Hemodialysis
    dialysis_frequency_per_week INTEGER,
    created_at TIMESTAMP WITH TIME ZONE DEFAULT CURRENT_TIMESTAMP
);

-- 3. Pediatric Neurology Logs
CREATE TABLE IF NOT EXISTS peds_neuro_logs (
    id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
    tenant_id UUID NOT NULL,
    patient_id UUID NOT NULL,
    log_date TIMESTAMP WITH TIME ZONE DEFAULT CURRENT_TIMESTAMP,
    seizure_type VARCHAR(100),
    seizure_frequency_per_day INTEGER,
    bayley_iii_score FLOAT, -- Developmental scale
    mri_findings TEXT,
    created_at TIMESTAMP WITH TIME ZONE DEFAULT CURRENT_TIMESTAMP
);

-- Enable RLS
ALTER TABLE peds_cardio_logs ENABLE ROW LEVEL SECURITY;
ALTER TABLE peds_nephro_logs ENABLE ROW LEVEL SECURITY;
ALTER TABLE peds_neuro_logs ENABLE ROW LEVEL SECURITY;

-- RLS Policies
CREATE POLICY peds_cardio_logs_tenant_policy ON peds_cardio_logs 
    USING (tenant_id = current_setting('app.current_tenant_id')::uuid);

CREATE POLICY peds_nephro_logs_tenant_policy ON peds_nephro_logs 
    USING (tenant_id = current_setting('app.current_tenant_id')::uuid);

CREATE POLICY peds_neuro_logs_tenant_policy ON peds_neuro_logs 
    USING (tenant_id = current_setting('app.current_tenant_id')::uuid);

COMMIT;
