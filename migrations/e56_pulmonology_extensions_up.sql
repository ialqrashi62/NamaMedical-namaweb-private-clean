-- Migration: e56_pulmonology_extensions_up.sql
-- Description: Adds specialized tables for Pulmonology, Sleep Medicine, and Bronchoscopy.
-- Compliance: PDPL / RLS Enabled

BEGIN;

-- 1. Pulmonary Function Tests (PFT)
CREATE TABLE IF NOT EXISTS pulmonary_function_tests (
    id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
    tenant_id UUID NOT NULL,
    patient_id UUID NOT NULL,
    test_date TIMESTAMP WITH TIME ZONE DEFAULT CURRENT_TIMESTAMP,
    fev1_liters FLOAT,
    fvc_liters FLOAT,
    fev1_fvc_ratio FLOAT,
    peak_flow_l_sec FLOAT,
    interpretation TEXT,
    created_at TIMESTAMP WITH TIME ZONE DEFAULT CURRENT_TIMESTAMP,
    CONSTRAINT fk_tenant_pft FOREIGN KEY (tenant_id) REFERENCES tenants(id) ON DELETE CASCADE,
    CONSTRAINT fk_patient_pft FOREIGN KEY (patient_id) REFERENCES patients(id) ON DELETE CASCADE
);

-- 2. Sleep Study Results (Polysomnography)
CREATE TABLE IF NOT EXISTS sleep_study_results (
    id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
    tenant_id UUID NOT NULL,
    patient_id UUID NOT NULL,
    study_date TIMESTAMP WITH TIME ZONE DEFAULT CURRENT_TIMESTAMP,
    ahi_index FLOAT, -- Apnea-Hypopnea Index
    odi_index FLOAT, -- Oxygen Desaturation Index
    arousal_index FLOAT,
    cpap_pressure_cmh2o FLOAT,
    sleep_efficiency_pct FLOAT,
    notes TEXT,
    created_at TIMESTAMP WITH TIME ZONE DEFAULT CURRENT_TIMESTAMP,
    CONSTRAINT fk_tenant_sleep FOREIGN KEY (tenant_id) REFERENCES tenants(id) ON DELETE CASCADE,
    CONSTRAINT fk_patient_sleep FOREIGN KEY (patient_id) REFERENCES patients(id) ON DELETE CASCADE
);

-- 3. Bronchoscopy Reports
CREATE TABLE IF NOT EXISTS bronchoscopy_reports (
    id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
    tenant_id UUID NOT NULL,
    patient_id UUID NOT NULL,
    procedure_date TIMESTAMP WITH TIME ZONE DEFAULT CURRENT_TIMESTAMP,
    sedation_type VARCHAR(100),
    site_sampled VARCHAR(255),
    biopsy_result TEXT,
    complications TEXT,
    created_at TIMESTAMP WITH TIME ZONE DEFAULT CURRENT_TIMESTAMP,
    CONSTRAINT fk_tenant_bronch FOREIGN KEY (tenant_id) REFERENCES tenants(id) ON DELETE CASCADE,
    CONSTRAINT fk_patient_bronch FOREIGN KEY (patient_id) REFERENCES patients(id) ON DELETE CASCADE
);

-- Enable Row Level Security (RLS)
ALTER TABLE pulmonary_function_tests ENABLE ROW LEVEL SECURITY;
ALTER TABLE sleep_study_results ENABLE ROW LEVEL SECURITY;
ALTER TABLE bronchoscopy_reports ENABLE ROW LEVEL SECURITY;

-- Create RLS Policies (Golden Access Rule: Tenant Isolation)
CREATE POLICY tenant_isolation_policy ON pulmonary_function_tests 
    USING (tenant_id = current_setting('app.current_tenant')::UUID);

CREATE POLICY tenant_isolation_policy ON sleep_study_results 
    USING (tenant_id = current_setting('app.current_tenant')::UUID);

CREATE POLICY tenant_isolation_policy ON bronchoscopy_reports 
    USING (tenant_id = current_setting('app.current_tenant')::UUID);

COMMIT;
