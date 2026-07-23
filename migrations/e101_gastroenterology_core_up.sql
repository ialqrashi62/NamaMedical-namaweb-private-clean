-- Migration: e101_gastroenterology_core_up.sql
-- Description: Core schema for Gastroenterology Department (S-MODE Gold Standard)
-- Compliance: RLS Enabled, Tenant Isolation, Clinical Audit Trail

BEGIN;

-- 1. Gastroenterology Encounters
CREATE TABLE IF NOT EXISTS gastro_encounters (
    id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
    tenant_id UUID NOT NULL,
    patient_id UUID NOT NULL,
    doctor_id UUID NOT NULL,
    encounter_date TIMESTAMP WITH TIME ZONE DEFAULT CURRENT_TIMESTAMP,
    chief_complaint TEXT,
    gi_history TEXT,
    dietary_habits TEXT,
    physical_exam_findings JSONB, -- Abdominal palpation, bowel sounds, etc.
    diagnosis_code VARCHAR(20), -- ICD-10
    treatment_plan TEXT,
    status VARCHAR(20) DEFAULT 'active',
    created_at TIMESTAMP WITH TIME ZONE DEFAULT CURRENT_TIMESTAMP,
    updated_at TIMESTAMP WITH TIME ZONE DEFAULT CURRENT_TIMESTAMP
);

-- 2. Endoscopy Reports (Gastroscopy, Colonoscopy, ERCP)
CREATE TABLE IF NOT EXISTS gastro_endoscopy_reports (
    id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
    encounter_id UUID NOT NULL REFERENCES gastro_encounters(id) ON DELETE CASCADE,
    tenant_id UUID NOT NULL,
    procedure_type VARCHAR(50), -- Gastroscopy, Colonoscopy, ERCP, PEG
    procedure_date TIMESTAMP WITH TIME ZONE DEFAULT CURRENT_TIMESTAMP,
    sedation_used VARCHAR(100),
    findings TEXT,
    biopsy_taken BOOLEAN DEFAULT FALSE,
    biopsy_sites TEXT,
    boston_bowel_score INT, -- For Colonoscopy quality
    recommendation TEXT,
    created_at TIMESTAMP WITH TIME ZONE DEFAULT CURRENT_TIMESTAMP
);

-- 3. Liver Function & Hepatic Markers (Specialized Tracking)
CREATE TABLE IF NOT EXISTS gastro_hepatic_markers (
    id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
    encounter_id UUID NOT NULL REFERENCES gastro_encounters(id) ON DELETE CASCADE,
    tenant_id UUID NOT NULL,
    bilirubin_total NUMERIC(5,2),
    bilirubin_direct NUMERIC(5,2),
    alt_level NUMERIC(5,2),
    ast_level NUMERIC(5,2),
    alk_phos NUMERIC(5,2),
    albumin NUMERIC(5,2),
    child_pugh_score VARCHAR(20), -- A, B, C
    created_at TIMESTAMP WITH TIME ZONE DEFAULT CURRENT_TIMESTAMP
);

-- ENABLE RLS
ALTER TABLE gastro_encounters ENABLE ROW LEVEL SECURITY;
ALTER TABLE gastro_endoscopy_reports ENABLE ROW LEVEL SECURITY;
ALTER TABLE gastro_hepatic_markers ENABLE ROW LEVEL SECURITY;

CREATE POLICY gastro_encounters_tenant_policy ON gastro_encounters 
    USING (tenant_id = current_setting('app.current_tenant')::UUID);

CREATE POLICY gastro_endoscopy_tenant_policy ON gastro_endoscopy_reports 
    USING (tenant_id = current_setting('app.current_tenant')::UUID);

CREATE POLICY gastro_hepatic_tenant_policy ON gastro_hepatic_markers 
    USING (tenant_id = current_setting('app.current_tenant')::UUID);

CREATE INDEX idx_gastro_enc_patient ON gastro_encounters(patient_id);
CREATE INDEX idx_gastro_enc_tenant ON gastro_encounters(tenant_id);

COMMIT;
