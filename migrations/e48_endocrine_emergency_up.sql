-- migrations/e48_endocrine_emergency_up.sql
-- Endocrinology + Emergency Department tables
-- Idempotent, tenant-scoped, RLS-enabled.

BEGIN;

-- ============================================================
-- insulin_doses
-- ============================================================
CREATE TABLE IF NOT EXISTS insulin_doses (
    id                       BIGSERIAL PRIMARY KEY,
    tenant_id                BIGINT NOT NULL,
    patient_id               BIGINT NOT NULL REFERENCES patients(id) ON DELETE CASCADE,
    encounter_id             BIGINT REFERENCES encounters(id) ON DELETE SET NULL,
    prescribed_by            BIGINT NOT NULL REFERENCES users(id),
    current_glucose_mg_dl    NUMERIC(6,1) NOT NULL,
    target_glucose_mg_dl     NUMERIC(5,1),
    total_daily_dose_units   NUMERIC(5,1),
    sensitivity_factor       NUMERIC(6,2),
    recommended_units        INTEGER,
    notes                    TEXT,
    created_at               TIMESTAMPTZ NOT NULL DEFAULT now()
);

CREATE INDEX IF NOT EXISTS idx_insulin_doses_tenant ON insulin_doses (tenant_id);
CREATE INDEX IF NOT EXISTS idx_insulin_doses_patient ON insulin_doses (patient_id, created_at DESC);

ALTER TABLE insulin_doses ENABLE ROW LEVEL SECURITY;
ALTER TABLE insulin_doses FORCE  ROW LEVEL SECURITY;
DROP POLICY IF EXISTS insulin_doses_tenant_isolation ON insulin_doses;
CREATE POLICY insulin_doses_tenant_isolation ON insulin_doses
    USING (tenant_id::text = current_setting('app.tenant_id', true))
    WITH CHECK (tenant_id::text = current_setting('app.tenant_id', true));

-- ============================================================
-- thyroid_assessments
-- ============================================================
CREATE TABLE IF NOT EXISTS thyroid_assessments (
    id              BIGSERIAL PRIMARY KEY,
    tenant_id       BIGINT NOT NULL,
    patient_id      BIGINT NOT NULL REFERENCES patients(id) ON DELETE CASCADE,
    encounter_id    BIGINT REFERENCES encounters(id) ON DELETE SET NULL,
    assessed_by     BIGINT NOT NULL REFERENCES users(id),
    tsh_uIuml       NUMERIC(7,3) NOT NULL,
    ft4_ngdl        NUMERIC(5,2),
    ft3_pgml        NUMERIC(6,2),
    interpretation  TEXT NOT NULL,
    recommendations JSONB,
    created_at      TIMESTAMPTZ NOT NULL DEFAULT now()
);

CREATE INDEX IF NOT EXISTS idx_thyroid_tenant ON thyroid_assessments (tenant_id);
CREATE INDEX IF NOT EXISTS idx_thyroid_patient ON thyroid_assessments (patient_id, created_at DESC);

ALTER TABLE thyroid_assessments ENABLE ROW LEVEL SECURITY;
ALTER TABLE thyroid_assessments FORCE  ROW LEVEL SECURITY;
DROP POLICY IF EXISTS thyroid_tenant_isolation ON thyroid_assessments;
CREATE POLICY thyroid_tenant_isolation ON thyroid_assessments
    USING (tenant_id::text = current_setting('app.tenant_id', true))
    WITH CHECK (tenant_id::text = current_setting('app.tenant_id', true));

-- ============================================================
-- er_triage
-- ============================================================
CREATE TABLE IF NOT EXISTS er_triage (
    id                  BIGSERIAL PRIMARY KEY,
    tenant_id           BIGINT NOT NULL,
    patient_id          BIGINT REFERENCES patients(id) ON DELETE SET NULL,
    triage_by           BIGINT NOT NULL REFERENCES users(id),
    chief_complaint     TEXT NOT NULL,
    age                 INTEGER,
    sex                 TEXT,
    heart_rate          INTEGER,
    systolic_bp         INTEGER,
    spo2_pct            NUMERIC(5,1),
    rr_per_min          INTEGER,
    temp_c              NUMERIC(4,1),
    pain_score          INTEGER,
    gcs_total           INTEGER,
    esi_level           INTEGER NOT NULL CHECK (esi_level BETWEEN 1 AND 5),
    recommended_action  TEXT,
    notes               TEXT,
    triage_time         TIMESTAMPTZ NOT NULL DEFAULT now(),
    status              TEXT DEFAULT 'waiting' CHECK (status IN ('waiting','in_progress','admitted','discharged','transferred','left_ama','expired')),
    assigned_to         BIGINT REFERENCES users(id)
);

