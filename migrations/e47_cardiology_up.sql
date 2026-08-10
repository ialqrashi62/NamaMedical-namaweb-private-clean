-- migrations/e47_cardiology_up.sql
-- Cardiology module: GRACE/CHA2DS2-VASc/HAS-BLED/HF stage + troponin + STEMI
-- Idempotent (CREATE IF NOT EXISTS), tenant-scoped, RLS-enabled.

BEGIN;

-- ============================================================
-- cardiology_assessments: stores any cardiology risk score
-- ============================================================
CREATE TABLE IF NOT EXISTS cardiology_assessments (
    id              BIGSERIAL PRIMARY KEY,
    tenant_id       BIGINT NOT NULL,
    patient_id      BIGINT NOT NULL REFERENCES patients(id) ON DELETE CASCADE,
    encounter_id    BIGINT REFERENCES encounters(id) ON DELETE SET NULL,
    assessed_by     BIGINT NOT NULL REFERENCES users(id),
    assessment_type TEXT NOT NULL CHECK (assessment_type IN
                       ('grace', 'cha2ds2vasc', 'hasbled', 'hf_class', 'troponin', 'stemi')),
    score           INTEGER,
    risk            TEXT,
    payload         JSONB NOT NULL,
    recommendations JSONB,
    created_at      TIMESTAMPTZ NOT NULL DEFAULT now(),
    updated_at      TIMESTAMPTZ NOT NULL DEFAULT now(),
    deleted_at      TIMESTAMPTZ
);

CREATE INDEX IF NOT EXISTS idx_cardiology_assessments_tenant ON cardiology_assessments (tenant_id);
CREATE INDEX IF NOT EXISTS idx_cardiology_assessments_patient ON cardiology_assessments (patient_id, created_at DESC);
CREATE INDEX IF NOT EXISTS idx_cardiology_assessments_type ON cardiology_assessments (assessment_type, created_at DESC);

ALTER TABLE cardiology_assessments ENABLE ROW LEVEL SECURITY;
ALTER TABLE cardiology_assessments FORCE  ROW LEVEL SECURITY;

DROP POLICY IF EXISTS cardiology_assessments_tenant_isolation ON cardiology_assessments;
CREATE POLICY cardiology_assessments_tenant_isolation ON cardiology_assessments
    USING (tenant_id::text = current_setting('app.tenant_id', true))
    WITH CHECK (tenant_id::text = current_setting('app.tenant_id', true));

-- ============================================================
-- cardiology_ecg_reports: ECG reports
-- ============================================================
CREATE TABLE IF NOT EXISTS cardiology_ecg_reports (
    id              BIGSERIAL PRIMARY KEY,
    tenant_id       BIGINT NOT NULL,
    patient_id      BIGINT NOT NULL REFERENCES patients(id) ON DELETE CASCADE,
    encounter_id    BIGINT REFERENCES encounters(id) ON DELETE SET NULL,
    recorded_at     TIMESTAMPTZ NOT NULL,
    rhythm          TEXT NOT NULL,
    rate_bpm        INTEGER NOT NULL CHECK (rate_bpm BETWEEN 20 AND 300),
    pr_interval_ms  INTEGER CHECK (pr_interval_ms IS NULL OR pr_interval_ms BETWEEN 50 AND 500),
    qrs_duration_ms INTEGER CHECK (qrs_duration_ms IS NULL OR qrs_duration_ms BETWEEN 50 AND 300),
    qt_interval_ms  INTEGER CHECK (qt_interval_ms IS NULL OR qt_interval_ms BETWEEN 200 AND 800),
    qtc_ms          INTEGER CHECK (qtc_ms IS NULL OR qtc_ms BETWEEN 200 AND 800),
    interpretation  TEXT,
    st_changes      JSONB,
    is_stemi        BOOLEAN DEFAULT FALSE,
    stemi_territory TEXT CHECK (stemi_territory IN ('anterior','inferior','lateral','posterior', NULL)),
    file_url        TEXT,
    signed_by       BIGINT REFERENCES users(id),
    signed_at       TIMESTAMPTZ,
    created_at      TIMESTAMPTZ NOT NULL DEFAULT now(),
    updated_at      TIMESTAMPTZ NOT NULL DEFAULT now(),
    deleted_at      TIMESTAMPTZ
);

CREATE INDEX IF NOT EXISTS idx_cardiology_ecg_tenant ON cardiology_ecg_reports (tenant_id);
CREATE INDEX IF NOT EXISTS idx_cardiology_ecg_patient ON cardiology_ecg_reports (patient_id, recorded_at DESC);
CREATE INDEX IF NOT EXISTS idx_cardiology_ecg_stemi ON cardiology_ecg_reports (is_stemi, recorded_at DESC) WHERE is_stemi = TRUE;

ALTER TABLE cardiology_ecg_reports ENABLE ROW LEVEL SECURITY;
ALTER TABLE cardiology_ecg_reports FORCE  ROW LEVEL SECURITY;

DROP POLICY IF EXISTS cardiology_ecg_reports_tenant_isolation ON cardiology_ecg_reports;
CREATE POLICY cardiology_ecg_reports_tenant_isolation ON cardiology_ecg_reports
    USING (tenant_id::text = current_setting('app.tenant_id', true))
    WITH CHECK (tenant_id::text = current_setting('app.tenant_id', true));

