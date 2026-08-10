-- migrations/e49_pediatrics_surgery_pharmacy_up.sql
-- Pediatrics + Surgery + Pharmacy tables
-- Idempotent, tenant-scoped, RLS-enabled.

BEGIN;

-- ============================================================
-- pediatrics_apgar
-- ============================================================
CREATE TABLE IF NOT EXISTS pediatrics_apgar (
    id              BIGSERIAL PRIMARY KEY,
    tenant_id       BIGINT NOT NULL,
    patient_id      BIGINT NOT NULL REFERENCES patients(id) ON DELETE CASCADE,
    encounter_id    BIGINT REFERENCES encounters(id) ON DELETE SET NULL,
    assessed_by     BIGINT NOT NULL REFERENCES users(id),
    time_minutes    INTEGER DEFAULT 5,
    appearance      INTEGER NOT NULL CHECK (appearance BETWEEN 0 AND 2),
    pulse           INTEGER NOT NULL CHECK (pulse BETWEEN 0 AND 2),
    grimace         INTEGER NOT NULL CHECK (grimace BETWEEN 0 AND 2),
    activity        INTEGER NOT NULL CHECK (activity BETWEEN 0 AND 2),
    respiration     INTEGER NOT NULL CHECK (respiration BETWEEN 0 AND 2),
    score           INTEGER NOT NULL,
    interpretation  TEXT,
    action          TEXT,
    created_at      TIMESTAMPTZ NOT NULL DEFAULT now()
);

CREATE INDEX IF NOT EXISTS idx_pediatrics_apgar_tenant ON pediatrics_apgar (tenant_id);
CREATE INDEX IF NOT EXISTS idx_pediatrics_apgar_patient ON pediatrics_apgar (patient_id, created_at DESC);

ALTER TABLE pediatrics_apgar ENABLE ROW LEVEL SECURITY;
ALTER TABLE pediatrics_apgar FORCE  ROW LEVEL SECURITY;
DROP POLICY IF EXISTS pediatrics_apgar_tenant_isolation ON pediatrics_apgar;
CREATE POLICY pediatrics_apgar_tenant_isolation ON pediatrics_apgar
    USING (tenant_id::text = current_setting('app.tenant_id', true))
    WITH CHECK (tenant_id::text = current_setting('app.tenant_id', true));

-- ============================================================
-- surgery_asa_assessments
-- ============================================================
CREATE TABLE IF NOT EXISTS surgery_asa_assessments (
    id              BIGSERIAL PRIMARY KEY,
    tenant_id       BIGINT NOT NULL,
    patient_id      BIGINT NOT NULL REFERENCES patients(id) ON DELETE CASCADE,
    encounter_id    BIGINT REFERENCES encounters(id) ON DELETE SET NULL,
    assessed_by     BIGINT NOT NULL REFERENCES users(id),
    asa_class       INTEGER NOT NULL CHECK (asa_class BETWEEN 1 AND 6),
    emergency       BOOLEAN DEFAULT FALSE,
    label           TEXT,
    mortality_pct   NUMERIC(5,2),
    recommendation  TEXT,
    created_at      TIMESTAMPTZ NOT NULL DEFAULT now()
);

CREATE INDEX IF NOT EXISTS idx_surgery_asa_tenant ON surgery_asa_assessments (tenant_id);
CREATE INDEX IF NOT EXISTS idx_surgery_asa_patient ON surgery_asa_assessments (patient_id, created_at DESC);

ALTER TABLE surgery_asa_assessments ENABLE ROW LEVEL SECURITY;
ALTER TABLE surgery_asa_assessments FORCE  ROW LEVEL SECURITY;
DROP POLICY IF EXISTS surgery_asa_tenant_isolation ON surgery_asa_assessments;
CREATE POLICY surgery_asa_tenant_isolation ON surgery_asa_assessments
    USING (tenant_id::text = current_setting('app.tenant_id', true))
    WITH CHECK (tenant_id::text = current_setting('app.tenant_id', true));

-- ============================================================
-- surgery_timeouts (WHO checklist)
-- ============================================================
CREATE TABLE IF NOT EXISTS surgery_timeouts (
    id              BIGSERIAL PRIMARY KEY,
    tenant_id       BIGINT NOT NULL,
    patient_id      BIGINT NOT NULL REFERENCES patients(id) ON DELETE CASCADE,
    encounter_id    BIGINT REFERENCES encounters(id) ON DELETE SET NULL,
    assessed_by     BIGINT NOT NULL REFERENCES users(id),
    phase           TEXT NOT NULL CHECK (phase IN ('sign_in','time_out','sign_out')),
    completed_items TEXT,
    missing_items   TEXT,
    completion_pct  INTEGER,
    status          TEXT,
    can_proceed     BOOLEAN,
    created_at      TIMESTAMPTZ NOT NULL DEFAULT now()
);

