-- Migration for Preventive Cardiology & Cardio-Obstetrics
-- Target: namaweb/migrations/e54_preventive_cardio_ob_up.sql

CREATE TABLE IF NOT EXISTS preventive_cardio_profiles (
    id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
    patient_id UUID NOT NULL REFERENCES patients(id) ON DELETE CASCADE,
    tenant_id UUID NOT NULL,
    smoking_status TEXT CHECK (smoking_status IN ('Never', 'Former', 'Current')),
    alcohol_intake TEXT,
    activity_level TEXT,
    family_history_score INTEGER,
    target_ldl DECIMAL(5,2),
    target_bp_systolic INTEGER,
    target_bp_diastolic INTEGER,
    created_at TIMESTAMP WITH TIME ZONE DEFAULT CURRENT_TIMESTAMP,
    updated_at TIMESTAMP WITH TIME ZONE DEFAULT CURRENT_TIMESTAMP
);

CREATE TABLE IF NOT EXISTS cardio_obstetrics_records (
    id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
    patient_id UUID NOT NULL REFERENCES patients(id) ON DELETE CASCADE,
    tenant_id UUID NOT NULL,
    pregnancy_stage TEXT, -- e.g., 'First Trimester', 'Second Trimester', 'Third Trimester'
    cardiac_condition TEXT,
    fetal_impact_score INTEGER,
    delivery_mode_recommendation TEXT,
    maternal_risk_level TEXT CHECK (risk_level IN ('Low', 'Moderate', 'High', 'Critical')),
    created_at TIMESTAMP WITH TIME ZONE DEFAULT CURRENT_TIMESTAMP,
    updated_at TIMESTAMP WITH TIME ZONE DEFAULT CURRENT_TIMESTAMP
);

-- Enable RLS
ALTER TABLE preventive_cardio_profiles ENABLE ROW LEVEL SECURITY;
ALTER TABLE cardio_obstetrics_records ENABLE ROW LEVEL SECURITY;

CREATE POLICY tenant_isolation_policy ON preventive_cardio_profiles 
    USING (tenant_id = current_setting('app.current_tenant')::uuid);

CREATE POLICY tenant_isolation_policy ON cardio_obstetrics_records 
    USING (tenant_id = current_setting('app.current_tenant')::uuid);
