-- Migration: e75_pediatrics_nicu_up.sql
-- Purpose: Implement specialized tables for Pediatrics & NICU (Level III/IV)

BEGIN;

-- 1. Pediatric Growth & Biometry Logs
CREATE TABLE IF NOT EXISTS peds_growth_logs (
    id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
    tenant_id UUID NOT NULL,
    patient_id UUID NOT NULL,
    log_date TIMESTAMP WITH TIME ZONE DEFAULT CURRENT_TIMESTAMP,
    weight_kg FLOAT,
    length_cm FLOAT,
    head_circ_cm FLOAT,
    bmi FLOAT,
    weight_zscore FLOAT,
    length_zscore FLOAT,
    head_zscore FLOAT,
    created_at TIMESTAMP WITH TIME ZONE DEFAULT CURRENT_TIMESTAMP
);

-- 2. NICU Ventilation & Respiratory Logs
CREATE TABLE IF NOT EXISTS nicu_ventilation_logs (
    id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
    tenant_id UUID NOT NULL,
    patient_id UUID NOT NULL,
    log_time TIMESTAMP WITH TIME ZONE DEFAULT CURRENT_TIMESTAMP,
    vent_mode VARCHAR(50), -- e.g., HFOV, Conventional, CPAP
    fio2_percent FLOAT,
    peep_cmh2o FLOAT,
    mean_airway_pressure_cmh2o FLOAT,
    tidal_volume_ml FLOAT,
    respiratory_rate_bpm INTEGER,
    spo2_percent FLOAT,
    created_at TIMESTAMP WITH TIME ZONE DEFAULT CURRENT_TIMESTAMP
);

-- 3. Pediatric Developmental Milestone Tracking
CREATE TABLE IF NOT EXISTS peds_milestone_tracking (
    id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
    tenant_id UUID NOT NULL,
    patient_id UUID NOT NULL,
    milestone_category VARCHAR(50), -- e.g., Motor, Language, Social
    milestone_name VARCHAR(100), -- e.g., Sits without support, First words
    status VARCHAR(20), -- Achieved, Delayed, Not Yet
    achievement_date DATE,
    notes TEXT,
    created_at TIMESTAMP WITH TIME ZONE DEFAULT CURRENT_TIMESTAMP
);

-- 4. Neonatal Transition & Stabilization Logs
CREATE TABLE IF NOT EXISTS neonatal_transition_logs (
    id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
    tenant_id UUID NOT NULL,
    patient_id UUID NOT NULL,
    birth_time TIMESTAMP WITH TIME ZONE DEFAULT CURRENT_TIMESTAMP,
    apgar_1min INTEGER,
    apgar_5min INTEGER,
    apgar_10min INTEGER,
    initial_stabilization_notes TEXT,
    surfactant_administered BOOLEAN DEFAULT FALSE,
    surfactant_type VARCHAR(100),
    created_at TIMESTAMP WITH TIME ZONE DEFAULT CURRENT_TIMESTAMP
);

-- Enable RLS
ALTER TABLE peds_growth_logs ENABLE ROW LEVEL SECURITY;
ALTER TABLE nicu_ventilation_logs ENABLE ROW LEVEL SECURITY;
ALTER TABLE peds_milestone_tracking ENABLE ROW LEVEL SECURITY;
ALTER TABLE neonatal_transition_logs ENABLE ROW LEVEL SECURITY;

-- RLS Policies
CREATE POLICY peds_growth_logs_tenant_policy ON peds_growth_logs 
    USING (tenant_id = current_setting('app.current_tenant_id')::uuid);

CREATE POLICY nicu_ventilation_logs_tenant_policy ON nicu_ventilation_logs 
    USING (tenant_id = current_setting('app.current_tenant_id')::uuid);

CREATE POLICY peds_milestone_tracking_tenant_policy ON peds_milestone_tracking 
    USING (tenant_id = current_setting('app.current_tenant_id')::uuid);

CREATE POLICY neonatal_transition_logs_tenant_policy ON neonatal_transition_logs 
    USING (tenant_id = current_setting('app.current_tenant_id')::uuid);

COMMIT;
