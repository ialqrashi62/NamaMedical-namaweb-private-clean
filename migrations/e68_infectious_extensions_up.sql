-- Migration: e68_infectious_extensions_up.sql
-- Description: Adds specialized tables for Infectious Diseases and Antimicrobial Stewardship.
-- Compliance: PDPL / RLS Enabled

BEGIN;

-- 1. Microbiology Culture Results
CREATE TABLE IF NOT EXISTS culture_results (
    id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
    tenant_id UUID NOT NULL,
    patient_id UUID NOT NULL,
    sample_date TIMESTAMP WITH TIME ZONE DEFAULT CURRENT_TIMESTAMP,
    sample_site VARCHAR(255),
    pathogen_name VARCHAR(255),
    sensitivity_profile JSONB, -- { "drug_a": "S", "drug_b": "R" }
    is_critical BOOLEAN DEFAULT FALSE,
    created_at TIMESTAMP WITH TIME ZONE DEFAULT CURRENT_TIMESTAMP,
    CONSTRAINT fk_tenant_inf FOREIGN KEY (tenant_id) REFERENCES tenants(id) ON DELETE CASCADE,
    CONSTRAINT fk_patient_inf FOREIGN KEY (patient_id) REFERENCES patients(id) ON DELETE CASCADE
);

-- 2. Antimicrobial Stewardship (ASP) Reviews
CREATE TABLE IF NOT EXISTS asp_reviews (
    id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
    tenant_id UUID NOT NULL,
    patient_id UUID NOT NULL,
    review_date TIMESTAMP WITH TIME ZONE DEFAULT CURRENT_TIMESTAMP,
    original_drug VARCHAR(255),
    suggested_drug VARCHAR(255),
    justification TEXT,
    status VARCHAR(50), -- e.g., Pending, Approved, Rejected
    created_at TIMESTAMP WITH TIME ZONE DEFAULT CURRENT_TIMESTAMP,
    CONSTRAINT fk_tenant_asp FOREIGN KEY (tenant_id) REFERENCES tenants(id) ON DELETE CASCADE,
    CONSTRAINT fk_patient_asp FOREIGN KEY (patient_id) REFERENCES patients(id) ON DELETE CASCADE
);

-- Enable Row Level Security (RLS)
ALTER TABLE culture_results ENABLE ROW LEVEL SECURITY;
ALTER TABLE asp_reviews ENABLE ROW LEVEL SECURITY;

-- Create RLS Policies (Golden Access Rule: Tenant Isolation)
CREATE POLICY tenant_isolation_policy ON culture_results 
    USING (tenant_id = current_setting('app.current_tenant')::UUID);

CREATE POLICY tenant_isolation_policy ON asp_reviews 
    USING (tenant_id = current_setting('app.current_tenant')::UUID);

COMMIT;
