-- Migration: e72_ortho_extensions_up.sql
-- Description: Adds specialized tables for Orthopedics and Joint Replacement.
-- Compliance: PDPL / RLS Enabled

BEGIN;

-- 1. Joint Replacement Records
CREATE TABLE IF NOT EXISTS ortho_joint_replacements (
    id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
    tenant_id UUID NOT NULL,
    patient_id UUID NOT NULL,
    joint_type VARCHAR(100), -- e.g., Total Hip, Partial Knee
    implant_model VARCHAR(255),
    implant_serial_number VARCHAR(100),
    alignment_angle FLOAT,
    rom_postop_degrees INTEGER,
    created_at TIMESTAMP WITH TIME ZONE DEFAULT CURRENT_TIMESTAMP,
    CONSTRAINT fk_tenant_ortho FOREIGN KEY (tenant_id) REFERENCES tenants(id) ON DELETE CASCADE,
    CONSTRAINT fk_patient_ortho FOREIGN KEY (patient_id) REFERENCES patients(id) ON DELETE CASCADE
);

-- 2. Trauma & Fracture Logs
CREATE TABLE IF NOT EXISTS ortho_trauma_logs (
    id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
    tenant_id UUID NOT NULL,
    patient_id UUID NOT NULL,
    fracture_type VARCHAR(255),
    fixation_method VARCHAR(100), -- e.g., Intramedullary Nail, Plate & Screw
    hardware_used TEXT,
    reduction_quality VARCHAR(50),
    created_at TIMESTAMP WITH TIME ZONE DEFAULT CURRENT_TIMESTAMP,
    CONSTRAINT fk_tenant_trauma FOREIGN KEY (tenant_id) REFERENCES tenants(id) ON DELETE CASCADE,
    CONSTRAINT fk_patient_trauma FOREIGN KEY (patient_id) REFERENCES patients(id) ON DELETE CASCADE
);

-- Enable Row Level Security (RLS)
ALTER TABLE ortho_joint_replacements ENABLE ROW LEVEL SECURITY;
ALTER TABLE ortho_trauma_logs ENABLE ROW LEVEL SECURITY;

-- Create RLS Policies (Golden Access Rule: Tenant Isolation)
CREATE POLICY tenant_isolation_policy ON ortho_joint_replacements 
    USING (tenant_id = current_setting('app.current_tenant')::UUID);

CREATE POLICY tenant_isolation_policy ON ortho_trauma_logs 
    USING (tenant_id = current_setting('app.current_tenant')::UUID);

COMMIT;
