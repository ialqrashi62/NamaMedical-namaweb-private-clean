-- migrations/e50_oncology_nephrology_obgyn_up.sql
BEGIN;

-- oncology_staging
CREATE TABLE IF NOT EXISTS oncology_staging (
    id              BIGSERIAL PRIMARY KEY,
    tenant_id       BIGINT NOT NULL,
    patient_id      BIGINT NOT NULL REFERENCES patients(id) ON DELETE CASCADE,
    encounter_id    BIGINT REFERENCES encounters(id) ON DELETE SET NULL,
    assessed_by     BIGINT NOT NULL REFERENCES users(id),
    T               INTEGER NOT NULL CHECK (T BETWEEN 0 AND 4),
    N               INTEGER NOT NULL CHECK (N BETWEEN 0 AND 3),
    M               INTEGER NOT NULL CHECK (M BETWEEN 0 AND 1),
    stage           TEXT,
    cancer_type     TEXT,
    payload         JSONB,
    created_at      TIMESTAMPTZ NOT NULL DEFAULT now()
);

CREATE INDEX IF NOT EXISTS idx_oncology_staging_tenant ON oncology_staging (tenant_id);
CREATE INDEX IF NOT EXISTS idx_oncology_staging_patient ON oncology_staging (patient_id, created_at DESC);

ALTER TABLE oncology_staging ENABLE ROW LEVEL SECURITY;
ALTER TABLE oncology_staging FORCE  ROW LEVEL SECURITY;
DROP POLICY IF EXISTS oncology_staging_tenant_isolation ON oncology_staging;
CREATE POLICY oncology_staging_tenant_isolation ON oncology_staging
    USING (tenant_id::text = current_setting('app.tenant_id', true))
    WITH CHECK (tenant_id::text = current_setting('app.tenant_id', true));

-- oncology_chemo_doses
CREATE TABLE IF NOT EXISTS oncology_chemo_doses (
    id                    BIGSERIAL PRIMARY KEY,
    tenant_id             BIGINT NOT NULL,
    patient_id            BIGINT NOT NULL REFERENCES patients(id) ON DELETE CASCADE,
    encounter_id          BIGINT REFERENCES encounters(id) ON DELETE SET NULL,
    prescribed_by         BIGINT NOT NULL REFERENCES users(id),
    drug_name             TEXT NOT NULL,
    dose_mg_per_m2        NUMERIC(10,2),
    bsa                   NUMERIC(5,2),
    calculated_dose_mg    NUMERIC(10,2),
    adjusted_dose_mg      NUMERIC(10,2),
    adjustments           JSONB,
    created_at            TIMESTAMPTZ NOT NULL DEFAULT now()
);

CREATE INDEX IF NOT EXISTS idx_oncology_chemo_tenant ON oncology_chemo_doses (tenant_id);
CREATE INDEX IF NOT EXISTS idx_oncology_chemo_patient ON oncology_chemo_doses (patient_id, created_at DESC);

ALTER TABLE oncology_chemo_doses ENABLE ROW LEVEL SECURITY;
ALTER TABLE oncology_chemo_doses FORCE  ROW LEVEL SECURITY;
DROP POLICY IF EXISTS oncology_chemo_tenant_isolation ON oncology_chemo_doses;
CREATE POLICY oncology_chemo_tenant_isolation ON oncology_chemo_doses
    USING (tenant_id::text = current_setting('app.tenant_id', true))
    WITH CHECK (tenant_id::text = current_setting('app.tenant_id', true));

-- nephrology_ckd_assessments
CREATE TABLE IF NOT EXISTS nephrology_ckd_assessments (
    id                          BIGSERIAL PRIMARY KEY,
    tenant_id                   BIGINT NOT NULL,
    patient_id                  BIGINT NOT NULL REFERENCES patients(id) ON DELETE CASCADE,
    encounter_id                BIGINT REFERENCES encounters(id) ON DELETE SET NULL,
    assessed_by                 BIGINT NOT NULL REFERENCES users(id),
    age                         INTEGER,
    sex                         TEXT,
    creatinine_mg_dL            NUMERIC(6,2),
    egfr                        NUMERIC(6,2),
    albuminuria_category        TEXT,
    kdigo_stage                 TEXT,
    risk_level                  TEXT,
    two_year_esrd_risk          NUMERIC(5,2),
    five_year_esrd_risk         NUMERIC(5,2),
    created_at                  TIMESTAMPTZ NOT NULL DEFAULT now()
);

