-- ============================================================
-- e18_01_hr_workforce_up.sql
-- E18 — HR / Workforce: NEW tables only
--   hr_licenses        (SCFHS / professional-license tracking + server-side expiry alerts)
--   hr_shifts          (shift roster / scheduling, overlap-checked server-side)
--   hr_leave_requests  (leave state machine: requested -> approved | denied | cancelled)
--   hr_payroll_slips   (computed DRAFT payroll slips; GL posting GATED OFF by flag)
--   hr_competencies    (CME hours / SCFHS competency compliance)
-- CANDIDATE ONLY — DO NOT EXECUTE ON PRODUCTION WITHOUT EXPLICIT DDL APPROVAL (DB gate).
--
-- جداول جديدة كلياً => tenant_id INTEGER NOT NULL REFERENCES tenants(id) منذ الإنشاء + FORCE RLS
--   بالقالب القانوني + FK للكيان الأب (hr_employees). NOT مُضافة إلى bootstrap في db_postgres.js.
-- idempotent: CREATE TABLE/INDEX IF NOT EXISTS + DROP/CREATE POLICY IF EXISTS. BEGIN;…COMMIT;
--
-- ملاحظة: hr_employees/hr_leaves/hr_attendance/hr_salaries جداول موجودة مسبقاً (bootstrap) ولا
--   تُعدَّل هنا. كل منطق E18 الجديد يستخدم هذه الجداول الجديدة فقط.
-- ============================================================
BEGIN;

-- ===== hr_licenses: SCFHS / professional / document license tracking =====
CREATE TABLE IF NOT EXISTS hr_licenses (
    id              SERIAL PRIMARY KEY,
    employee_id     INTEGER NOT NULL REFERENCES hr_employees(id) ON DELETE CASCADE,
    license_type    TEXT NOT NULL DEFAULT 'SCFHS',
    license_number  TEXT DEFAULT '',
    authority       TEXT DEFAULT 'SCFHS',
    issue_date      DATE,
    expiry_date     DATE,
    alert_days      INTEGER NOT NULL DEFAULT 30,
    status          TEXT NOT NULL DEFAULT 'active',
    notes           TEXT DEFAULT '',
    created_by      TEXT DEFAULT '',
    created_at      TIMESTAMP DEFAULT now(),
    tenant_id       INTEGER NOT NULL REFERENCES tenants(id) ON DELETE CASCADE,
    facility_id     INTEGER,
    CONSTRAINT chk_hr_lic_status CHECK (status IN ('active','suspended','revoked','expired')),
    CONSTRAINT chk_hr_lic_alert_nonneg CHECK (alert_days >= 0)
);
CREATE INDEX IF NOT EXISTS idx_hr_lic_tenant_id ON hr_licenses (tenant_id);
CREATE INDEX IF NOT EXISTS idx_hr_lic_emp ON hr_licenses (tenant_id, employee_id);
CREATE INDEX IF NOT EXISTS idx_hr_lic_expiry ON hr_licenses (tenant_id, expiry_date);
ALTER TABLE hr_licenses ENABLE ROW LEVEL SECURITY;
ALTER TABLE hr_licenses FORCE ROW LEVEL SECURITY;
DROP POLICY IF EXISTS rls_hr_lic_tenant_isolation ON hr_licenses;
CREATE POLICY rls_hr_lic_tenant_isolation ON hr_licenses
    FOR ALL
    USING (tenant_id = NULLIF(current_setting('app.tenant_id', true), '')::integer)
    WITH CHECK (tenant_id = NULLIF(current_setting('app.tenant_id', true), '')::integer);

