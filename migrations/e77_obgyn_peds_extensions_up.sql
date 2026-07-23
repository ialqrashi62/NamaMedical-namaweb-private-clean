-- Migration: e77_obgyn_peds_extensions_up.sql
-- Description: Adds specialized tables for Maternal-Fetal Medicine, IVF, and NICU.
-- Compliance: PDPL / RLS Enabled

BEGIN;

-- 1. Maternal-Fetal Medicine (MFM) Scans
CREATE TABLE IF NOT EXISTS mfm_scans (
    id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
    tenant_id UUID NOT NULL,
    patient_id UUID NOT NULL,
    scan_date TIMESTAMP WITH TIME ZONE DEFAULT CURRENT_TIMESTAMP,
    fetal_weight_est FLOAT,
    crown_rump_length FLOAT,
    anomaly_detected BOOLEAN DEFAULT FALSE,
    anomaly_description TEXT,
    scan_type VARCHAR(100), -- e.g., 4D Ultrasound, Doppler
    created_at TIMESTAMP WITH TIME ZONE DEFAULT CURRENT_TIMESTAMP,
    CONSTRAINT fk_tenant_mfm FOREIGN KEY (tenant_id) REFERENCES tenants(id) ON DELETE CASCADE,
    CONSTRAINT fk_patient_mfm FOREIGN KEY (patient_id) REFERENCES patients(id) ON DELETE CASCADE
);

-- 2. IVF Cycle Tracking
CREATE TABLE IF NOT EXISTS ivf_cycles (
    id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
    tenant_id UUID NOT NULL,
    patient_id UUID NOT NULL,
    cycle_start_date DATE,
    egg_count INTEGER,
    fertilization_rate_pct FLOAT,
    embryo_grade VARCHAR(50),
    transfer_date DATE,
    outcome VARCHAR(100), -- e.g., Success, Failed
    created_at TIMESTAMP WITH TIME ZONE DEFAULT CURRENT_TIMESTAMP,
    CONSTRAINT fk_tenant_ivf FOREIGN KEY (tenant_id) REFERENCES tenants(id) ON DELETE CASCADE,
    CONSTRAINT fk_patient_ivf FOREIGN KEY (patient_id) REFERENCES patients(id) ON DELETE CASCADE
);

-- 3. NICU Monitoring
CREATE TABLE IF NOT EXISTS nicu_monitoring (
    id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
    tenant_id UUID NOT NULL,
    patient_id UUID NOT NULL,
    record_time TIMESTAMP WITH TIME ZONE DEFAULT CURRENT_TIMESTAMP,
    ventilator_mode VARCHAR(100),
    oxygen_saturation_pct FLOAT,
    temperature_c FLOAT,
    heart_rate_bpm INTEGER,
    nutrition_type VARCHAR(100),
    created_at TIMESTAMP WITH TIME ZONE DEFAULT CURRENT_TIMESTAMP,
    CONSTRAINT fk_tenant_nicu FOREIGN KEY (tenant_id) REFERENCES tenants(id) ON DELETE CASCADE,
    CONSTRAINT fk_patient_nicu FOREIGN KEY (patient_id) REFERENCES patients(id) ON DELETE CASCADE
);

-- Enable Row Level Security (RLS)
ALTER TABLE mfm_scans ENABLE ROW LEVEL SECURITY;
ALTER TABLE ivf_cycles ENABLE ROW LEVEL SECURITY;
ALTER TABLE nicu_monitoring ENABLE ROW LEVEL SECURITY;

-- Create RLS Policies (Golden Access Rule: Tenant Isolation)
CREATE POLICY tenant_isolation_policy ON mfm_scans 
    USING (tenant_id = current_setting('app.current_tenant')::UUID);

CREATE POLICY tenant_isolation_policy ON ivf_cycles 
    USING (tenant_id = current_setting('app.current_tenant')::UUID);

CREATE POLICY tenant_isolation_policy ON nicu_monitoring 
    USING (tenant_id = current_setting('app.current_tenant')::UUID);

COMMIT;
