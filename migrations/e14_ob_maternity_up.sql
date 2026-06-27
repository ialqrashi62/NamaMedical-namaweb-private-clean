-- ============================================================================
-- Epic E14 — OB / Maternity migration (UP)  [CANDIDATE — DO NOT EXECUTE here]
-- Idempotent. Creates NEW obgyn_* tables only; FORCE RLS + canonical tenant policy.
-- tenant_id NOT NULL REFERENCES tenants(id), entity FK to patients / parent rows.
-- Authority fields (edd, living_children, apgar_*, gestational_age, efw_percentile,
-- risk/alert flags) are written by the server-side engine — never trusted from client.
-- Run order: this file -> *_validate.sql (assert) -> (rollback via *_down.sql).
-- ============================================================================

BEGIN;

-- 1) pregnancies -------------------------------------------------------------
CREATE TABLE IF NOT EXISTS obgyn_pregnancies (
    id SERIAL PRIMARY KEY,
    tenant_id INTEGER NOT NULL REFERENCES tenants(id),
    patient_id INTEGER NOT NULL REFERENCES patients(id),
    patient_name TEXT DEFAULT '',
    lmp DATE,
    edd DATE,                                   -- server-computed (Naegele); may be NULL if LMP absent
    gravida INTEGER DEFAULT 1,
    para INTEGER DEFAULT 0,
    abortions INTEGER DEFAULT 0,
    living_children INTEGER DEFAULT 0,          -- server-derived
    blood_group TEXT DEFAULT '',
    rh_factor TEXT DEFAULT '',
    risk_level TEXT DEFAULT 'Low',
    pre_pregnancy_weight REAL DEFAULT 0,
    height REAL DEFAULT 0,
    allergies TEXT DEFAULT '',
    chronic_conditions TEXT DEFAULT '',
    previous_cs INTEGER DEFAULT 0,
    previous_complications TEXT DEFAULT '',
    husband_name TEXT DEFAULT '',
    husband_blood_group TEXT DEFAULT '',
    attending_doctor TEXT DEFAULT '',
    status TEXT DEFAULT 'Active',               -- Active | Delivered | Miscarriage | Ectopic | Terminated
    delivery_date TIMESTAMP,
    delivery_type TEXT DEFAULT '',
    outcome TEXT DEFAULT '',
    created_by TEXT DEFAULT '',
    created_at TIMESTAMP DEFAULT CURRENT_TIMESTAMP,
    updated_at TIMESTAMP DEFAULT CURRENT_TIMESTAMP
);

-- 2) antenatal_visits --------------------------------------------------------
CREATE TABLE IF NOT EXISTS obgyn_antenatal_visits (
    id SERIAL PRIMARY KEY,
    tenant_id INTEGER NOT NULL REFERENCES tenants(id),
    pregnancy_id INTEGER NOT NULL REFERENCES obgyn_pregnancies(id),
    patient_id INTEGER NOT NULL REFERENCES patients(id),
    visit_number INTEGER DEFAULT 1,
    gestational_age TEXT DEFAULT '',            -- server-derived from LMP
    weight REAL DEFAULT 0,
    weight_gain REAL DEFAULT 0,
    blood_pressure TEXT DEFAULT '',
    systolic INTEGER DEFAULT 0,
    diastolic INTEGER DEFAULT 0,
    fundal_height REAL DEFAULT 0,
    fetal_heart_rate INTEGER DEFAULT 0,
    fetal_presentation TEXT DEFAULT '',
    fetal_movement TEXT DEFAULT 'Active',
    edema TEXT DEFAULT 'None',
    proteinuria TEXT DEFAULT 'Negative',
    glucose_urine TEXT DEFAULT 'Negative',
    hemoglobin REAL DEFAULT 0,
    complaints TEXT DEFAULT '',
    examination_notes TEXT DEFAULT '',
    plan TEXT DEFAULT '',
    next_visit DATE,
    doctor TEXT DEFAULT '',
    risk_flags TEXT DEFAULT '',                 -- server-classified
    created_at TIMESTAMP DEFAULT CURRENT_TIMESTAMP,
    updated_at TIMESTAMP DEFAULT CURRENT_TIMESTAMP
);

