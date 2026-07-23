-- Migration: e81_rare_specialties_up.sql
-- Purpose: Implement specialized tables for Rare Specialties & Nanomedicine (Wave 10)

BEGIN;

-- 1. Rare Disease & Orphan Registry
CREATE TABLE IF NOT EXISTS rare_disease_logs (
    id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
    tenant_id UUID NOT NULL,
    patient_id UUID NOT NULL,
    log_date TIMESTAMP WITH TIME ZONE DEFAULT CURRENT_TIMESTAMP,
    phenotype_description TEXT,
    genotype_mutation VARCHAR(255), -- e.g., CFTR DeltaF508
    orphan_drug_used VARCHAR(100),
    treatment_response TEXT,
    created_at TIMESTAMP WITH TIME ZONE DEFAULT CURRENT_TIMESTAMP
);

-- 2. Nanomedicine & Targeted Delivery Logs
CREATE TABLE IF NOT EXISTS nanomedicine_metrics (
    id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
    tenant_id UUID NOT NULL,
    patient_id UUID NOT NULL,
    log_date TIMESTAMP WITH TIME ZONE DEFAULT CURRENT_TIMESTAMP,
    nanoparticle_type VARCHAR(100), -- e.g., Liposomal, Gold NP, Carbon Nanotube
    targeting_ligand VARCHAR(100),
    delivery_efficiency_percent FLOAT,
    toxicity_score FLOAT,
    created_at TIMESTAMP WITH TIME ZONE DEFAULT CURRENT_TIMESTAMP
);

-- 3. Regenerative Medicine & Stem Cell Logs
CREATE TABLE IF NOT EXISTS regenerative_logs (
    id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
    tenant_id UUID NOT NULL,
    patient_id UUID NOT NULL,
    log_date TIMESTAMP WITH TIME ZONE DEFAULT CURRENT_TIMESTAMP,
    therapy_type VARCHAR(100), -- e.g., MSCs, iPSCs, Organoid Graft
 la-Surgical logic for tissue regeneration.
    regeneration_rate_mm_day FLOAT,
    viability_percent FLOAT,
    created_at TIMESTAMP WITH TIME ZONE DEFAULT CURRENT_TIMESTAMP
);

-- Enable RLS
ALTER TABLE rare_disease_logs ENABLE ROW LEVEL SECURITY;
ALTER TABLE nanomedicine_metrics ENABLE ROW LEVEL SECURITY;
ALTER TABLE regenerative_logs ENABLE ROW LEVEL SECURITY;

-- RLS Policies
CREATE POLICY rare_disease_logs_tenant_policy ON rare_disease_logs 
    USING (tenant_id = current_setting('app.current_tenant_id')::uuid);

CREATE POLICY nanomedicine_metrics_tenant_policy ON nanomedicine_metrics 
    USING (tenant_id = current_setting('app.current_tenant_id')::uuid);

CREATE POLICY regenerative_logs_tenant_policy ON regenerative_logs 
    USING (tenant_id = current_setting('app.current_tenant_id')::uuid);

COMMIT;
