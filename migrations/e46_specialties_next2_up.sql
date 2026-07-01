-- Migration: Create OBGYN pregnancies, psychiatric evaluations, and dermatology lesions tables with RLS and grants.
BEGIN;

-- 1. Create obgyn_pregnancies table
CREATE TABLE IF NOT EXISTS obgyn_pregnancies (
    id SERIAL PRIMARY KEY,
    patient_id INTEGER NOT NULL REFERENCES patients(id) ON DELETE CASCADE,
    doctor_id INTEGER REFERENCES system_users(id) ON DELETE SET NULL,
    gravida INTEGER DEFAULT 0,
    para INTEGER DEFAULT 0,
    abortions INTEGER DEFAULT 0,
    living INTEGER DEFAULT 0,
    lmp_date DATE,
    edd_date DATE,
    gestational_weeks INTEGER,
    notes TEXT DEFAULT '',
    created_at TIMESTAMP DEFAULT CURRENT_TIMESTAMP,
    tenant_id INTEGER NOT NULL,
    facility_id INTEGER
);

-- Ensure all columns exist in case the table was pre-existing
ALTER TABLE obgyn_pregnancies ADD COLUMN IF NOT EXISTS doctor_id INTEGER REFERENCES system_users(id) ON DELETE SET NULL;
ALTER TABLE obgyn_pregnancies ADD COLUMN IF NOT EXISTS gravida INTEGER DEFAULT 0;
ALTER TABLE obgyn_pregnancies ADD COLUMN IF NOT EXISTS para INTEGER DEFAULT 0;
ALTER TABLE obgyn_pregnancies ADD COLUMN IF NOT EXISTS abortions INTEGER DEFAULT 0;
ALTER TABLE obgyn_pregnancies ADD COLUMN IF NOT EXISTS living INTEGER DEFAULT 0;
ALTER TABLE obgyn_pregnancies ADD COLUMN IF NOT EXISTS lmp_date DATE;
ALTER TABLE obgyn_pregnancies ADD COLUMN IF NOT EXISTS edd_date DATE;
ALTER TABLE obgyn_pregnancies ADD COLUMN IF NOT EXISTS gestational_weeks INTEGER;
ALTER TABLE obgyn_pregnancies ADD COLUMN IF NOT EXISTS notes TEXT DEFAULT '';
ALTER TABLE obgyn_pregnancies ADD COLUMN IF NOT EXISTS created_at TIMESTAMP DEFAULT CURRENT_TIMESTAMP;
ALTER TABLE obgyn_pregnancies ADD COLUMN IF NOT EXISTS tenant_id INTEGER DEFAULT 1;
ALTER TABLE obgyn_pregnancies ADD COLUMN IF NOT EXISTS facility_id INTEGER;

-- 2. Create psychiatric_evaluations table
CREATE TABLE IF NOT EXISTS psychiatric_evaluations (
    id SERIAL PRIMARY KEY,
    patient_id INTEGER NOT NULL REFERENCES patients(id) ON DELETE CASCADE,
    doctor_id INTEGER REFERENCES system_users(id) ON DELETE SET NULL,
    evaluation_date DATE NOT NULL DEFAULT CURRENT_DATE,
    mse_appearance TEXT DEFAULT '',
    mse_behavior TEXT DEFAULT '',
    mse_speech TEXT DEFAULT '',
    mse_mood TEXT DEFAULT '',
    mse_affect TEXT DEFAULT '',
    mse_thought_process TEXT DEFAULT '',
    mse_thought_content TEXT DEFAULT '',
    mse_perception TEXT DEFAULT '',
    mse_cognition TEXT DEFAULT '',
    mse_insight TEXT DEFAULT '',
    mse_judgment TEXT DEFAULT '',
    diagnostic_summary TEXT DEFAULT '',
    created_at TIMESTAMP DEFAULT CURRENT_TIMESTAMP,
    tenant_id INTEGER NOT NULL,
    facility_id INTEGER
);