-- ============================================================
-- cardiology_medications: cardiac-specific medication tracking
-- (separated from generic medication module for cardiology workflows)
-- ============================================================
CREATE TABLE IF NOT EXISTS cardiology_medications (
    id              BIGSERIAL PRIMARY KEY,
    tenant_id       BIGINT NOT NULL,
    patient_id      BIGINT NOT NULL REFERENCES patients(id) ON DELETE CASCADE,
    encounter_id    BIGINT REFERENCES encounters(id) ON DELETE SET NULL,
    drug_class      TEXT NOT NULL CHECK (drug_class IN
                       ('antiplatelet', 'anticoagulant', 'statin', 'betablocker',
                        'acei', 'arb', 'arni', 'mra', 'sglt2', 'ccb', 'diuretic',
                        'antiarrhythmic', 'digoxin', 'ivabradine', 'hydralazine',
                        'nitrate', 'pcsk9')),
    drug_name       TEXT NOT NULL,
    dose_mg         NUMERIC(10,2) NOT NULL,
    frequency       TEXT NOT NULL,
    indication      TEXT,
    started_at      TIMESTAMPTZ NOT NULL DEFAULT now(),
    stopped_at      TIMESTAMPTZ,
    prescribed_by   BIGINT NOT NULL REFERENCES users(id),
    notes           TEXT,
    created_at      TIMESTAMPTZ NOT NULL DEFAULT now(),
    updated_at      TIMESTAMPTZ NOT NULL DEFAULT now()
);

CREATE INDEX IF NOT EXISTS idx_cardiology_meds_tenant ON cardiology_medications (tenant_id);
CREATE INDEX IF NOT EXISTS idx_cardiology_meds_patient ON cardiology_medications (patient_id, started_at DESC);
CREATE INDEX IF NOT EXISTS idx_cardiology_meds_active ON cardiology_medications (patient_id) WHERE stopped_at IS NULL;

ALTER TABLE cardiology_medications ENABLE ROW LEVEL SECURITY;
ALTER TABLE cardiology_medications FORCE  ROW LEVEL SECURITY;

DROP POLICY IF EXISTS cardiology_meds_tenant_isolation ON cardiology_medications;
CREATE POLICY cardiology_meds_tenant_isolation ON cardiology_medications
    USING (tenant_id::text = current_setting('app.tenant_id', true))
    WITH CHECK (tenant_id::text = current_setting('app.tenant_id', true));

-- ============================================================
-- cardiology_procedures: cardiac procedures (CABG, PCI, EP study, etc.)
-- ============================================================
CREATE TABLE IF NOT EXISTS cardiology_procedures (
    id                  BIGSERIAL PRIMARY KEY,
    tenant_id           BIGINT NOT NULL,
    patient_id          BIGINT NOT NULL REFERENCES patients(id) ON DELETE CASCADE,
    encounter_id        BIGINT REFERENCES encounters(id) ON DELETE SET NULL,
    procedure_type      TEXT NOT NULL CHECK (procedure_type IN
                           ('cag', 'pci', 'cabg', 'valve_replacement', 'valve_repair',
                            'icd_implant', 'ppm_implant', 'crt_implant', 'ablation',
                            'tavr', 'mitraclip', 'watchman', 'iabp', 'impella', 'ecmo_cannulation',
                            'pericardiocentesis')),
    procedure_date      TIMESTAMPTZ NOT NULL,
    operator            BIGINT REFERENCES users(id),
    indication          TEXT,
    findings            TEXT,
    complications       TEXT,
    cci_score           INTEGER CHECK (cci_score IS NULL OR cci_score BETWEEN 0 AND 4),
    contrast_used_ml    INTEGER,
    fluoroscopy_min     INTEGER,
    stent_count         INTEGER,
    stent_types         TEXT[],
    successful          BOOLEAN DEFAULT TRUE,
    notes               TEXT,
    created_at          TIMESTAMPTZ NOT NULL DEFAULT now(),
    updated_at          TIMESTAMPTZ NOT NULL DEFAULT now()
);

CREATE INDEX IF NOT EXISTS idx_cardiology_proc_tenant ON cardiology_procedures (tenant_id);
CREATE INDEX IF NOT EXISTS idx_cardiology_proc_patient ON cardiology_procedures (patient_id, procedure_date DESC);
CREATE INDEX IF NOT EXISTS idx_cardiology_proc_type ON cardiology_procedures (procedure_type, procedure_date DESC);

ALTER TABLE cardiology_procedures ENABLE ROW LEVEL SECURITY;
ALTER TABLE cardiology_procedures FORCE  ROW LEVEL SECURITY;

DROP POLICY IF EXISTS cardiology_proc_tenant_isolation ON cardiology_procedures;
CREATE POLICY cardiology_proc_tenant_isolation ON cardiology_procedures
    USING (tenant_id::text = current_setting('app.tenant_id', true))
    WITH CHECK (tenant_id::text = current_setting('app.tenant_id', true));

COMMIT;