-- ===== hr_shifts: shift roster / scheduling =====
CREATE TABLE IF NOT EXISTS hr_shifts (
    id              SERIAL PRIMARY KEY,
    employee_id     INTEGER NOT NULL REFERENCES hr_employees(id) ON DELETE CASCADE,
    shift_date      DATE NOT NULL,
    shift_name      TEXT DEFAULT '',
    start_time      TEXT NOT NULL DEFAULT '',
    end_time        TEXT NOT NULL DEFAULT '',
    department      TEXT DEFAULT '',
    status          TEXT NOT NULL DEFAULT 'scheduled',
    notes           TEXT DEFAULT '',
    created_by      TEXT DEFAULT '',
    created_at      TIMESTAMP DEFAULT now(),
    tenant_id       INTEGER NOT NULL REFERENCES tenants(id) ON DELETE CASCADE,
    facility_id     INTEGER,
    branch_id       INTEGER,
    CONSTRAINT chk_hr_shift_status CHECK (status IN ('scheduled','completed','cancelled'))
);
CREATE INDEX IF NOT EXISTS idx_hr_shift_tenant_id ON hr_shifts (tenant_id);
CREATE INDEX IF NOT EXISTS idx_hr_shift_emp_date ON hr_shifts (tenant_id, employee_id, shift_date);
ALTER TABLE hr_shifts ENABLE ROW LEVEL SECURITY;
ALTER TABLE hr_shifts FORCE ROW LEVEL SECURITY;
DROP POLICY IF EXISTS rls_hr_shift_tenant_isolation ON hr_shifts;
CREATE POLICY rls_hr_shift_tenant_isolation ON hr_shifts
    FOR ALL
    USING (tenant_id = NULLIF(current_setting('app.tenant_id', true), '')::integer)
    WITH CHECK (tenant_id = NULLIF(current_setting('app.tenant_id', true), '')::integer);

-- ===== hr_leave_requests: state machine requested -> approved | denied | cancelled =====
CREATE TABLE IF NOT EXISTS hr_leave_requests (
    id              SERIAL PRIMARY KEY,
    employee_id     INTEGER NOT NULL REFERENCES hr_employees(id) ON DELETE CASCADE,
    leave_type      TEXT NOT NULL DEFAULT 'Annual',
    start_date      DATE NOT NULL,
    end_date        DATE NOT NULL,
    days            INTEGER NOT NULL DEFAULT 0,
    status          TEXT NOT NULL DEFAULT 'requested',
    reason          TEXT DEFAULT '',
    requested_by    TEXT DEFAULT '',
    approved_by     TEXT DEFAULT '',
    approved_at     TIMESTAMP,
    denial_reason   TEXT DEFAULT '',
    created_at      TIMESTAMP DEFAULT now(),
    tenant_id       INTEGER NOT NULL REFERENCES tenants(id) ON DELETE CASCADE,
    facility_id     INTEGER,
    CONSTRAINT chk_hr_leave_status CHECK (status IN ('requested','approved','denied','cancelled')),
    CONSTRAINT chk_hr_leave_days_pos CHECK (days > 0)
);
CREATE INDEX IF NOT EXISTS idx_hr_leave_req_tenant_id ON hr_leave_requests (tenant_id);
CREATE INDEX IF NOT EXISTS idx_hr_leave_req_emp ON hr_leave_requests (tenant_id, employee_id);
ALTER TABLE hr_leave_requests ENABLE ROW LEVEL SECURITY;
ALTER TABLE hr_leave_requests FORCE ROW LEVEL SECURITY;
DROP POLICY IF EXISTS rls_hr_leave_req_tenant_isolation ON hr_leave_requests;
CREATE POLICY rls_hr_leave_req_tenant_isolation ON hr_leave_requests
    FOR ALL
    USING (tenant_id = NULLIF(current_setting('app.tenant_id', true), '')::integer)
    WITH CHECK (tenant_id = NULLIF(current_setting('app.tenant_id', true), '')::integer);