-- 3. Create dermatology_lesions table
CREATE TABLE IF NOT EXISTS dermatology_lesions (
    id SERIAL PRIMARY KEY,
    patient_id INTEGER NOT NULL REFERENCES patients(id) ON DELETE CASCADE,
    doctor_id INTEGER REFERENCES system_users(id) ON DELETE SET NULL,
    exam_date DATE NOT NULL DEFAULT CURRENT_DATE,
    body_site VARCHAR(100) DEFAULT '',
    lesion_type VARCHAR(100) DEFAULT '',
    color VARCHAR(50) DEFAULT '',
    size_mm NUMERIC(4,1) DEFAULT 0.0,
    distribution VARCHAR(100) DEFAULT '',
    biopsy_taken BOOLEAN DEFAULT FALSE,
    notes TEXT DEFAULT '',
    created_at TIMESTAMP DEFAULT CURRENT_TIMESTAMP,
    tenant_id INTEGER NOT NULL,
    facility_id INTEGER
);

-- Enable Row-Level Security (RLS) on all three tables
ALTER TABLE obgyn_pregnancies ENABLE ROW LEVEL SECURITY;
ALTER TABLE obgyn_pregnancies FORCE ROW LEVEL SECURITY;

ALTER TABLE psychiatric_evaluations ENABLE ROW LEVEL SECURITY;
ALTER TABLE psychiatric_evaluations FORCE ROW LEVEL SECURITY;

ALTER TABLE dermatology_lesions ENABLE ROW LEVEL SECURITY;
ALTER TABLE dermatology_lesions FORCE ROW LEVEL SECURITY;

-- Create RLS policies
DROP POLICY IF EXISTS rls_obgyn_pregnancies_tenant_isolation ON obgyn_pregnancies;
CREATE POLICY rls_obgyn_pregnancies_tenant_isolation ON obgyn_pregnancies
    FOR ALL
    USING (tenant_id = NULLIF(current_setting('app.tenant_id', true), '')::integer)
    WITH CHECK (tenant_id = NULLIF(current_setting('app.tenant_id', true), '')::integer);

DROP POLICY IF EXISTS rls_psychiatric_evaluations_tenant_isolation ON psychiatric_evaluations;
CREATE POLICY rls_psychiatric_evaluations_tenant_isolation ON psychiatric_evaluations
    FOR ALL
    USING (tenant_id = NULLIF(current_setting('app.tenant_id', true), '')::integer)
    WITH CHECK (tenant_id = NULLIF(current_setting('app.tenant_id', true), '')::integer);

DROP POLICY IF EXISTS rls_dermatology_lesions_tenant_isolation ON dermatology_lesions;
CREATE POLICY rls_dermatology_lesions_tenant_isolation ON dermatology_lesions
    FOR ALL
    USING (tenant_id = NULLIF(current_setting('app.tenant_id', true), '')::integer)
    WITH CHECK (tenant_id = NULLIF(current_setting('app.tenant_id', true), '')::integer);

-- Create indexes
CREATE INDEX IF NOT EXISTS idx_obgyn_pregnancies_patient ON obgyn_pregnancies (tenant_id, patient_id);
CREATE INDEX IF NOT EXISTS idx_psychiatric_evaluations_patient ON psychiatric_evaluations (tenant_id, patient_id);
CREATE INDEX IF NOT EXISTS idx_dermatology_lesions_patient ON dermatology_lesions (tenant_id, patient_id);

-- Grant privileges conditionally
DO $$
BEGIN
    IF EXISTS (SELECT 1 FROM pg_roles WHERE rolname = 'jumanasoft_staging_user') THEN
        EXECUTE 'GRANT ALL PRIVILEGES ON TABLE obgyn_pregnancies, psychiatric_evaluations, dermatology_lesions TO jumanasoft_staging_user';
        EXECUTE 'GRANT USAGE, SELECT ON SEQUENCE obgyn_pregnancies_id_seq, psychiatric_evaluations_id_seq, dermatology_lesions_id_seq TO jumanasoft_staging_user';
    END IF;
    
    IF EXISTS (SELECT 1 FROM pg_roles WHERE rolname = 'nama_medical_app') THEN
        EXECUTE 'GRANT ALL PRIVILEGES ON TABLE obgyn_pregnancies, psychiatric_evaluations, dermatology_lesions TO nama_medical_app';
        EXECUTE 'GRANT USAGE, SELECT ON SEQUENCE obgyn_pregnancies_id_seq, psychiatric_evaluations_id_seq, dermatology_lesions_id_seq TO nama_medical_app';
    END IF;
END
$$;

COMMIT;
