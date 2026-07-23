-- Migration: e21_001_cardiology_specialties_up.sql
-- Description: Create specialized tables for Cardiology department with RLS support.

BEGIN;

-- 1. Cardiology Patient Profiles (Specialized clinical data)
CREATE TABLE IF NOT EXISTS cardio_patient_profiles (
    id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
    patient_id UUID NOT NULL,
    tenant_id UUID NOT NULL,
    risk_score DECIMAL(5,2),
    chronic_conditions JSONB DEFAULT '[]',
    last_screening_date DATE,
    is_high_risk BOOLEAN DEFAULT FALSE,
    created_at TIMESTAMP WITH TIME ZONE DEFAULT CURRENT_TIMESTAMP,
    updated_at TIMESTAMP WITH TIME ZONE DEFAULT CURRENT_TIMESTAMP,
    CONSTRAINT fk_patient FOREIGN KEY (patient_id) REFERENCES patients(id) ON DELETE CASCADE
);

-- 2. Echocardiogram Reports (Echo)
CREATE TABLE IF NOT EXISTS cardio_echo_reports (
    id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
    patient_id UUID NOT NULL,
    tenant_id UUID NOT NULL,
    ef_percentage DECIMAL(5,2), -- Ejection Fraction
    valve_status JSONB DEFAULT '{}', -- Mitral, Aortic, etc.
    wall_motion_abnormality TEXT,
    chamber_sizes JSONB DEFAULT '{}',
    report_date TIMESTAMP WITH TIME ZONE DEFAULT CURRENT_TIMESTAMP,
    physician_id UUID,
    created_at TIMESTAMP WITH TIME ZONE DEFAULT CURRENT_TIMESTAMP,
    CONSTRAINT fk_patient_echo FOREIGN KEY (patient_id) REFERENCES patients(id) ON DELETE CASCADE
);

-- 3. Cardiac Catheterization Logs (Cath Lab)
CREATE TABLE IF NOT EXISTS cardio_cath_logs (
    id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
    patient_id UUID NOT NULL,
    tenant_id UUID NOT NULL,
    procedure_date TIMESTAMP WITH TIME ZONE DEFAULT CURRENT_TIMESTAMP,
    vessel_name VARCHAR(100),
    stenosis_percentage DECIMAL(5,2),
    stent_type VARCHAR(100),
    stent_diameter DECIMAL(5,2),
    pressure_gradient DECIMAL(5,2),
    complications TEXT,
    physician_id UUID,
    created_at TIMESTAMP WITH TIME ZONE DEFAULT CURRENT_TIMESTAMP,
    CONSTRAINT fk_patient_cath FOREIGN KEY (patient_id) REFERENCES patients(id) ON DELETE CASCADE
);

-- 4. Cardiology Medication Tracking (High-precision)
CREATE TABLE IF NOT EXISTS cardio_meds_tracking (
    id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
    patient_id UUID NOT NULL,
    tenant_id UUID NOT NULL,
    drug_name VARCHAR(255) NOT NULL,
    dosage VARCHAR(100),
    frequency VARCHAR(100),
    start_date DATE,
    end_date DATE,
    effect_observed TEXT,
    is_active BOOLEAN DEFAULT TRUE,
    created_at TIMESTAMP WITH TIME ZONE DEFAULT CURRENT_TIMESTAMP,
    CONSTRAINT fk_patient_meds FOREIGN KEY (patient_id) REFERENCES patients(id) ON DELETE CASCADE
);

-- Enable RLS for all new tables
ALTER TABLE cardio_patient_profiles ENABLE ROW LEVEL SECURITY;
ALTER TABLE cardio_echo_reports ENABLE ROW LEVEL SECURITY;
ALTER TABLE cardio_cath_logs ENABLE ROW LEVEL SECURITY;
ALTER TABLE cardio_meds_tracking ENABLE ROW LEVEL SECURITY;

-- Create RLS Policies (Standard tenant isolation)
CREATE POLICY tenant_isolation_policy ON cardio_patient_profiles USING (tenant_id = current_setting('app.current_tenant_id')::uuid);
CREATE POLICY tenant_isolation_policy ON cardio_echo_reports USING (tenant_id = current_setting('app.current_tenant_id')::uuid);
CREATE POLICY tenant_isolation_policy ON cardio_cath_logs USING (tenant_id = current_setting('app.current_tenant_id')::uuid);
CREATE POLICY tenant_isolation_policy ON cardio_meds_tracking USING (tenant_id = current_setting('app.current_tenant_id')::uuid);

COMMIT;
