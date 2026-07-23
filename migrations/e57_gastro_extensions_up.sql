-- Migration: e57_gastro_extensions_up.sql
-- Description: Adds specialized tables for Gastroenterology, Hepatology, and Advanced Endoscopy.
-- Compliance: PDPL / RLS Enabled

BEGIN;

-- 1. Advanced Endoscopy Reports (EUS, ERCP, Enteroscopy)
CREATE TABLE IF NOT EXISTS gastro_endoscopy_reports (
    id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
    tenant_id UUID NOT NULL,
    patient_id UUID NOT NULL,
    procedure_date TIMESTAMP WITH TIME ZONE DEFAULT CURRENT_TIMESTAMP,
    procedure_type VARCHAR(100), -- e.g., EUS, ERCP, Colonoscopy
    findings TEXT,
    biopsy_taken BOOLEAN DEFAULT FALSE,
    biopsy_site VARCHAR(255),
    outcome VARCHAR(255),
    sedation_type VARCHAR(100),
    created_at TIMESTAMP WITH TIME ZONE DEFAULT CURRENT_TIMESTAMP,
    CONSTRAINT fk_tenant_gastro FOREIGN KEY (tenant_id) REFERENCES tenants(id) ON DELETE CASCADE,
    CONSTRAINT fk_patient_gastro FOREIGN KEY (patient_id) REFERENCES patients(id) ON DELETE CASCADE
);

-- 2. Hepatology Metrics (Liver Function & Scoring)
CREATE TABLE IF NOT EXISTS hepatology_metrics (
    id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
    tenant_id UUID NOT NULL,
    patient_id UUID NOT NULL,
    record_date TIMESTAMP WITH TIME ZONE DEFAULT CURRENT_TIMESTAMP,
    bilirubin_mgdl FLOAT,
    albumin_gdl FLOAT,
    inr_value FLOAT,
    creatinine_mgdl FLOAT,
    meld_score FLOAT,
    child_pugh_score INTEGER,
    ascites_grade INTEGER,
    encephalopathy_grade INTEGER,
    created_at TIMESTAMP WITH TIME ZONE DEFAULT CURRENT_TIMESTAMP,
    CONSTRAINT fk_tenant_hep FOREIGN KEY (tenant_id) REFERENCES tenants(id) ON DELETE CASCADE,
    CONSTRAINT fk_patient_hep FOREIGN KEY (patient_id) REFERENCES patients(id) ON DELETE CASCADE
);

-- 3. GI Motility Studies
CREATE TABLE IF NOT EXISTS gi_motility_studies (
    id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
    tenant_id UUID NOT NULL,
    patient_id UUID NOT NULL,
    study_type VARCHAR(100), -- e.g., Manometry, Gastric Emptying
    results_summary TEXT,
    transit_time_hours FLOAT,
    conclusion TEXT,
    created_at TIMESTAMP WITH TIME ZONE DEFAULT CURRENT_TIMESTAMP,
    CONSTRAINT fk_tenant_motility FOREIGN KEY (tenant_id) REFERENCES tenants(id) ON DELETE CASCADE,
    CONSTRAINT fk_patient_motility FOREIGN KEY (patient_id) REFERENCES patients(id) ON DELETE CASCADE
);

-- Enable Row Level Security (RLS)
ALTER TABLE gastro_endoscopy_reports ENABLE ROW LEVEL SECURITY;
ALTER TABLE hepatology_metrics ENABLE ROW LEVEL SECURITY;
ALTER TABLE gi_motility_studies ENABLE ROW LEVEL SECURITY;

-- Create RLS Policies (Golden Access Rule: Tenant Isolation)
CREATE POLICY tenant_isolation_policy ON gastro_endoscopy_reports 
    USING (tenant_id = current_setting('app.current_tenant')::UUID);

CREATE POLICY tenant_isolation_policy ON hepatology_metrics 
    USING (tenant_id = current_setting('app.current_tenant')::UUID);

CREATE POLICY tenant_isolation_policy ON gi_motility_studies 
    USING (tenant_id = current_setting('app.current_tenant')::UUID);

COMMIT;
