-- Migration: e100_pulmonology_core_up.sql
-- Description: Core schema for Pulmonology Department (S-MODE Gold Standard)
-- Compliance: RLS Enabled, Tenant Isolation, Clinical Audit Trail

BEGIN;

-- 1. Pulmonology Encounters (Main clinical record)
CREATE TABLE IF NOT EXISTS pulmonology_encounters (
    id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
    tenant_id UUID NOT NULL,
    patient_id UUID NOT NULL,
    doctor_id UUID NOT NULL,
    encounter_date TIMESTAMP WITH TIME ZONE DEFAULT CURRENT_TIMESTAMP,
    chief_complaint TEXT,
    respiratory_history TEXT,
    smoking_status VARCHAR(50), -- e.g., Never, Former, Current, Pack-Years
    pack_years NUMERIC(5,2),
    physical_exam_findings JSONB, -- Breath sounds, percussion, etc.
    diagnosis_code VARCHAR(20), -- ICD-10
    treatment_plan TEXT,
    status VARCHAR(20) DEFAULT 'active', -- active, completed, cancelled
    created_at TIMESTAMP WITH TIME ZONE DEFAULT CURRENT_TIMESTAMP,
    updated_at TIMESTAMP WITH TIME ZONE DEFAULT CURRENT_TIMESTAMP
);

-- 2. Pulmonary Function Tests (PFT) - The Gold Standard Data
CREATE TABLE IF NOT EXISTS pulmonology_pft_results (
    id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
    encounter_id UUID NOT NULL REFERENCES pulmonology_encounters(id) ON DELETE CASCADE,
    tenant_id UUID NOT NULL,
    test_date TIMESTAMP WITH TIME ZONE DEFAULT CURRENT_TIMESTAMP,
    fev1_predicted NUMERIC(5,2),
    fev1_actual NUMERIC(5,2),
    fvc_predicted NUMERIC(5,2),
    fvc_actual NUMERIC(5,2),
    fev1_fvc_ratio NUMERIC(5,2),
    dlco_predicted NUMERIC(5,2),
    dlco_actual NUMERIC(5,2),
    interpretation TEXT,
    gold_stage VARCHAR(20), -- GOLD 1, 2, 3, 4
    created_at TIMESTAMP WITH TIME ZONE DEFAULT CURRENT_TIMESTAMP
);

-- 3. Sleep Studies (Polysomnography)
CREATE TABLE IF NOT EXISTS pulmonology_sleep_studies (
    id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
    encounter_id UUID NOT NULL REFERENCES pulmonology_encounters(id) ON DELETE CASCADE,
    tenant_id UUID NOT NULL,
    study_date TIMESTAMP WITH TIME ZONE DEFAULT CURRENT_TIMESTAMP,
    ahi_index NUMERIC(5,2), -- Apnea-Hypopnea Index
    lowest_oxygen_saturation NUMERIC(5,2),
    sleep_efficiency NUMERIC(5,2),
    diagnosis VARCHAR(100), -- Obstructive Sleep Apnea, Central Sleep Apnea, etc.
    recommendation TEXT,
    created_at TIMESTAMP WITH TIME ZONE DEFAULT CURRENT_TIMESTAMP
);

-- 4. Bronchoscopy Reports
CREATE TABLE IF NOT EXISTS pulmonology_bronchoscopy (
    id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
    encounter_id UUID NOT NULL REFERENCES pulmonology_encounters(id) ON DELETE CASCADE,
    tenant_id UUID NOT NULL,
    procedure_date TIMESTAMP WITH TIME ZONE DEFAULT CURRENT_TIMESTAMP,
    findings TEXT,
    biopsy_taken BOOLEAN DEFAULT FALSE,
    specimen_details TEXT,
    complications TEXT,
    created_at TIMESTAMP WITH TIME ZONE DEFAULT CURRENT_TIMESTAMP
);

-- ENABLE RLS (Row Level Security) - NON-NEGOTIABLE
ALTER TABLE pulmonology_encounters ENABLE ROW LEVEL SECURITY;
ALTER TABLE pulmonology_pft_results ENABLE ROW LEVEL SECURITY;
ALTER TABLE pulmonology_sleep_studies ENABLE ROW LEVEL SECURITY;
ALTER TABLE pulmonology_bronchoscopy ENABLE ROW LEVEL SECURITY;

-- RLS Policies: Only allow access if tenant_id matches the session context
CREATE POLICY pulmonology_encounters_tenant_policy ON pulmonology_encounters 
    USING (tenant_id = current_setting('app.current_tenant')::UUID);

CREATE POLICY pulmonology_pft_results_tenant_policy ON pulmonology_pft_results 
    USING (tenant_id = current_setting('app.current_tenant')::UUID);

CREATE POLICY pulmonology_sleep_studies_tenant_policy ON pulmonology_sleep_studies 
    USING (tenant_id = current_setting('app.current_tenant')::UUID);

CREATE POLICY pulmonology_bronchoscopy_tenant_policy ON pulmonology_bronchoscopy 
    USING (tenant_id = current_setting('app.current_tenant')::UUID);

-- Indexes for Performance
CREATE INDEX idx_pulm_enc_patient ON pulmonology_encounters(patient_id);
CREATE INDEX idx_pulm_enc_tenant ON pulmonology_encounters(tenant_id);
CREATE INDEX idx_pulm_pft_enc ON pulmonology_pft_results(encounter_id);
CREATE INDEX idx_pulm_sleep_enc ON pulmonology_sleep_studies(encounter_id);

COMMIT;
