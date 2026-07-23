-- Migration: e80_critical_care_up.sql
-- Description: Adds specialized tables for Emergency, ICU, and Anesthesia.
-- Compliance: PDPL / RLS Enabled

BEGIN;

-- 1. ER Triage Logs
CREATE TABLE IF NOT EXISTS er_triage_logs (
    id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
    tenant_id UUID NOT NULL,
    patient_id UUID NOT NULL,
    esi_level INTEGER, -- 1 (Resuscitation) to 5 (Non-Urgent)
    chief_complaint TEXT,
    triage_vitals JSONB, -- { "bp": "120/80", "hr": 90, "spo2": 95 }
    triage_time TIMESTAMP WITH TIME ZONE DEFAULT CURRENT_TIMESTAMP,
    created_at TIMESTAMP WITH TIME ZONE DEFAULT CURRENT_TIMESTAMP,
    CONSTRAINT fk_tenant_er FOREIGN KEY (tenant_id) REFERENCES tenants(id) ON DELETE CASCADE,
    CONSTRAINT fk_patient_er FOREIGN KEY (patient_id) REFERENCES patients(id) ON DELETE CASCADE
);

-- 2. ICU Vital Streams (High Frequency)
CREATE TABLE IF NOT EXISTS icu_vital_streams (
    id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
    tenant_id UUID NOT NULL,
    patient_id UUID NOT NULL,
    record_time TIMESTAMP WITH TIME ZONE DEFAULT CURRENT_TIMESTAMP,
    map_mmHg INTEGER,
    heart_rate_bpm INTEGER,
    spo2_pct FLOAT,
    respiratory_rate_bpm INTEGER,
    temp_c FLOAT,
    mean_arterial_pressure FLOAT,
    created_at TIMESTAMP WITH TIME ZONE DEFAULT CURRENT_TIMESTAMP,
    CONSTRAINT fk_tenant_icu FOREIGN KEY (tenant_id) REFERENCES tenants(id) ON DELETE CASCADE,
    CONSTRAINT fk_patient_icu FOREIGN KEY (patient_id) REFERENCES patients(id) ON DELETE CASCADE
);

-- 3. Anesthesia Records
CREATE TABLE IF NOT EXISTS anesthesia_records (
    id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
    tenant_id UUID NOT NULL,
    session_id UUID NOT NULL,
    patient_id UUID NOT NULL,
    drug_used VARCHAR(255),
    dose_mg FLOAT,
    intubation_time TIMESTAMP WITH TIME ZONE,
    extubation_time TIMESTAMP WITH TIME ZONE,
    pacu_recovery_score INTEGER,
    created_at TIMESTAMP WITH TIME ZONE DEFAULT CURRENT_TIMESTAMP,
    CONSTRAINT fk_tenant_anes FOREIGN KEY (tenant_id) REFERENCES tenants(id) ON DELETE CASCADE,
    CONSTRAINT fk_patient_anes FOREIGN KEY (patient_id) REFERENCES patients(id) ON DELETE CASCADE
);

-- Enable Row Level Security (RLS)
ALTER TABLE er_triage_logs ENABLE ROW LEVEL SECURITY;
ALTER TABLE icu_vital_streams ENABLE ROW LEVEL SECURITY;
ALTER TABLE anesthesia_records ENABLE ROW LEVEL SECURITY;

-- Create RLS Policies (Golden Access Rule: Tenant Isolation)
CREATE POLICY tenant_isolation_policy ON er_triage_logs USING (tenant_id = current_setting('app.current_tenant')::UUID);
CREATE POLICY tenant_isolation_policy ON icu_vital_streams USING (tenant_id = current_setting('app.current_tenant')::UUID);
CREATE POLICY tenant_isolation_policy ON anesthesia_records USING (tenant_id = current_setting('app.current_tenant')::UUID);

COMMIT;
