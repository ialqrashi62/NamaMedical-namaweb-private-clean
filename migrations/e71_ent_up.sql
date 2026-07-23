-- Migration: e71_ent_up.sql
-- Purpose: Implement specialized tables for ENT (Otolaryngology)

BEGIN;

-- 1. ENT Surgical Logs
CREATE TABLE IF NOT EXISTS ent_surgical_logs (
    id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
    tenant_id UUID NOT NULL,
    patient_id UUID NOT NULL,
    surgeon_id UUID NOT NULL,
    operation_date TIMESTAMP WITH TIME ZONE DEFAULT CURRENT_TIMESTAMP,
    procedure_type VARCHAR(100), -- e.g., FESS, Tonsillectomy, Myringotomy
    side VARCHAR(10), -- Left, Right, Bilateral
    duration_minutes INTEGER,
    complications TEXT,
    created_at TIMESTAMP WITH TIME ZONE DEFAULT CURRENT_TIMESTAMP,
    updated_at TIMESTAMP WITH TIME ZONE DEFAULT CURRENT_TIMESTAMP
);

-- 2. Audiometry & Tympanometry Metrics
CREATE TABLE IF NOT EXISTS audiometry_metrics (
    id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
    tenant_id UUID NOT NULL,
    patient_id UUID NOT NULL,
    log_time TIMESTAMP WITH TIME ZONE DEFAULT CURRENT_TIMESTAMP,
    frequency_hz INTEGER[], -- Array of frequencies
    threshold_db INTEGER[], -- Array of thresholds
    tympanometry_type VARCHAR(20), -- A, B, C, As, Ad
    air_bone_gap FLOAT,
    created_at TIMESTAMP WITH TIME ZONE DEFAULT CURRENT_TIMESTAMP
);

-- 3. Cochlear Implant Registry
CREATE TABLE IF NOT EXISTS cochlear_implant_registry (
    id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
    tenant_id UUID NOT NULL,
    patient_id UUID NOT NULL,
    procedure_id UUID REFERENCES ent_surgical_logs(id),
    implant_brand VARCHAR(100),
    implant_model VARCHAR(100),
    serial_number VARCHAR(100),
    mapping_parameters JSONB, -- Store complex mapping settings
    created_at TIMESTAMP WITH TIME ZONE DEFAULT CURRENT_TIMESTAMP
);

-- Enable RLS
ALTER TABLE ent_surgical_logs ENABLE ROW LEVEL SECURITY;
ALTER TABLE audiometry_metrics ENABLE ROW LEVEL SECURITY;
ALTER TABLE cochlear_implant_registry ENABLE ROW LEVEL SECURITY;

-- RLS Policies
CREATE POLICY ent_surgical_logs_tenant_policy ON ent_surgical_logs 
    USING (tenant_id = current_setting('app.current_tenant_id')::uuid);

CREATE POLICY audiometry_metrics_tenant_policy ON audiometry_metrics 
    USING (tenant_id = current_setting('app.current_tenant_id')::uuid);

CREATE POLICY cochlear_implant_registry_tenant_policy ON cochlear_implant_registry 
    USING (tenant_id = current_setting('app.current_tenant_id')::uuid);

COMMIT;