CREATE INDEX IF NOT EXISTS idx_er_triage_tenant ON er_triage (tenant_id);
CREATE INDEX IF NOT EXISTS idx_er_triage_active ON er_triage (tenant_id, esi_level, triage_time) WHERE status = 'waiting';

ALTER TABLE er_triage ENABLE ROW LEVEL SECURITY;
ALTER TABLE er_triage FORCE  ROW LEVEL SECURITY;
DROP POLICY IF EXISTS er_triage_tenant_isolation ON er_triage;
CREATE POLICY er_triage_tenant_isolation ON er_triage
    USING (tenant_id::text = current_setting('app.tenant_id', true))
    WITH CHECK (tenant_id::text = current_setting('app.tenant_id', true));

-- ============================================================
-- er_queue (view-compatible table for active queue)
// ============================================================
CREATE TABLE IF NOT EXISTS er_queue (
    id                  BIGSERIAL PRIMARY KEY,
    tenant_id           BIGINT NOT NULL,
    triage_id           BIGINT REFERENCES er_triage(id) ON DELETE CASCADE,
    patient_id          BIGINT REFERENCES patients(id) ON DELETE SET NULL,
    esi_level           INTEGER NOT NULL,
    chief_complaint     TEXT,
    triage_time         TIMESTAMPTZ NOT NULL DEFAULT now(),
    recommended_action  TEXT,
    assigned_to         BIGINT REFERENCES users(id),
    status              TEXT DEFAULT 'waiting'
);

CREATE INDEX IF NOT EXISTS idx_er_queue_tenant ON er_queue (tenant_id);

ALTER TABLE er_queue ENABLE ROW LEVEL SECURITY;
ALTER TABLE er_queue FORCE  ROW LEVEL SECURITY;
DROP POLICY IF EXISTS er_queue_tenant_isolation ON er_queue;
CREATE POLICY er_queue_tenant_isolation ON er_queue
    USING (tenant_id::text = current_setting('app.tenant_id', true))
    WITH CHECK (tenant_id::text = current_setting('app.tenant_id', true));

-- ============================================================
-- er_trauma_assessments
-- ============================================================
CREATE TABLE IF NOT EXISTS er_trauma_assessments (
    id                BIGSERIAL PRIMARY KEY,
    tenant_id         BIGINT NOT NULL,
    patient_id        BIGINT NOT NULL REFERENCES patients(id) ON DELETE CASCADE,
    assessed_by       BIGINT NOT NULL REFERENCES users(id),
    ais_head          INTEGER,
    ais_face          INTEGER,
    ais_chest         INTEGER,
    ais_abdomen       INTEGER,
    ais_extremity     INTEGER,
    ais_external      INTEGER,
    iss_score         INTEGER,
    severity          TEXT,
    mechanism         TEXT,
    notes             TEXT,
    created_at        TIMESTAMPTZ NOT NULL DEFAULT now()
);

CREATE INDEX IF NOT EXISTS idx_er_trauma_tenant ON er_trauma_assessments (tenant_id);
CREATE INDEX IF NOT EXISTS idx_er_trauma_patient ON er_trauma_assessments (patient_id, created_at DESC);

ALTER TABLE er_trauma_assessments ENABLE ROW LEVEL SECURITY;
ALTER TABLE er_trauma_assessments FORCE  ROW LEVEL SECURITY;
DROP POLICY IF EXISTS er_trauma_tenant_isolation ON er_trauma_assessments;
CREATE POLICY er_trauma_tenant_isolation ON er_trauma_assessments
    USING (tenant_id::text = current_setting('app.tenant_id', true))
    WITH CHECK (tenant_id::text = current_setting('app.tenant_id', true));

COMMIT;
