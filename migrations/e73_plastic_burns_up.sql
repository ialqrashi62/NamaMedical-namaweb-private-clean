-- Migration: e73_plastic_burns_up.sql
-- Purpose: Implement specialized tables for Plastic & Burns Surgery

BEGIN;

-- 1. Plastic & Burns Surgical Logs
CREATE TABLE IF NOT EXISTS plastic_burns_surgical_logs (
    id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
    tenant_id UUID NOT NULL,
    patient_id UUID NOT NULL,
    surgeon_id UUID NOT NULL,
    operation_date TIMESTAMP WITH TIME ZONE DEFAULT CURRENT_TIMESTAMP,
    procedure_type VARCHAR(100), -- e.g., Free Flap Transfer, Skin Graft, Rhinoplasty
    approach VARCHAR(100), 
    duration_minutes INTEGER,
    blood_loss_ml INTEGER,
    complications TEXT,
    created_at TIMESTAMP WITH TIME ZONE DEFAULT CURRENT_TIMESTAMP,
    updated_at TIMESTAMP WITH TIME ZONE DEFAULT CURRENT_TIMESTAMP
);

-- 2. Burn Resuscitation & TBSA Logs
CREATE TABLE IF NOT EXISTS burn_resuscitation_logs (
    id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
    tenant_id UUID NOT NULL,
    patient_id UUID NOT NULL,
    log_time TIMESTAMP WITH TIME ZONE DEFAULT CURRENT_TIMESTAMP,
    tbsa_percent FLOAT, -- Total Body Surface Area
    fluid_volume_ml FLOAT, -- Total fluid administered
    fluid_type VARCHAR(50), -- e.g., Ringer's Lactate
    urine_output_ml_hr FLOAT,
    created_at TIMESTAMP WITH TIME ZONE DEFAULT CURRENT_TIMESTAMP
);

-- 3. Flap & Graft Monitoring Metrics
CREATE TABLE IF NOT EXISTS flap_monitoring_metrics (
    id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
    tenant_id UUID NOT NULL,
    patient_id UUID NOT NULL,
    procedure_id UUID REFERENCES plastic_burns_surgical_logs(id),
    log_time TIMESTAMP WITH TIME ZONE DEFAULT CURRENT_TIMESTAMP,
    perfusion_status VARCHAR(50), -- e.g., Brisk, Sluggish, Absent
    capillary_refill_sec FLOAT,
    color_status VARCHAR(50), -- e.g., Pink, Pale, Cyanotic
    temperature_c FLOAT,
    created_at TIMESTAMP WITH TIME ZONE DEFAULT CURRENT_TIMESTAMP
);

-- Enable RLS
ALTER TABLE plastic_burns_surgical_logs ENABLE ROW LEVEL SECURITY;
ALTER TABLE burn_resuscitation_logs ENABLE ROW LEVEL SECURITY;
ALTER TABLE flap_monitoring_metrics ENABLE ROW LEVEL SECURITY;

-- RLS Policies
CREATE POLICY plastic_burns_surgical_logs_tenant_policy ON plastic_burns_surgical_logs 
    USING (tenant_id = current_setting('app.current_tenant_id')::uuid);

CREATE POLICY burn_resuscitation_logs_tenant_policy ON burn_resuscitation_logs 
    USING (tenant_id = current_setting('app.current_tenant_id')::uuid);

CREATE POLICY flap_monitoring_metrics_tenant_policy ON flap_monitoring_metrics 
    USING (tenant_id = current_setting('app.current_tenant_id')::uuid);

COMMIT;
