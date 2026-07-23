-- Migration: e60_nephrology_extensions_up.sql
-- Description: Adds specialized tables for Nephrology, Dialysis, and Renal Transplantation.
-- Compliance: PDPL / RLS Enabled

BEGIN;

-- 1. Dialysis Sessions (HD, PD, Home Dialysis)
CREATE TABLE IF NOT EXISTS dialysis_sessions (
    id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
    tenant_id UUID NOT NULL,
    patient_id UUID NOT NULL,
    session_date TIMESTAMP WITH TIME ZONE DEFAULT CURRENT_TIMESTAMP,
    session_type VARCHAR(50), -- e.g., Hemodialysis, Peritoneal, Home
    pre_weight_kg FLOAT,
    post_weight_kg FLOAT,
    uf_volume_liters FLOAT,
    ktv_value FLOAT,
    urr_percentage FLOAT,
    blood_flow_qb INTEGER,
    dialysate_flow_qd INTEGER,
    notes TEXT,
    created_at TIMESTAMP WITH TIME ZONE DEFAULT CURRENT_TIMESTAMP,
    CONSTRAINT fk_tenant_neph FOREIGN KEY (tenant_id) REFERENCES tenants(id) ON DELETE CASCADE,
    CONSTRAINT fk_patient_neph FOREIGN KEY (patient_id) REFERENCES patients(id) ON DELETE CASCADE
);

-- 2. Renal Transplantation Records
CREATE TABLE IF NOT EXISTS renal_transplant_records (
    id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
    tenant_id UUID NOT NULL,
    patient_id UUID NOT NULL,
    donor_id UUID,
    transplant_date DATE,
    hla_match_score FLOAT,
    immunosuppressant_regimen TEXT,
    graft_function_status VARCHAR(100),
    last_biopsy_date DATE,
    created_at TIMESTAMP WITH TIME ZONE DEFAULT CURRENT_TIMESTAMP,
    CONSTRAINT fk_tenant_trans FOREIGN KEY (tenant_id) REFERENCES tenants(id) ON DELETE CASCADE,
    CONSTRAINT fk_patient_trans FOREIGN KEY (patient_id) REFERENCES patients(id) ON DELETE CASCADE
);

-- 3. Specialized Nephrology Labs
CREATE TABLE IF NOT EXISTS nephrology_labs (
    id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
    tenant_id UUID NOT NULL,
    patient_id UUID NOT NULL,
    sample_date TIMESTAMP WITH TIME ZONE DEFAULT CURRENT_TIMESTAMP,
    creatinine_mgdl FLOAT,
    urea_mgdl FLOAT,
    potassium_meq_l FLOAT,
    phosphorus_mgdl FLOAT,
    calcium_mgdl FLOAT,
    calculated_gfr FLOAT,
    gfr_formula_used VARCHAR(50), -- e.g., CKD-EPI, MDRD
    created_at TIMESTAMP WITH TIME ZONE DEFAULT CURRENT_TIMESTAMP,
    CONSTRAINT fk_tenant_lab FOREIGN KEY (tenant_id) REFERENCES tenants(id) ON DELETE CASCADE,
    CONSTRAINT fk_patient_lab FOREIGN KEY (patient_id) REFERENCES patients(id) ON DELETE CASCADE
);

-- Enable Row Level Security (RLS)
ALTER TABLE dialysis_sessions ENABLE ROW LEVEL SECURITY;
ALTER TABLE renal_transplant_records ENABLE ROW LEVEL SECURITY;
ALTER TABLE nephrology_labs ENABLE ROW LEVEL SECURITY;

-- Create RLS Policies (Golden Access Rule: Tenant Isolation)
CREATE POLICY tenant_isolation_policy ON dialysis_sessions 
    USING (tenant_id = current_setting('app.current_tenant')::UUID);

CREATE POLICY tenant_isolation_policy ON renal_transplant_records 
    USING (tenant_id = current_setting('app.current_tenant')::UUID);

CREATE POLICY tenant_isolation_policy ON nephrology_labs 
    USING (tenant_id = current_setting('app.current_tenant')::UUID);

COMMIT;