CREATE INDEX IF NOT EXISTS idx_neph_ckd_tenant ON nephrology_ckd_assessments (tenant_id);
CREATE INDEX IF NOT EXISTS idx_neph_ckd_patient ON nephrology_ckd_assessments (patient_id, created_at DESC);

ALTER TABLE nephrology_ckd_assessments ENABLE ROW LEVEL SECURITY;
ALTER TABLE nephrology_ckd_assessments FORCE  ROW LEVEL SECURITY;
DROP POLICY IF EXISTS neph_ckd_tenant_isolation ON nephrology_ckd_assessments;
CREATE POLICY neph_ckd_tenant_isolation ON nephrology_ckd_assessments
    USING (tenant_id::text = current_setting('app.tenant_id', true))
    WITH CHECK (tenant_id::text = current_setting('app.tenant_id', true));

-- nephrology_hd_adequacy
CREATE TABLE IF NOT EXISTS nephrology_hd_adequacy (
    id                   BIGSERIAL PRIMARY KEY,
    tenant_id            BIGINT NOT NULL,
    patient_id           BIGINT NOT NULL REFERENCES patients(id) ON DELETE CASCADE,
    encounter_id         BIGINT REFERENCES encounters(id) ON DELETE SET NULL,
    assessed_by          BIGINT NOT NULL REFERENCES users(id),
    pre_bun_mg_dL        NUMERIC(6,2),
    post_bun_mg_dL       NUMERIC(6,2),
    spKtV                NUMERIC(5,2),
    weekly_ktv           NUMERIC(5,2),
    urr_pct              NUMERIC(5,2),
    adequacy             TEXT,
    created_at           TIMESTAMPTZ NOT NULL DEFAULT now()
);

CREATE INDEX IF NOT EXISTS idx_neph_hd_tenant ON nephrology_hd_adequacy (tenant_id);
CREATE INDEX IF NOT EXISTS idx_neph_hd_patient ON nephrology_hd_adequacy (patient_id, created_at DESC);

ALTER TABLE nephrology_hd_adequacy ENABLE ROW LEVEL SECURITY;
ALTER TABLE nephrology_hd_adequacy FORCE  ROW LEVEL SECURITY;
DROP POLICY IF EXISTS neph_hd_tenant_isolation ON nephrology_hd_adequacy;
CREATE POLICY neph_hd_tenant_isolation ON nephrology_hd_adequacy
    USING (tenant_id::text = current_setting('app.tenant_id', true))
    WITH CHECK (tenant_id::text = current_setting('app.tenant_id', true));

-- obgyn_partograph
CREATE TABLE IF NOT EXISTS obgyn_partograph (
    id                     BIGSERIAL PRIMARY KEY,
    tenant_id              BIGINT NOT NULL,
    patient_id             BIGINT NOT NULL REFERENCES patients(id) ON DELETE CASCADE,
    encounter_id           BIGINT REFERENCES encounters(id) ON DELETE SET NULL,
    assessed_by            BIGINT NOT NULL REFERENCES users(id),
    current_dilation_cm    NUMERIC(4,1),
    hours_since_4cm        NUMERIC(5,2),
    parity                 TEXT,
    contractions_per_10min INTEGER,
    descent_station        NUMERIC(3,1),
    severity               TEXT,
    action                 TEXT,
    created_at             TIMESTAMPTZ NOT NULL DEFAULT now()
);

CREATE INDEX IF NOT EXISTS idx_obgyn_parto_tenant ON obgyn_partograph (tenant_id);
CREATE INDEX IF NOT EXISTS idx_obgyn_parto_patient ON obgyn_partograph (patient_id, created_at DESC);

ALTER TABLE obgyn_partograph ENABLE ROW LEVEL SECURITY;
ALTER TABLE obgyn_partograph FORCE  ROW LEVEL SECURITY;
DROP POLICY IF EXISTS obgyn_parto_tenant_isolation ON obgyn_partograph;
CREATE POLICY obgyn_parto_tenant_isolation ON obgyn_partograph
    USING (tenant_id::text = current_setting('app.tenant_id', true))
    WITH CHECK (tenant_id::text = current_setting('app.tenant_id', true));

COMMIT;
