-- Migration: e102_general_surgery_core_up.sql
-- Description: Core schema for General Surgery Department (S-MODE Gold Standard)
-- Compliance: RLS Enabled, Tenant Isolation, Clinical Audit Trail

BEGIN;

-- 1. Surgery Encounters (Pre-op, Intra-op, Post-op)
CREATE TABLE IF NOT EXISTS surgery_encounters (
    id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
    tenant_id UUID NOT NULL,
    patient_id UUID NOT NULL,
    surgeon_id UUID NOT NULL,
    encounter_date TIMESTAMP WITH TIME ZONE DEFAULT CURRENT_TIMESTAMP,
    surgical_indication TEXT,
    pre_op_diagnosis TEXT,
    post_op_diagnosis TEXT,
    surgical_approach VARCHAR(50), -- Open, Laparoscopic, Robotic, Combined
    anesthesia_type VARCHAR(50),
    operation_time_min INT,
    blood_loss_ml INT,
    complications TEXT,
    status VARCHAR(20) DEFAULT 'scheduled', -- scheduled, in-progress, completed, cancelled
    created_at TIMESTAMP WITH TIME ZONE DEFAULT CURRENT_TIMESTAMP,
    updated_at TIMESTAMP WITH TIME ZONE DEFAULT CURRENT_TIMESTAMP
);

-- 2. Surgical Site/Wound Tracking
CREATE TABLE IF NOT EXISTS surgery_wound_logs (
    id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
    encounter_id UUID NOT NULL REFERENCES surgery_encounters(id) ON DELETE CASCADE,
    tenant_id UUID NOT NULL,
    check_date TIMESTAMP WITH TIME ZONE DEFAULT CURRENT_TIMESTAMP,
    wound_status VARCHAR(50), -- Healing, Infected, Dehisced, Seroma
    drainage_amount_ml NUMERIC(5,2),
    drainage_type VARCHAR(50),
    intervention_taken TEXT,
    created_at TIMESTAMP WITH TIME ZONE DEFAULT CURRENT_TIMESTAMP
);

-- 3. Surgical Implant Registry
CREATE TABLE IF NOT EXISTS surgery_implants (
    id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
    encounter_id UUID NOT NULL REFERENCES surgery_encounters(id) ON DELETE CASCADE,
    tenant_id UUID NOT NULL,
    implant_type VARCHAR(100), -- Mesh, Stapler, Clip, Plate
    brand_model VARCHAR(100),
    serial_number VARCHAR(100),
    lot_number VARCHAR(100),
    position_details TEXT,
    created_at TIMESTAMP WITH TIME ZONE DEFAULT CURRENT_TIMESTAMP
);

-- ENABLE RLS
ALTER TABLE surgery_encounters ENABLE ROW LEVEL SECURITY;
ALTER TABLE surgery_wound_logs ENABLE ROW LEVEL SECURITY;
ALTER TABLE surgery_implants ENABLE ROW LEVEL SECURITY;

CREATE POLICY surgery_encounters_tenant_policy ON surgery_encounters 
    USING (tenant_id = current_setting('app.current_tenant')::UUID);

CREATE POLICY surgery_wound_tenant_policy ON surgery_wound_logs 
    USING (tenant_id = current_setting('app.current_tenant')::UUID);

CREATE POLICY surgery_implants_tenant_policy ON surgery_implants 
    USING (tenant_id = current_setting('app.current_tenant')::UUID);

CREATE INDEX idx_surg_enc_patient ON surgery_encounters(patient_id);
CREATE INDEX idx_surg_enc_tenant ON surgery_encounters(tenant_id);

COMMIT;
