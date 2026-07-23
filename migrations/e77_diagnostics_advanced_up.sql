-- Migration: e77_diagnostics_advanced_up.sql
-- Purpose: Implement specialized tables for Advanced Diagnostics (Molecular, Radiology, Nuclear, Pathology)

BEGIN;

-- 1. Molecular Diagnostics & NGS Logs
CREATE TABLE IF NOT EXISTS diag_molecular_logs (
    id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
    tenant_id UUID NOT NULL,
    patient_id UUID NOT NULL,
    log_date TIMESTAMP WITH TIME ZONE DEFAULT CURRENT_TIMESTAMP,
    test_type VARCHAR(100), -- e.g., NGS, Liquid Biopsy, PCR
    gene_mutation VARCHAR(100), -- e.g., EGFR L858R, BRAF V600E
    variant_allele_frequency FLOAT,
    molecular_typing TEXT,
    created_at TIMESTAMP WITH TIME ZONE DEFAULT CURRENT_TIMESTAMP
);

-- 2. Advanced Radiology Metrics (Volumetric & Kinetic)
CREATE TABLE IF NOT EXISTS radiology_advanced_metrics (
    id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
    tenant_id UUID NOT NULL,
    patient_id UUID NOT NULL,
    procedure_id UUID, -- Link to base radiology table
    lesion_volume_mm3 FLOAT,
    kinetic_curve_type VARCHAR(50), -- e.g., Wash-in, Wash-out
    contrast_enhancement_rate FLOAT,
    ai_detection_confidence FLOAT,
    created_at TIMESTAMP WITH TIME ZONE DEFAULT CURRENT_TIMESTAMP
);

-- 3. Nuclear Medicine & Tracer Logs
CREATE TABLE IF NOT EXISTS nuclear_med_logs (
    id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
    tenant_id UUID NOT NULL,
    patient_id UUID NOT NULL,
    tracer_used VARCHAR(100), -- e.g., 18F-FDG, 99mTc-Sestamibi
    suv_max FLOAT, -- Standardized Uptake Value
    uptake_region VARCHAR(100),
    quantification_value FLOAT,
    created_at TIMESTAMP WITH TIME ZONE DEFAULT CURRENT_TIMESTAMP
);

-- 4. Digital Pathology & IHC Logs
CREATE TABLE IF NOT EXISTS pathology_digital_logs (
    id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
    tenant_id UUID NOT NULL,
    patient_id UUID NOT NULL,
    slide_id VARCHAR(100),
    ihc_marker VARCHAR(100), -- e.g., HER2, PD-L1
    ihc_score INTEGER, -- 0, 1+, 2+, 3+
    molecular_typing TEXT,
    digital_slide_url TEXT,
    created_at TIMESTAMP WITH TIME ZONE DEFAULT CURRENT_TIMESTAMP
);

-- Enable RLS
ALTER TABLE diag_molecular_logs ENABLE ROW LEVEL SECURITY;
ALTER TABLE radiology_advanced_metrics ENABLE ROW LEVEL SECURITY;
ALTER TABLE nuclear_med_logs ENABLE ROW LEVEL SECURITY;
ALTER TABLE pathology_digital_logs ENABLE ROW LEVEL SECURITY;

-- RLS Policies
CREATE POLICY diag_molecular_logs_tenant_policy ON diag_molecular_logs 
    USING (tenant_id = current_setting('app.current_tenant_id')::uuid);

CREATE POLICY radiology_advanced_metrics_tenant_policy ON radiology_advanced_metrics 
    USING (tenant_id = current_setting('app.current_tenant_id')::uuid);

CREATE POLICY nuclear_med_logs_tenant_policy ON nuclear_med_logs 
    USING (tenant_id = current_setting('app.current_tenant_id')::uuid);

CREATE POLICY pathology_digital_logs_tenant_policy ON pathology_digital_logs 
    USING (tenant_id = current_setting('app.current_tenant_id')::uuid);

COMMIT;
