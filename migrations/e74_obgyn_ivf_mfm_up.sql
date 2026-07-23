-- Migration: e74_obgyn_ivf_mfm_up.sql
-- Purpose: Implement specialized tables for OBGYN (IVF, MFM, and Delivery)

BEGIN;

-- 1. IVF/ICSI Lab Logs (Embryo Tracking)
CREATE TABLE IF NOT EXISTS obgyn_ivf_lab_logs (
    id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
    tenant_id UUID NOT NULL,
    patient_id UUID NOT NULL,
    cycle_id VARCHAR(100), -- Unique identifier for the IVF cycle
    log_date TIMESTAMP WITH TIME ZONE DEFAULT CURRENT_TIMESTAMP,
    oocyte_count INTEGER,
    fertilization_rate FLOAT,
    embryo_grade VARCHAR(20), -- e.g., 4AA, 3BB (Gardner Scale)
    embryo_stage VARCHAR(50), -- e.g., Cleavage, Blastocyst
    transfer_date TIMESTAMP WITH TIME ZONE,
    cryopreservation_count INTEGER,
    created_at TIMESTAMP WITH TIME ZONE DEFAULT CURRENT_TIMESTAMP
);

-- 2. Maternal-Fetal Medicine (MFM) Metrics
CREATE TABLE IF NOT EXISTS maternal_fetal_metrics (
    id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
    tenant_id UUID NOT NULL,
    patient_id UUID NOT NULL,
    gestational_age_weeks FLOAT,
    bpd_mm FLOAT, -- Biparietal Diameter
    hc_mm FLOAT, -- Head Circumference
    ac_mm FLOAT, -- Abdominal Circumference
    fl_mm FLOAT, -- Femur Length
    estimated_fetal_weight_g FLOAT,
    growth_percentile FLOAT,
    doppler_velocity_cm_s FLOAT, -- Umbilical Artery
    created_at TIMESTAMP WITH TIME ZONE DEFAULT CURRENT_TIMESTAMP
);

-- 3. Delivery & Neonatal Transition Logs
CREATE TABLE IF NOT EXISTS obgyn_delivery_logs (
    id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
    tenant_id UUID NOT NULL,
    patient_id UUID NOT NULL,
    delivery_date TIMESTAMP WITH TIME ZONE DEFAULT CURRENT_TIMESTAMP,
    delivery_mode VARCHAR(50), -- Vaginal, C-Section, Vacuum, Forceps
    delivery_duration_min INTEGER,
    apgar_1min INTEGER,
    apgar_5min INTEGER,
    birth_weight_g FLOAT,
    maternal_blood_loss_ml INTEGER,
    pph_status BOOLEAN DEFAULT FALSE, -- Postpartum Hemorrhage
    created_at TIMESTAMP WITH TIME ZONE DEFAULT CURRENT_TIMESTAMP
);

-- 4. Gynecology Oncology & Endometriosis Registry
CREATE TABLE IF NOT EXISTS gyn_oncology_registry (
    id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
    tenant_id UUID NOT NULL,
    patient_id UUID NOT NULL,
    diagnosis VARCHAR(100), -- e.g., Endometriosis, Ovarian Cancer
    stage VARCHAR(20), -- FIGO Stage
    grade VARCHAR(20),
    treatment_plan TEXT,
    surgery_type VARCHAR(100), -- e.g., Total Hysterectomy
    created_at TIMESTAMP WITH TIME ZONE DEFAULT CURRENT_TIMESTAMP
);

-- Enable RLS
ALTER TABLE obgyn_ivf_lab_logs ENABLE ROW LEVEL SECURITY;
ALTER TABLE maternal_fetal_metrics ENABLE ROW LEVEL SECURITY;
ALTER TABLE obgyn_delivery_logs ENABLE ROW LEVEL SECURITY;
ALTER TABLE gyn_oncology_registry ENABLE ROW LEVEL SECURITY;

-- RLS Policies
CREATE POLICY obgyn_ivf_lab_logs_tenant_policy ON obgyn_ivf_lab_logs 
    USING (tenant_id = current_setting('app.current_tenant_id')::uuid);

CREATE POLICY maternal_fetal_metrics_tenant_policy ON maternal_fetal_metrics 
    USING (tenant_id = current_setting('app.current_tenant_id')::uuid);

CREATE POLICY obgyn_delivery_logs_tenant_policy ON obgyn_delivery_logs 
    USING (tenant_id = current_setting('app.current_tenant_id')::uuid);

CREATE POLICY gyn_oncology_registry_tenant_policy ON gyn_oncology_registry 
    USING (tenant_id = current_setting('app.current_tenant_id')::uuid);

COMMIT;
