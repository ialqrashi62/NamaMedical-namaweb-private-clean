-- Migration: e103_obgyn_core_up.sql
-- Description: Core schema for OBGYN & Pediatrics (S-MODE Gold Standard)
-- Compliance: RLS Enabled, Tenant Isolation, Clinical Audit Trail

BEGIN;

-- 1. OBGYN Encounters (Prenatal, Postnatal, Gynae)
CREATE TABLE IF NOT EXISTS obgyn_encounters (
    id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
    tenant_id UUID NOT NULL,
    patient_id UUID NOT NULL,
    doctor_id UUID NOT NULL,
    encounter_date TIMESTAMP WITH TIME ZONE DEFAULT CURRENT_TIMESTAMP,
    visit_type VARCHAR(50), -- Prenatal, Postnatal, Gynae, Pediatric
    gravida INT,
    para INT,
    lmp DATE, -- Last Menstrual Period
    edd DATE, -- Estimated Date of Delivery
    gestational_age_weeks NUMERIC(4,1),
    chief_complaint TEXT,
    physical_exam_findings JSONB,
    diagnosis_code VARCHAR(20),
    treatment_plan TEXT,
    status VARCHAR(20) DEFAULT 'active',
    created_at TIMESTAMP WITH TIME ZONE DEFAULT CURRENT_TIMESTAMP,
    updated_at TIMESTAMP WITH TIME ZONE DEFAULT CURRENT_TIMESTAMP
);

-- 2. Antenatal Care (ANC) Tracking
CREATE TABLE IF NOT EXISTS obgyn_anc_tracking (
    id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
    encounter_id UUID NOT NULL REFERENCES obgyn_encounters(id) ON DELETE CASCADE,
    tenant_id UUID NOT NULL,
    fundal_height_cm NUMERIC(4,1),
    fetal_heart_rate INT,
    fetal_presentation VARCHAR(50),
    maternal_bp VARCHAR(20),
    maternal_weight_kg NUMERIC(5,2),
    edema_grade VARCHAR(20),
    urine_protein VARCHAR(20),
    created_at TIMESTAMP WITH TIME ZONE DEFAULT CURRENT_TIMESTAMP
);

-- 3. Delivery & Neonatal Records
CREATE TABLE IF NOT EXISTS obgyn_delivery_records (
    id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
    encounter_id UUID NOT NULL REFERENCES obgyn_encounters(id) ON DELETE CASCADE,
    tenant_id UUID NOT NULL,
    delivery_date TIMESTAMP WITH TIME ZONE DEFAULT CURRENT_TIMESTAMP,
    delivery_mode VARCHAR(50), -- Vaginal, C-Section, Vacuum, Forceps
    baby_gender VARCHAR(10),
    baby_weight_g INT,
    apgar_1min INT,
    apgar_5min INT,
    complications TEXT,
    created_at TIMESTAMP WITH TIME ZONE DEFAULT CURRENT_TIMESTAMP
);

-- ENABLE RLS
ALTER TABLE obgyn_encounters ENABLE ROW LEVEL SECURITY;
ALTER TABLE obgyn_anc_tracking ENABLE ROW LEVEL SECURITY;
ALTER TABLE obgyn_delivery_records ENABLE ROW LEVEL SECURITY;

CREATE POLICY obgyn_encounters_tenant_policy ON obgyn_encounters 
    USING (tenant_id = current_setting('app.current_tenant')::UUID);

CREATE POLICY obgyn_anc_tenant_policy ON obgyn_anc_tracking 
    USING (tenant_id = current_setting('app.current_tenant')::UUID);

CREATE POLICY obgyn_delivery_tenant_policy ON obgyn_delivery_records 
    USING (tenant_id = current_setting('app.current_tenant')::UUID);

CREATE INDEX idx_obgyn_enc_patient ON obgyn_encounters(patient_id);
CREATE INDEX idx_obgyn_enc_tenant ON obgyn_encounters(tenant_id);

COMMIT;