CREATE INDEX IF NOT EXISTS idx_surgery_timeout_tenant ON surgery_timeouts (tenant_id);
CREATE INDEX IF NOT EXISTS idx_surgery_timeout_patient ON surgery_timeouts (patient_id, created_at DESC);

ALTER TABLE surgery_timeouts ENABLE ROW LEVEL SECURITY;
ALTER TABLE surgery_timeouts FORCE  ROW LEVEL SECURITY;
DROP POLICY IF EXISTS surgery_timeout_tenant_isolation ON surgery_timeouts;
CREATE POLICY surgery_timeout_tenant_isolation ON surgery_timeouts
    USING (tenant_id::text = current_setting('app.tenant_id', true))
    WITH CHECK (tenant_id::text = current_setting('app.tenant_id', true));

-- ============================================================
-- drug_interaction_checks
-- ============================================================
CREATE TABLE IF NOT EXISTS drug_interaction_checks (
    id                BIGSERIAL PRIMARY KEY,
    tenant_id         BIGINT NOT NULL,
    patient_id        BIGINT NOT NULL REFERENCES patients(id) ON DELETE CASCADE,
    encounter_id      BIGINT REFERENCES encounters(id) ON DELETE SET NULL,
    checked_by        BIGINT NOT NULL REFERENCES users(id),
    drugs             TEXT NOT NULL,
    interactions_json JSONB,
    highest_severity  TEXT,
    created_at        TIMESTAMPTZ NOT NULL DEFAULT now()
);

CREATE INDEX IF NOT EXISTS idx_drug_int_tenant ON drug_interaction_checks (tenant_id);
CREATE INDEX IF NOT EXISTS idx_drug_int_patient ON drug_interaction_checks (patient_id, created_at DESC);

ALTER TABLE drug_interaction_checks ENABLE ROW LEVEL SECURITY;
ALTER TABLE drug_interaction_checks FORCE  ROW LEVEL SECURITY;
DROP POLICY IF EXISTS drug_int_tenant_isolation ON drug_interaction_checks;
CREATE POLICY drug_int_tenant_isolation ON drug_interaction_checks
    USING (tenant_id::text = current_setting('app.tenant_id', true))
    WITH CHECK (tenant_id::text = current_setting('app.tenant_id', true));

-- ============================================================
-- renal_dose_adjustments
-- ============================================================
CREATE TABLE IF NOT EXISTS renal_dose_adjustments (
    id                  BIGSERIAL PRIMARY KEY,
    tenant_id           BIGINT NOT NULL,
    patient_id          BIGINT NOT NULL REFERENCES patients(id) ON DELETE CASCADE,
    encounter_id        BIGINT REFERENCES encounters(id) ON DELETE SET NULL,
    adjusted_by         BIGINT NOT NULL REFERENCES users(id),
    drug_name           TEXT NOT NULL,
    standard_dose_mg    NUMERIC(10,2),
    crcl_ml_per_min     NUMERIC(6,2),
    ckd_stage           TEXT,
    adjustment_factor   NUMERIC(4,2),
    adjusted_dose_mg    NUMERIC(10,2),
    frequency_per_day   INTEGER,
    recommendation      TEXT,
    created_at          TIMESTAMPTZ NOT NULL DEFAULT now()
);

CREATE INDEX IF NOT EXISTS idx_renal_dose_tenant ON renal_dose_adjustments (tenant_id);
CREATE INDEX IF NOT EXISTS idx_renal_dose_patient ON renal_dose_adjustments (patient_id, created_at DESC);

ALTER TABLE renal_dose_adjustments ENABLE ROW LEVEL SECURITY;
ALTER TABLE renal_dose_adjustments FORCE  ROW LEVEL SECURITY;
DROP POLICY IF EXISTS renal_dose_tenant_isolation ON renal_dose_adjustments;
CREATE POLICY renal_dose_tenant_isolation ON renal_dose_adjustments
    USING (tenant_id::text = current_setting('app.tenant_id', true))
    WITH CHECK (tenant_id::text = current_setting('app.tenant_id', true));

COMMIT;
