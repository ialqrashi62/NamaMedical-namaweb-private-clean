-- Migration: e71_neuro_extensions_up.sql
-- Description: Adds specialized tables for Neurosurgery and Spine Surgery.
-- Compliance: PDPL / RLS Enabled

BEGIN;

-- 1. Neurosurgery Sessions
CREATE TABLE IF NOT EXISTS neuro_surgery_sessions (
    id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
    tenant_id UUID NOT NULL,
    patient_id UUID NOT NULL,
    surgeon_id UUID NOT NULL,
    procedure_type VARCHAR(255), -- e.g., Craniotomy, Aneurysm Clipping
    icp_max_mmhg FLOAT,
    navigation_system_used VARCHAR(100),
    anesthesia_type VARCHAR(100),
    outcome_gcs_postop INTEGER,
    created_at TIMESTAMP WITH TIME ZONE DEFAULT CURRENT_TIMESTAMP,
    CONSTRAINT fk_tenant_neuro FOREIGN KEY (tenant_id) REFERENCES tenants(id) ON DELETE CASCADE,
    CONSTRAINT fk_patient_neuro FOREIGN KEY (patient_id) REFERENCES patients(id) ON DELETE CASCADE
);

-- 2. Spine Fusion Records
CREATE TABLE IF NOT EXISTS spine_fusion_records (
    id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
    tenant_id UUID NOT NULL,
    session_id UUID NOT NULL,
    levels_fused VARCHAR(100), -- e.g., L4-L5, L5-S1
    hardware_type VARCHAR(100),
    stability_score INTEGER,
    postop_alignment_angle FLOAT,
    created_at TIMESTAMP WITH TIME ZONE DEFAULT CURRENT_TIMESTAMP,
    CONSTRAINT fk_tenant_spine FOREIGN KEY (tenant_id) REFERENCES tenants(id) ON DELETE CASCADE,
    CONSTRAINT fk_session_spine FOREIGN KEY (session_id) REFERENCES neuro_surgery_sessions(id) ON DELETE CASCADE
);

-- Enable Row Level Security (RLS)
ALTER TABLE neuro_surgery_sessions ENABLE ROW LEVEL SECURITY;
ALTER TABLE spine_fusion_records ENABLE ROW LEVEL SECURITY;

-- Create RLS Policies (Golden Access Rule: Tenant Isolation)
CREATE POLICY tenant_isolation_policy ON neuro_surgery_sessions 
    USING (tenant_id = current_setting('app.current_tenant')::UUID);

CREATE POLICY tenant_isolation_policy ON spine_fusion_records 
    USING (tenant_id = current_setting('app.current_tenant')::UUID);

COMMIT;
