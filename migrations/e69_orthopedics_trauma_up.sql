-- Migration: e69_orthopedics_trauma_up.sql
-- Purpose: Implement specialized tables for Orthopedics & Traumatology

BEGIN;

-- 1. Orthopedic Surgical Logs
CREATE TABLE IF NOT EXISTS ortho_surgical_logs (
    id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
    tenant_id UUID NOT NULL,
    patient_id UUID NOT NULL,
    surgeon_id UUID NOT NULL,
    operation_date TIMESTAMP WITH TIME ZONE DEFAULT CURRENT_TIMESTAMP,
    procedure_type VARCHAR(100), -- e.g., Total Hip Arthroplasty, ACL Reconstruction
    approach VARCHAR(100), -- e.g., Anterior, Posterior, Parapatellar
    duration_minutes INTEGER,
    blood_loss_ml INTEGER,
    intraop_findings TEXT,
    complications TEXT,
    created_at TIMESTAMP WITH TIME ZONE DEFAULT CURRENT_TIMESTAMP,
    updated_at TIMESTAMP WITH TIME ZONE DEFAULT CURRENT_TIMESTAMP
);

-- 2. Joint Replacement Registry (Implant Tracking)
CREATE TABLE IF NOT EXISTS joint_replacement_registry (
    id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
    tenant_id UUID NOT NULL,
    patient_id UUID NOT NULL,
    procedure_id UUID REFERENCES ortho_surgical_logs(id),
    joint_replaced VARCHAR(50), -- Hip, Knee, Shoulder, Ankle
    implant_brand VARCHAR(100),
    implant_model VARCHAR(100),
    implant_serial_number VARCHAR(100),
    implant_size VARCHAR(20),
    alignment_angle FLOAT, -- Degrees
    stability_grade VARCHAR(50),
    created_at TIMESTAMP WITH TIME ZONE DEFAULT CURRENT_TIMESTAMP
);

-- 3. Fracture Management & Reduction Logs
CREATE TABLE IF NOT EXISTS fracture_management_logs (
    id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
    tenant_id UUID NOT NULL,
    patient_id UUID NOT NULL,
    fracture_site VARCHAR(100), -- e.g., Distal Radius, Femoral Neck
    ao_ota_classification VARCHAR(50), -- e.g., 32-A1
    reduction_type VARCHAR(50), -- Open, Closed, Percutaneous
    reduction_status VARCHAR(50), -- Anatomical, Acceptable, Poor
    fixation_method VARCHAR(100), -- e.g., Intramedullary Nail, Plate & Screws
    created_at TIMESTAMP WITH TIME ZONE DEFAULT CURRENT_TIMESTAMP
);

-- Enable RLS
ALTER TABLE ortho_surgical_logs ENABLE ROW LEVEL SECURITY;
ALTER TABLE joint_replacement_registry ENABLE ROW LEVEL SECURITY;
ALTER TABLE fracture_management_logs ENABLE ROW LEVEL SECURITY;

-- RLS Policies
CREATE POLICY ortho_surgical_logs_tenant_policy ON ortho_surgical_logs 
    USING (tenant_id = current_setting('app.current_tenant_id')::uuid);

CREATE POLICY joint_replacement_registry_tenant_policy ON joint_replacement_registry 
    USING (tenant_id = current_setting('app.current_tenant_id')::uuid);

CREATE POLICY fracture_management_logs_tenant_policy ON fracture_management_logs 
    USING (tenant_id = current_setting('app.current_tenant_id')::uuid);

COMMIT;
