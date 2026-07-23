-- Migration: e78_critical_care_up.sql
-- Purpose: Implement specialized tables for Critical Care & Emergency (Wave 5)

BEGIN;

-- 1. Hemodynamic Monitoring Logs
CREATE TABLE IF NOT EXISTS crit_care_hemodynamics (
    id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
    tenant_id UUID NOT NULL,
    patient_id UUID NOT NULL,
    log_time TIMESTAMP WITH TIME ZONE DEFAULT CURRENT_TIMESTAMP,
    map_value FLOAT, -- Mean Arterial Pressure (mmHg)
    cvp_value FLOAT, -- Central Venous Pressure (mmHg)
    cardiac_output FLOAT, -- L/min
    stroke_volume FLOAT,
    heart_rate INTEGER,
    created_at TIMESTAMP WITH TIME ZONE DEFAULT CURRENT_TIMESTAMP
);

-- 2. Advanced Ventilation & Weaning Logs
CREATE TABLE IF NOT EXISTS crit_care_ventilation_logs (
    id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
    tenant_id UUID NOT NULL,
    patient_id UUID NOT NULL,
    log_time TIMESTAMP WITH TIME ZONE DEFAULT CURRENT_TIMESTAMP,
    vent_mode VARCHAR(50), -- e.g., PRVC, APRV, SIMV
    rsbi_value FLOAT, -- Rapid Shallow Breathing Index
    weaning_status VARCHAR(50), -- e.g., Ready, Failed, In-Progress
    fio2_percent FLOAT,
    peep_cmh2o FLOAT,
    created_at TIMESTAMP WITH TIME ZONE DEFAULT CURRENT_TIMESTAMP
);

-- 3. Sepsis Bundle Compliance Tracking
CREATE TABLE IF NOT EXISTS sepsis_bundle_tracking (
    id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
    tenant_id UUID NOT NULL,
    patient_id UUID NOT NULL,
    bundle_start_time TIMESTAMP WITH TIME ZONE DEFAULT CURRENT_TIMESTAMP,
    lactate_initial FLOAT,
    lactate_followup FLOAT,
    antibiotics_administered BOOLEAN DEFAULT FALSE,
    fluid_resuscitation_ml INTEGER,
    bundle_compliance_status VARCHAR(50), -- e.g., Fully Compliant, Partial
    created_at TIMESTAMP WITH TIME ZONE DEFAULT CURRENT_TIMESTAMP
);

-- 4. Shock Titration & Vasopressor Logs
CREATE TABLE IF NOT EXISTS shock_titration_logs (
    id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
    tenant_id UUID NOT NULL,
    patient_id UUID NOT NULL,
    log_time TIMESTAMP WITH TIME ZONE DEFAULT CURRENT_TIMESTAMP,
    drug_name VARCHAR(100), -- e.g., Norepinephrine, Epinephrine, Dobutamine
    dose_mcg_kg_min FLOAT,
    response_map_value FLOAT,
    titration_action VARCHAR(50), -- e.g., Increased, Decreased, Maintained
    created_at TIMESTAMP WITH TIME ZONE DEFAULT CURRENT_TIMESTAMP
);

-- Enable RLS
ALTER TABLE crit_care_hemodynamics ENABLE ROW LEVEL SECURITY;
ALTER TABLE crit_care_ventilation_logs ENABLE ROW LEVEL SECURITY;
ALTER TABLE sepsis_bundle_tracking ENABLE ROW LEVEL SECURITY;
ALTER TABLE shock_titration_logs ENABLE ROW LEVEL SECURITY;

-- RLS Policies
CREATE POLICY crit_care_hemodynamics_tenant_policy ON crit_care_hemodynamics 
    USING (tenant_id = current_setting('app.current_tenant_id')::uuid);

CREATE POLICY crit_care_ventilation_logs_tenant_policy ON crit_care_ventilation_logs 
    USING (tenant_id = current_setting('app.current_tenant_id')::uuid);

CREATE POLICY sepsis_bundle_tracking_tenant_policy ON sepsis_bundle_tracking 
    USING (tenant_id = current_setting('app.current_tenant_id')::uuid);

CREATE POLICY shock_titration_logs_tenant_policy ON shock_titration_logs 
    USING (tenant_id = current_setting('app.current_tenant_id')::uuid);

COMMIT;