-- 3) partogram ---------------------------------------------------------------
CREATE TABLE IF NOT EXISTS obgyn_partogram (
    id SERIAL PRIMARY KEY,
    tenant_id INTEGER NOT NULL REFERENCES tenants(id),
    pregnancy_id INTEGER NOT NULL REFERENCES obgyn_pregnancies(id),
    patient_id INTEGER NOT NULL REFERENCES patients(id),
    cervical_dilation INTEGER DEFAULT 0,
    cervical_effacement INTEGER DEFAULT 0,
    descent_station INTEGER DEFAULT 0,
    contractions_per_10min INTEGER DEFAULT 0,
    contraction_duration INTEGER DEFAULT 0,
    contraction_intensity TEXT DEFAULT '',
    fetal_heart_rate_baseline INTEGER DEFAULT 0,
    fetal_heart_rate_variability TEXT DEFAULT '',
    decelerations TEXT DEFAULT 'None',
    molding TEXT DEFAULT 'None',
    caput_succedaneum TEXT DEFAULT 'None',
    meconium INTEGER DEFAULT 0,
    amniotic_fluid TEXT DEFAULT '',
    maternal_bp TEXT DEFAULT '',
    maternal_hr INTEGER DEFAULT 0,
    maternal_temp REAL DEFAULT 0,
    oxytocin_units REAL DEFAULT 0,
    notes TEXT DEFAULT '',
    alert_flags TEXT DEFAULT '',                -- server-classified
    recorded_by TEXT DEFAULT '',
    recorded_at TIMESTAMP DEFAULT CURRENT_TIMESTAMP
);

-- 4) ultrasounds -------------------------------------------------------------
CREATE TABLE IF NOT EXISTS obgyn_ultrasounds (
    id SERIAL PRIMARY KEY,
    tenant_id INTEGER NOT NULL REFERENCES tenants(id),
    pregnancy_id INTEGER NOT NULL REFERENCES obgyn_pregnancies(id),
    patient_id INTEGER NOT NULL REFERENCES patients(id),
    scan_type TEXT DEFAULT 'Routine',
    gestational_age TEXT DEFAULT '',            -- server-derived from biometry
    scan_date TIMESTAMP DEFAULT CURRENT_TIMESTAMP,
    bpd REAL DEFAULT 0,
    hc REAL DEFAULT 0,
    ac REAL DEFAULT 0,
    fl REAL DEFAULT 0,
    efw REAL DEFAULT 0,
    efw_percentile TEXT DEFAULT '',             -- server-computed band
    amniotic_fluid_index REAL DEFAULT 0,
    placenta_location TEXT DEFAULT '',
    placenta_grade TEXT DEFAULT '',
    fetal_heart_rate INTEGER DEFAULT 0,
    fetal_presentation TEXT DEFAULT '',
    fetal_gender TEXT DEFAULT 'Not determined',
    number_of_fetuses INTEGER DEFAULT 1,
    cervical_length REAL DEFAULT 0,
    anomalies TEXT DEFAULT '',
    findings TEXT DEFAULT '',
    impression TEXT DEFAULT '',
    performed_by TEXT DEFAULT '',
    created_at TIMESTAMP DEFAULT CURRENT_TIMESTAMP
);

