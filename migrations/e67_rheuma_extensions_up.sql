-- Migration: e67_rheuma_extensions_up.sql
-- Description: Adds specialized tables for Rheumatology and Immunology.
-- Compliance: PDPL / RLS Enabled

BEGIN;

-- 1. Rheumatology Scoring (DAS28, SLEDAI)
CREATE TABLE IF NOT EXISTS rheuma_scores (
    id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
    tenant_id UUID NOT NULL,
    patient_id UUID NOT NULL,
    record_date TIMESTAMP WITH TIME ZONE DEFAULT CURRENT_TIMESTAMP,
    das28_score FLOAT,
    sleda_score FLOAT,
    joint_count_tender INTEGER,
    joint_count_swollen INTEGER,
    created_at TIMESTAMP WITH TIME ZONE DEFAULT CURRENT_TIMESTAMP,
    CONSTRAINT fk_tenant_rheum FOREIGN KEY (tenant_id) REFERENCES tenants(id) ON DELETE CASCADE,
    CONSTRAINT fk_patient_rheum FOREIGN KEY (patient_id) REFERENCES patients(id) ON DELETE CASCADE
);

-- 2. Autoimmune Markers (Serology)
CREATE TABLE IF NOT EXISTS autoimmune_markers (
    id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
    tenant_id UUID NOT NULL,
    patient_id UUID NOT NULL,
    sample_date TIMESTAMP WITH TIME ZONE DEFAULT CURRENT_TIMESTAMP,
    ana_titer VARCHAR(50),
    rf_level_iu_ml FLOAT,
    anti_ccp_level FLOAT,
    anti_dsdna_level FLOAT,
    created_at TIMESTAMP WITH TIME ZONE DEFAULT CURRENT_TIMESTAMP,
    CONSTRAINT fk_tenant_marker FOREIGN KEY (tenant_id) REFERENCES tenants(id) ON DELETE CASCADE,
    CONSTRAINT fk_patient_marker FOREIGN KEY (patient_id) REFERENCES patients(id) ON DELETE CASCADE
);

-- Enable Row Level Security (RLS)
ALTER TABLE rheuma_scores ENABLE ROW LEVEL SECURITY;
ALTER TABLE autoimmune_markers ENABLE ROW LEVEL SECURITY;

-- Create RLS Policies (Golden Access Rule: Tenant Isolation)
CREATE POLICY tenant_isolation_policy ON rheuma_scores 
    USING (tenant_id = current_setting('app.current_tenant')::UUID);

CREATE POLICY tenant_isolation_policy ON autoimmune_markers 
    USING (tenant_id = current_setting('app.current_tenant')::UUID);

COMMIT;
