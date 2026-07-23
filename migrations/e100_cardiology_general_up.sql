-- Migration: e100_cardiology_general_up.sql
-- Description: Create tables for General Cardiology module with Tenant Isolation (RLS)

BEGIN;

-- 1. Cardiology Visits Table
CREATE TABLE IF NOT EXISTS cardiology_visits (
    id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
    tenant_id UUID NOT NULL,
    patient_id UUID NOT NULL,
    doctor_id UUID NOT NULL,
    bp_systolic INTEGER,
    bp_diastolic INTEGER,
    heart_rate INTEGER,
    ef_percentage DECIMAL(5,2),
    notes TEXT,
    created_at TIMESTAMP WITH TIME ZONE DEFAULT CURRENT_TIMESTAMP,
    updated_at TIMESTAMP WITH TIME ZONE DEFAULT CURRENT_TIMESTAMP
);

-- 2. ECG Reports Table
CREATE TABLE IF NOT EXISTS ecg_reports (
    id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
    tenant_id UUID NOT NULL,
    visit_id UUID REFERENCES cardiology_visits(id) ON DELETE CASCADE,
    patient_id UUID NOT NULL,
    ecg_type VARCHAR(50), -- e.g., Resting, Stress, Holter
    interpretation TEXT,
    rhythm VARCHAR(100),
    axis VARCHAR(50),
    conclusion TEXT,
    ecg_image_url TEXT,
    created_at TIMESTAMP WITH TIME ZONE DEFAULT CURRENT_TIMESTAMP
);

-- 3. Cardiac Medications Table
CREATE TABLE IF NOT EXISTS cardiac_medications (
    id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
    tenant_id UUID NOT NULL,
    patient_id UUID NOT NULL,
    drug_name VARCHAR(255) NOT NULL,
    dosage VARCHAR(100),
    frequency VARCHAR(100),
    start_date DATE,
    end_date DATE,
    is_active BOOLEAN DEFAULT TRUE,
    created_at TIMESTAMP WITH TIME ZONE DEFAULT CURRENT_TIMESTAMP
);

-- Enable Row Level Security (RLS)
ALTER TABLE cardiology_visits ENABLE ROW LEVEL SECURITY;
ALTER TABLE ecg_reports ENABLE ROW LEVEL SECURITY;
ALTER TABLE cardiac_medications ENABLE ROW LEVEL SECURITY;

-- Create RLS Policies (Tenant Isolation)
CREATE POLICY tenant_isolation_policy ON cardiology_visits 
    USING (tenant_id = current_setting('app.current_tenant')::UUID);

CREATE POLICY tenant_isolation_policy ON ecg_reports 
    USING (tenant_id = current_setting('app.current_tenant')::UUID);

CREATE POLICY tenant_isolation_policy ON cardiac_medications 
    USING (tenant_id = current_setting('app.current_tenant')::UUID);

-- Indexes for Performance
CREATE INDEX idx_cardio_visits_patient ON cardiology_visits(patient_id);
CREATE INDEX idx_ecg_reports_visit ON ecg_reports(visit_id);
CREATE INDEX idx_cardio_meds_patient ON cardiac_medications(patient_id);

COMMIT;