-- 5) deliveries --------------------------------------------------------------
CREATE TABLE IF NOT EXISTS obgyn_deliveries (
    id SERIAL PRIMARY KEY,
    tenant_id INTEGER NOT NULL REFERENCES tenants(id),
    pregnancy_id INTEGER NOT NULL REFERENCES obgyn_pregnancies(id),
    patient_id INTEGER NOT NULL REFERENCES patients(id),
    admission_id INTEGER,
    delivery_date TIMESTAMP DEFAULT CURRENT_TIMESTAMP,
    gestational_age_at_delivery TEXT DEFAULT '',
    delivery_type TEXT DEFAULT 'NVD',
    delivery_method TEXT DEFAULT '',
    indication_for_cs TEXT DEFAULT '',
    anesthesia_type TEXT DEFAULT '',
    labor_duration_hours REAL DEFAULT 0,
    episiotomy INTEGER DEFAULT 0,
    perineal_tear TEXT DEFAULT 'None',
    blood_loss_ml INTEGER DEFAULT 0,
    placenta_delivery TEXT DEFAULT 'Complete',
    complications TEXT DEFAULT '',
    attending_doctor TEXT DEFAULT '',
    assisting_nurse TEXT DEFAULT '',
    anesthetist TEXT DEFAULT '',
    pediatrician TEXT DEFAULT '',
    notes TEXT DEFAULT '',
    apgar_1min INTEGER DEFAULT 0,               -- server-computed
    apgar_5min INTEGER DEFAULT 0,               -- server-computed
    baby_weight INTEGER DEFAULT 0,
    baby_length REAL DEFAULT 0,
    baby_head_circumference REAL DEFAULT 0,
    baby_gender TEXT DEFAULT '',
    baby_status TEXT DEFAULT 'Alive',
    baby_anomalies TEXT DEFAULT '',
    nicu_admission INTEGER DEFAULT 0,
    nicu_reason TEXT DEFAULT '',
    breastfeeding_initiated INTEGER DEFAULT 0,
    created_at TIMESTAMP DEFAULT CURRENT_TIMESTAMP,
    updated_at TIMESTAMP DEFAULT CURRENT_TIMESTAMP
);

-- 6) neonatal ----------------------------------------------------------------
CREATE TABLE IF NOT EXISTS obgyn_neonatal (
    id SERIAL PRIMARY KEY,
    tenant_id INTEGER NOT NULL REFERENCES tenants(id),
    delivery_id INTEGER NOT NULL REFERENCES obgyn_deliveries(id),
    baby_patient_id INTEGER REFERENCES patients(id),
    apgar_1min INTEGER DEFAULT 0,               -- server-computed
    apgar_5min INTEGER DEFAULT 0,               -- server-computed
    apgar_10min INTEGER DEFAULT 0,              -- server-computed
    birth_weight_grams INTEGER DEFAULT 0,
    length_cm REAL DEFAULT 0,
    head_circumference_cm REAL DEFAULT 0,
    blood_group TEXT DEFAULT '',
    coombs_test TEXT DEFAULT 'Not Done',
    resuscitation_needed INTEGER DEFAULT 0,
    resuscitation_type TEXT DEFAULT '',
    birth_injury TEXT DEFAULT '',
    jaundice_onset TEXT DEFAULT '',
    phototherapy_needed INTEGER DEFAULT 0,
    hypoglycemia INTEGER DEFAULT 0,
    hypothermia INTEGER DEFAULT 0,
    congenital_abnormalities TEXT DEFAULT '',
    feeding_type TEXT DEFAULT 'Breast',
    feeding_established INTEGER DEFAULT 0,
    discharge_destination TEXT DEFAULT 'Home',
    discharge_status TEXT DEFAULT 'Healthy',
    follow_up_plan TEXT DEFAULT '',
    recorded_by TEXT DEFAULT '',
    created_at TIMESTAMP DEFAULT CURRENT_TIMESTAMP,
    updated_at TIMESTAMP DEFAULT CURRENT_TIMESTAMP
);

