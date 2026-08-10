-- migrations/e51_pulm_gi_rheum_ortho_neuro_up.sql
-- Pulmonology + GI + Rheumatology + Orthopedics + Neurology tables
BEGIN;

-- Pulmonology assessments
CREATE TABLE IF NOT EXISTS pulmonology_assessments (
    id                BIGSERIAL PRIMARY KEY,
    tenant_id         BIGINT NOT NULL,
    patient_id        BIGINT NOT NULL REFERENCES patients(id) ON DELETE CASCADE,
    encounter_id      BIGINT REFERENCES encounters(id) ON DELETE SET NULL,
    assessed_by       BIGINT NOT NULL REFERENCES users(id),
    assessment_type   TEXT NOT NULL CHECK (assessment_type IN ('asthma','copd')),
    payload           JSONB NOT NULL,
    result            JSONB,
    created_at        TIMESTAMPTZ NOT NULL DEFAULT now()
);

CREATE INDEX IF NOT EXISTS idx_pulm_tenant ON pulmonology_assessments (tenant_id);
CREATE INDEX IF NOT EXISTS idx_pulm_patient ON pulmonology_assessments (patient_id, created_at DESC);

ALTER TABLE pulmonology_assessments ENABLE ROW LEVEL SECURITY;
ALTER TABLE pulmonology_assessments FORCE  ROW LEVEL SECURITY;
DROP POLICY IF EXISTS pulm_tenant_isolation ON pulmonology_assessments;
CREATE POLICY pulm_tenant_isolation ON pulmonology_assessments
    USING (tenant_id::text = current_setting('app.tenant_id', true))
    WITH CHECK (tenant_id::text = current_setting('app.tenant_id', true));

-- GI assessments
CREATE TABLE IF NOT EXISTS gi_assessments (
    id                BIGSERIAL PRIMARY KEY,
    tenant_id         BIGINT NOT NULL,
    patient_id        BIGINT NOT NULL REFERENCES patients(id) ON DELETE CASCADE,
    encounter_id      BIGINT REFERENCES encounters(id) ON DELETE SET NULL,
    assessed_by       BIGINT NOT NULL REFERENCES users(id),
    assessment_type   TEXT NOT NULL CHECK (assessment_type IN ('bleed_risk','ibd_activity')),
    payload           JSONB NOT NULL,
    result            JSONB,
    created_at        TIMESTAMPTZ NOT NULL DEFAULT now()
);

CREATE INDEX IF NOT EXISTS idx_gi_tenant ON gi_assessments (tenant_id);
CREATE INDEX IF NOT EXISTS idx_gi_patient ON gi_assessments (patient_id, created_at DESC);

ALTER TABLE gi_assessments ENABLE ROW LEVEL SECURITY;
ALTER TABLE gi_assessments FORCE  ROW LEVEL SECURITY;
DROP POLICY IF EXISTS gi_tenant_isolation ON gi_assessments;
CREATE POLICY gi_tenant_isolation ON gi_assessments
    USING (tenant_id::text = current_setting('app.tenant_id', true))
    WITH CHECK (tenant_id::text = current_setting('app.tenant_id', true));

-- Rheumatology assessments
CREATE TABLE IF NOT EXISTS rheumatology_assessments (
    id                BIGSERIAL PRIMARY KEY,
    tenant_id         BIGINT NOT NULL,
    patient_id        BIGINT NOT NULL REFERENCES patients(id) ON DELETE CASCADE,
    encounter_id      BIGINT REFERENCES encounters(id) ON DELETE SET NULL,
    assessed_by       BIGINT NOT NULL REFERENCES users(id),
    assessment_type   TEXT NOT NULL CHECK (assessment_type IN ('das28','sledai')),
    payload           JSONB NOT NULL,
    result            JSONB,
    created_at        TIMESTAMPTZ NOT NULL DEFAULT now()
);

CREATE INDEX IF NOT EXISTS idx_rheum_tenant ON rheumatology_assessments (tenant_id);
CREATE INDEX IF NOT EXISTS idx_rheum_patient ON rheumatology_assessments (patient_id, created_at DESC);

ALTER TABLE rheumatology_assessments ENABLE ROW LEVEL SECURITY;
ALTER TABLE rheumatology_assessments FORCE  ROW LEVEL SECURITY;
DROP POLICY IF EXISTS rheum_tenant_isolation ON rheumatology_assessments;
CREATE POLICY rheum_tenant_isolation ON rheumatology_assessments
    USING (tenant_id::text = current_setting('app.tenant_id', true))
    WITH CHECK (tenant_id::text = current_setting('app.tenant_id', true));

-- Orthopedics assessments (bone density)
CREATE TABLE IF NOT EXISTS orthopedics_assessments (
    id                BIGSERIAL PRIMARY KEY,
    tenant_id         BIGINT NOT NULL,
    patient_id        BIGINT NOT NULL REFERENCES patients(id) ON DELETE CASCADE,
    encounter_id      BIGINT REFERENCES encounters(id) ON DELETE SET NULL,
    assessed_by       BIGINT NOT NULL REFERENCES users(id),
    assessment_type   TEXT NOT NULL CHECK (assessment_type IN ('frax','t_score')),
    payload           JSONB NOT NULL,
    result            JSONB,
    created_at        TIMESTAMPTZ NOT NULL DEFAULT now()
);

CREATE INDEX IF NOT EXISTS idx_ortho_tenant ON orthopedics_assessments (tenant_id);
CREATE INDEX IF NOT EXISTS idx_ortho_patient ON orthopedics_assessments (patient_id, created_at DESC);

ALTER TABLE orthopedics_assessments ENABLE ROW LEVEL SECURITY;
ALTER TABLE orthopedics_assessments FORCE  ROW LEVEL SECURITY;
DROP POLICY IF EXISTS ortho_tenant_isolation ON orthopedics_assessments;
CREATE POLICY ortho_tenant_isolation ON orthopedics_assessments
    USING (tenant_id::text = current_setting('app.tenant_id', true))
    WITH CHECK (tenant_id::text = current_setting('app.tenant_id', true));

-- Neurology assessments (NIHSS)
CREATE TABLE IF NOT EXISTS neurology_assessments (
    id                BIGSERIAL PRIMARY KEY,
    tenant_id         BIGINT NOT NULL,
    patient_id        BIGINT NOT NULL REFERENCES patients(id) ON DELETE CASCADE,
    encounter_id      BIGINT REFERENCES encounters(id) ON DELETE SET NULL,
    assessed_by       BIGINT NOT NULL REFERENCES users(id),
    assessment_type   TEXT NOT NULL CHECK (assessment_type IN ('nihss','apache')),
    payload           JSONB NOT NULL,
    result            JSONB,
    created_at        TIMESTAMPTZ NOT NULL DEFAULT now()
);

CREATE INDEX IF NOT EXISTS idx_neuro_tenant ON neurology_assessments (tenant_id);
CREATE INDEX IF NOT EXISTS idx_neuro_patient ON neurology_assessments (patient_id, created_at DESC);

ALTER TABLE neurology_assessments ENABLE ROW LEVEL SECURITY;
ALTER TABLE neurology_assessments FORCE  ROW LEVEL SECURITY;
DROP POLICY IF EXISTS neuro_tenant_isolation ON neurology_assessments;
CREATE POLICY neuro_tenant_isolation ON neurology_assessments
    USING (tenant_id::text = current_setting('app.tenant_id', true))
    WITH CHECK (tenant_id::text = current_setting('app.tenant_id', true));

COMMIT;
