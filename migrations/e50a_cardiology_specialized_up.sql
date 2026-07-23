-- Migration for General Cardiology Specialized Data
-- Target: namaweb/migrations/e50_cardiology_specialized_up.sql

CREATE TABLE IF NOT EXISTS cardiology_exams (
    id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
    patient_id UUID NOT NULL REFERENCES patients(id) ON DELETE CASCADE,
    encounter_id UUID NOT NULL,
    tenant_id UUID NOT NULL,
    heart_sounds TEXT,
    jvp_height DECIMAL(4,2),
    edema_grade INTEGER CHECK (edema_grade BETWEEN 0 AND 4),
    carotid_bruit BOOLEAN DEFAULT FALSE,
    created_at TIMESTAMP WITH TIME ZONE DEFAULT CURRENT_TIMESTAMP,
    updated_at TIMESTAMP WITH TIME ZONE DEFAULT CURRENT_TIMESTAMP
);

CREATE TABLE IF NOT EXISTS cardiology_echo (
    id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
    patient_id UUID NOT NULL REFERENCES patients(id) ON DELETE CASCADE,
    encounter_id UUID NOT NULL,
    tenant_id UUID NOT NULL,
    ef_percent DECIMAL(5,2),
    lv_dimension DECIMAL(5,2),
    mitral_regurgitation_grade INTEGER CHECK (mitral_regurgitation_grade BETWEEN 0 AND 4),
    aortic_stenosis_area DECIMAL(5,2),
    created_at TIMESTAMP WITH TIME ZONE DEFAULT CURRENT_TIMESTAMP,
    updated_at TIMESTAMP WITH TIME ZONE DEFAULT CURRENT_TIMESTAMP
);

-- Enable RLS
ALTER TABLE cardiology_exams ENABLE ROW LEVEL SECURITY;
ALTER TABLE cardiology_echo ENABLE ROW LEVEL SECURITY;

CREATE POLICY tenant_isolation_policy ON cardiology_exams 
    USING (tenant_id = current_setting('app.current_tenant')::uuid);

CREATE POLICY tenant_isolation_policy ON cardiology_echo 
    USING (tenant_id = current_setting('app.current_tenant')::uuid);