-- 7) NST ---------------------------------------------------------------------
CREATE TABLE IF NOT EXISTS obgyn_nst (
    id SERIAL PRIMARY KEY,
    tenant_id INTEGER NOT NULL REFERENCES tenants(id),
    pregnancy_id INTEGER NOT NULL REFERENCES obgyn_pregnancies(id),
    patient_id INTEGER NOT NULL REFERENCES patients(id),
    duration_minutes INTEGER DEFAULT 20,
    baseline_fhr INTEGER DEFAULT 0,
    variability TEXT DEFAULT '',
    accelerations INTEGER DEFAULT 0,
    decelerations TEXT DEFAULT 'None',
    contractions INTEGER DEFAULT 0,
    result TEXT DEFAULT 'Reactive',
    interpretation TEXT DEFAULT '',
    action_taken TEXT DEFAULT '',
    performed_by TEXT DEFAULT '',
    created_at TIMESTAMP DEFAULT CURRENT_TIMESTAMP
);

-- 8) lab panels catalog ------------------------------------------------------
CREATE TABLE IF NOT EXISTS obgyn_lab_panels (
    id SERIAL PRIMARY KEY,
    tenant_id INTEGER NOT NULL REFERENCES tenants(id),
    panel_name TEXT DEFAULT '',
    panel_name_ar TEXT DEFAULT '',
    trimester TEXT DEFAULT '',
    tests TEXT DEFAULT '',
    is_active INTEGER DEFAULT 1
);

-- ===== Indexes (RLS + tenant filtering) =====
CREATE INDEX IF NOT EXISTS idx_obgyn_pregnancies_tenant_patient ON obgyn_pregnancies(tenant_id, patient_id);
CREATE INDEX IF NOT EXISTS idx_obgyn_pregnancies_tenant_status ON obgyn_pregnancies(tenant_id, status);
CREATE INDEX IF NOT EXISTS idx_obgyn_antenatal_tenant_pregnancy ON obgyn_antenatal_visits(tenant_id, pregnancy_id);
CREATE INDEX IF NOT EXISTS idx_obgyn_partogram_tenant_pregnancy ON obgyn_partogram(tenant_id, pregnancy_id);
CREATE INDEX IF NOT EXISTS idx_obgyn_ultrasounds_tenant_pregnancy ON obgyn_ultrasounds(tenant_id, pregnancy_id);
CREATE INDEX IF NOT EXISTS idx_obgyn_deliveries_tenant_pregnancy ON obgyn_deliveries(tenant_id, pregnancy_id);
CREATE INDEX IF NOT EXISTS idx_obgyn_neonatal_tenant_delivery ON obgyn_neonatal(tenant_id, delivery_id);
CREATE INDEX IF NOT EXISTS idx_obgyn_nst_tenant_pregnancy ON obgyn_nst(tenant_id, pregnancy_id);
CREATE INDEX IF NOT EXISTS idx_obgyn_lab_panels_tenant ON obgyn_lab_panels(tenant_id);

-- ===== FORCE Row-Level Security + canonical tenant policy =====
DO $$
DECLARE t TEXT;
BEGIN
    FOR t IN SELECT unnest(ARRAY[
        'obgyn_pregnancies','obgyn_antenatal_visits','obgyn_partogram','obgyn_ultrasounds',
        'obgyn_deliveries','obgyn_neonatal','obgyn_nst','obgyn_lab_panels'])
    LOOP
        EXECUTE format('ALTER TABLE %I ENABLE ROW LEVEL SECURITY', t);
        EXECUTE format('ALTER TABLE %I FORCE ROW LEVEL SECURITY', t);
        EXECUTE format('DROP POLICY IF EXISTS %I ON %I', t || '_tenant_isolation', t);
        EXECUTE format(
            'CREATE POLICY %I ON %I USING (tenant_id = NULLIF(current_setting(''app.tenant_id'', true), '''')::integer) WITH CHECK (tenant_id = NULLIF(current_setting(''app.tenant_id'', true), '''')::integer)',
            t || '_tenant_isolation', t);
    END LOOP;
END $$;

COMMIT;