-- ===== hr_payroll_slips: computed DRAFT slips. GL posting GATED OFF by flag =====
CREATE TABLE IF NOT EXISTS hr_payroll_slips (
    id                  SERIAL PRIMARY KEY,
    employee_id         INTEGER NOT NULL REFERENCES hr_employees(id) ON DELETE CASCADE,
    pay_month           TEXT NOT NULL DEFAULT '',
    basic               REAL NOT NULL DEFAULT 0,
    housing_allowance   REAL NOT NULL DEFAULT 0,
    transport_allowance REAL NOT NULL DEFAULT 0,
    other_allowances    REAL NOT NULL DEFAULT 0,
    gross_earnings      REAL NOT NULL DEFAULT 0,
    gosi_deduction      REAL NOT NULL DEFAULT 0,
    advances_deducted   REAL NOT NULL DEFAULT 0,
    other_deductions    REAL NOT NULL DEFAULT 0,
    total_deductions    REAL NOT NULL DEFAULT 0,
    net_salary          REAL NOT NULL DEFAULT 0,
    status              TEXT NOT NULL DEFAULT 'draft',
    posted              INTEGER NOT NULL DEFAULT 0,
    posted_at           TIMESTAMP,
    journal_entry_id    INTEGER,
    created_by          TEXT DEFAULT '',
    created_at          TIMESTAMP DEFAULT now(),
    tenant_id           INTEGER NOT NULL REFERENCES tenants(id) ON DELETE CASCADE,
    facility_id         INTEGER,
    CONSTRAINT chk_hr_slip_status CHECK (status IN ('draft','approved','posted','cancelled')),
    CONSTRAINT chk_hr_slip_net_nonneg CHECK (net_salary >= 0),
    CONSTRAINT chk_hr_slip_posted_flag CHECK (posted IN (0,1)),
    CONSTRAINT uq_hr_slip_emp_month UNIQUE (tenant_id, employee_id, pay_month)
);
CREATE INDEX IF NOT EXISTS idx_hr_slip_tenant_id ON hr_payroll_slips (tenant_id);
CREATE INDEX IF NOT EXISTS idx_hr_slip_emp_month ON hr_payroll_slips (tenant_id, employee_id, pay_month);
ALTER TABLE hr_payroll_slips ENABLE ROW LEVEL SECURITY;
ALTER TABLE hr_payroll_slips FORCE ROW LEVEL SECURITY;
DROP POLICY IF EXISTS rls_hr_slip_tenant_isolation ON hr_payroll_slips;
CREATE POLICY rls_hr_slip_tenant_isolation ON hr_payroll_slips
    FOR ALL
    USING (tenant_id = NULLIF(current_setting('app.tenant_id', true), '')::integer)
    WITH CHECK (tenant_id = NULLIF(current_setting('app.tenant_id', true), '')::integer);

-- ===== hr_competencies: CME hours / SCFHS competency compliance =====
CREATE TABLE IF NOT EXISTS hr_competencies (
    id              SERIAL PRIMARY KEY,
    employee_id     INTEGER NOT NULL REFERENCES hr_employees(id) ON DELETE CASCADE,
    competency_name TEXT NOT NULL DEFAULT '',
    cme_hours       REAL NOT NULL DEFAULT 0,
    required_hours  REAL NOT NULL DEFAULT 0,
    period_start    DATE,
    period_end      DATE,
    status          TEXT NOT NULL DEFAULT 'in_progress',
    notes           TEXT DEFAULT '',
    created_by      TEXT DEFAULT '',
    created_at      TIMESTAMP DEFAULT now(),
    tenant_id       INTEGER NOT NULL REFERENCES tenants(id) ON DELETE CASCADE,
    facility_id     INTEGER,
    CONSTRAINT chk_hr_comp_status CHECK (status IN ('in_progress','compliant','non_compliant')),
    CONSTRAINT chk_hr_comp_hours_nonneg CHECK (cme_hours >= 0 AND required_hours >= 0)
);
CREATE INDEX IF NOT EXISTS idx_hr_comp_tenant_id ON hr_competencies (tenant_id);
CREATE INDEX IF NOT EXISTS idx_hr_comp_emp ON hr_competencies (tenant_id, employee_id);
ALTER TABLE hr_competencies ENABLE ROW LEVEL SECURITY;
ALTER TABLE hr_competencies FORCE ROW LEVEL SECURITY;
DROP POLICY IF EXISTS rls_hr_comp_tenant_isolation ON hr_competencies;
CREATE POLICY rls_hr_comp_tenant_isolation ON hr_competencies
    FOR ALL
    USING (tenant_id = NULLIF(current_setting('app.tenant_id', true), '')::integer)
    WITH CHECK (tenant_id = NULLIF(current_setting('app.tenant_id', true), '')::integer);

COMMIT;
