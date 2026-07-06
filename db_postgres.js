// PostgreSQL Database Layer - Full schema matching database.js
const { Pool } = require('pg');
const path = require('path');
if (process.env.NODE_ENV === 'staging') {
    const fs = require('fs');
    const envPath = path.join(__dirname, '.env.staging');
    if (!fs.existsSync(envPath)) {
        throw new Error('CRITICAL: .env.staging file is missing in staging mode! Staging must fail closed.');
    }
    // Delete existing DB env vars to prevent inheritance from parent process overriding staging config
    delete process.env.DB_HOST;
    delete process.env.DB_PORT;
    delete process.env.DB_NAME;
    delete process.env.DB_USER;
    delete process.env.DB_PASSWORD;
    
    const existingPort = process.env.PORT;
    require('dotenv').config({ path: envPath, override: true });
    if (existingPort) {
        process.env.PORT = existingPort;
    }
    
    if (!process.env.DB_NAME || process.env.DB_NAME === 'nama_medical_web') {
        throw new Error('CRITICAL: Invalid DB_NAME in staging mode! Must not connect to production database.');
    }
} else {
    require('dotenv').config();
}

const pool = new Pool({
    host: process.env.DB_HOST || 'localhost',
    port: parseInt(process.env.DB_PORT) || 5432,
    database: process.env.DB_NAME || 'nama_medical_web',
    user: process.env.DB_USER || 'postgres',
    password: process.env.DB_PASSWORD || (process.env.NODE_ENV === 'production' ? (() => { throw new Error('DB_PASSWORD is required in production'); })() : 'postgres'),
    max: parseInt(process.env.DB_MAX_CONNECTIONS) || 20,
    idleTimeoutMillis: process.env.NODE_ENV === 'production' ? 30000 : 1000
});

// ===== TENANT CONTEXT WIRING FOR ROW LEVEL SECURITY (ported from security line 10ded01) =====
// Binds app.tenant_id per-request via AsyncLocalStorage. FORCE-RLS policies read
// current_setting('app.tenant_id'); the app uses pool.query directly, so without this the
// session tenant is never set and every protected-table query returns 0 / fails WITH CHECK.
const { tenantStore, runWithTenant, getCurrentTenantId } = require('./tenant_context');
const _poolQuery = pool.query.bind(pool);
pool.query = function (text, params) {
    const tid = getCurrentTenantId();
    // No tenant context (login/health/init) -> original behavior unchanged.
    if (!tid) return _poolQuery(text, params);
    return (async () => {
        const client = await pool.connect();
        try {
            await client.query("SELECT set_config('app.tenant_id', $1, false)", [String(tid)]);
            return params === undefined ? await client.query(text) : await client.query(text, params);
        } finally {
            try { await client.query("SELECT set_config('app.tenant_id', '', false)"); } catch (e) { /* reset best-effort */ }
            client.release();
        }
    })();
};

async function query(sql, params = []) {
    const result = await pool.query(sql, params);
    return result;
}

function getPool() { return pool; }

async function initDatabase() {
    // Ported from security line 10ded01: in production the schema already exists and the app
    // runs as a non-superuser (nama_medical_app) without CREATE on schema public, so running
    // CREATE TABLE/migrations here fails with "permission denied for schema public" and crashes
    // the app. Skip init/seed in production (tables/migrations are managed out-of-band).
    // SKIP_DB_INIT accepts '1'/'true'/'yes'. Tests spawn the server with SKIP_DB_INIT:'1'; the old strict
    // === 'true' check silently ignored '1', so initDatabase ran and CREATE TABLE failed with
    // "permission denied for schema public" under the non-superuser app role (crashing the spawned
    // server -> integration tests got ECONNREFUSED). Production always skips regardless.
    const _skipInit = ['1', 'true', 'yes'].includes(String(process.env.SKIP_DB_INIT || '').toLowerCase());
    if (process.env.NODE_ENV === 'production' || process.env.NODE_ENV === 'staging' || _skipInit) {
        console.log('[DB INFO] Production/Staging environment detected or SKIP_DB_INIT set. Skipping table initialization and seeding.');
        return;
    }
    const client = await pool.connect();
    try {
        const allowSeed = (process.env.NODE_ENV !== 'staging' && process.env.NODE_ENV !== 'production') || process.env.ALLOW_STAGING_SEED === 'true';
        // ===== CORE TABLES =====
        await client.query(`
CREATE TABLE IF NOT EXISTS patients (
    id SERIAL PRIMARY KEY,
    file_number INTEGER DEFAULT 0,
    name_ar TEXT DEFAULT '', name_en TEXT DEFAULT '',
    national_id TEXT DEFAULT '', phone TEXT DEFAULT '',
    department TEXT DEFAULT '', notes TEXT DEFAULT '',
    amount REAL DEFAULT 0, payment_method TEXT DEFAULT '',
    status TEXT DEFAULT 'Waiting',
    dob TEXT DEFAULT '', dob_hijri TEXT DEFAULT '', age INTEGER DEFAULT 0,
    created_at TIMESTAMP DEFAULT CURRENT_TIMESTAMP
);
CREATE TABLE IF NOT EXISTS appointments (
    id SERIAL PRIMARY KEY,
    patient_id INTEGER, patient_name TEXT DEFAULT '',
    doctor_name TEXT DEFAULT '', department TEXT DEFAULT '',
    appt_date TEXT DEFAULT '', appt_time TEXT DEFAULT '',
    notes TEXT DEFAULT '', status TEXT DEFAULT 'Confirmed',
    created_at TIMESTAMP DEFAULT CURRENT_TIMESTAMP
);
CREATE TABLE IF NOT EXISTS waiting_queue (
    id SERIAL PRIMARY KEY,
    patient_id INTEGER, patient_name TEXT DEFAULT '',
    doctor TEXT DEFAULT '', department TEXT DEFAULT '',
    status TEXT DEFAULT 'Waiting',
    check_in_time TIMESTAMP DEFAULT CURRENT_TIMESTAMP
);
CREATE TABLE IF NOT EXISTS employees (
    id SERIAL PRIMARY KEY,
    name TEXT DEFAULT '', name_ar TEXT DEFAULT '', name_en TEXT DEFAULT '',
    role TEXT DEFAULT 'Staff', department_ar TEXT DEFAULT '', department_en TEXT DEFAULT '',
    status TEXT DEFAULT 'Active', salary REAL DEFAULT 0,
    created_at TIMESTAMP DEFAULT CURRENT_TIMESTAMP
);
CREATE TABLE IF NOT EXISTS invoices (
    id SERIAL PRIMARY KEY,
    patient_name TEXT DEFAULT '', total REAL DEFAULT 0,
    paid INTEGER DEFAULT 0, order_id INTEGER DEFAULT 0,
    service_type TEXT DEFAULT '', invoice_number TEXT DEFAULT '',
    description TEXT DEFAULT '', amount REAL DEFAULT 0,
    vat_amount REAL DEFAULT 0, patient_id INTEGER DEFAULT 0,
    payment_method TEXT DEFAULT '',
    created_at TIMESTAMP DEFAULT CURRENT_TIMESTAMP
);
CREATE TABLE IF NOT EXISTS insurance_companies (
    id SERIAL PRIMARY KEY,
    name_ar TEXT DEFAULT '', name_en TEXT DEFAULT '',
    tpa_id INTEGER DEFAULT 0, contact_info TEXT DEFAULT '',
    created_at TIMESTAMP DEFAULT CURRENT_TIMESTAMP
);
CREATE TABLE IF NOT EXISTS insurance_contracts (
    id SERIAL PRIMARY KEY,
    company_id INTEGER, contract_name TEXT DEFAULT '',
    valid_from TEXT DEFAULT '', valid_to TEXT DEFAULT '',
    discount_percentage REAL DEFAULT 0, file_path TEXT DEFAULT '',
    created_at TIMESTAMP DEFAULT CURRENT_TIMESTAMP
);
CREATE TABLE IF NOT EXISTS insurance_policies (
    id SERIAL PRIMARY KEY,
    name TEXT DEFAULT '', class_type TEXT DEFAULT '',
    max_limit REAL DEFAULT 0, co_pay_percent REAL DEFAULT 0,
    co_pay_max REAL DEFAULT 0, dental_included INTEGER DEFAULT 0,
    optical_included INTEGER DEFAULT 0, maternity_included INTEGER DEFAULT 0
);
CREATE TABLE IF NOT EXISTS icd10_codes (
    code TEXT PRIMARY KEY,
    description_en TEXT DEFAULT '', description_ar TEXT DEFAULT ''
);
CREATE TABLE IF NOT EXISTS approvals (
    id SERIAL PRIMARY KEY,
    patient_id INTEGER, service_id INTEGER,
    request_date TEXT DEFAULT '', status TEXT DEFAULT 'Pending',
    approval_number TEXT DEFAULT '', response_date TEXT DEFAULT ''
);
CREATE TABLE IF NOT EXISTS insurance_claims (
    id SERIAL PRIMARY KEY,
    patient_name TEXT DEFAULT '', insurance_company TEXT DEFAULT '',
    claim_amount REAL DEFAULT 0, status TEXT DEFAULT 'Pending',
    contract_id INTEGER DEFAULT 0, policy_id INTEGER DEFAULT 0,
    ucaf_dcaf_data TEXT DEFAULT '', waseel_status TEXT DEFAULT 'Unsent',
    created_at TIMESTAMP DEFAULT CURRENT_TIMESTAMP
);
CREATE TABLE IF NOT EXISTS medical_records (
    id SERIAL PRIMARY KEY,
    patient_id INTEGER, doctor_id INTEGER,
    diagnosis TEXT DEFAULT '', symptoms TEXT DEFAULT '',
    icd10_codes TEXT DEFAULT '', notes TEXT DEFAULT '',
    visit_date TIMESTAMP DEFAULT CURRENT_TIMESTAMP
);
CREATE TABLE IF NOT EXISTS prescriptions (
    id SERIAL PRIMARY KEY,
    patient_id INTEGER, doctor_id INTEGER, medication_id INTEGER,
    dosage TEXT DEFAULT '', duration TEXT DEFAULT '',
    status TEXT DEFAULT 'Pending',
    created_at TIMESTAMP DEFAULT CURRENT_TIMESTAMP
);
CREATE TABLE IF NOT EXISTS medications (
    id SERIAL PRIMARY KEY,
    name TEXT DEFAULT '', active_ingredient TEXT DEFAULT '',
    stock_quantity INTEGER DEFAULT 0, price REAL DEFAULT 0
);
CREATE TABLE IF NOT EXISTS lab_radiology_orders (
    id SERIAL PRIMARY KEY,
    patient_id INTEGER, doctor_id INTEGER,
    order_type TEXT DEFAULT '', description TEXT DEFAULT '',
    status TEXT DEFAULT 'Requested', sample_serial TEXT DEFAULT '',
    result_date TEXT DEFAULT '', sms_sent INTEGER DEFAULT 0,
    results TEXT DEFAULT '', radiology_images_paths TEXT DEFAULT '',
    structured_report TEXT DEFAULT '', is_radiology INTEGER DEFAULT 0,
    price REAL DEFAULT 0, approval_status TEXT DEFAULT 'Pending Approval',
    approved_by TEXT DEFAULT '',
    created_at TIMESTAMP DEFAULT CURRENT_TIMESTAMP
);
CREATE TABLE IF NOT EXISTS dental_records (
    id SERIAL PRIMARY KEY,
    patient_id INTEGER, tooth_number INTEGER,
    condition TEXT DEFAULT '', treatment_done TEXT DEFAULT '',
    visit_date TIMESTAMP DEFAULT CURRENT_TIMESTAMP
);
CREATE TABLE IF NOT EXISTS lab_tests_catalog (
    id SERIAL PRIMARY KEY,
    test_name TEXT DEFAULT '', category TEXT DEFAULT '',
    normal_range TEXT DEFAULT '', price REAL DEFAULT 0
);
CREATE TABLE IF NOT EXISTS lab_results (
    id SERIAL PRIMARY KEY,
    order_id INTEGER, test_id INTEGER,
    result_value TEXT DEFAULT '', is_abnormal INTEGER DEFAULT 0,
    notes TEXT DEFAULT ''
);
CREATE TABLE IF NOT EXISTS radiology_catalog (
    id SERIAL PRIMARY KEY,
    modality TEXT DEFAULT '', exact_name TEXT DEFAULT '',
    default_template TEXT DEFAULT '', price REAL DEFAULT 0
);
        `);

        // ===== PHARMACY TABLES =====
        await client.query(`
CREATE TABLE IF NOT EXISTS pharmacy_prescriptions_queue (
    id SERIAL PRIMARY KEY,
    patient_id INTEGER, doctor_id INTEGER,
    clinic_name TEXT DEFAULT '', prescription_text TEXT DEFAULT '',
    status TEXT DEFAULT 'Pending', dispensed_by TEXT DEFAULT '',
    dispensed_at TIMESTAMP, created_at TIMESTAMP DEFAULT CURRENT_TIMESTAMP
);
CREATE TABLE IF NOT EXISTS pharmacy_drug_catalog (
    id SERIAL PRIMARY KEY,
    drug_name TEXT DEFAULT '', active_ingredient TEXT DEFAULT '',
    barcode TEXT DEFAULT '', category TEXT DEFAULT '',
    unit TEXT DEFAULT '', selling_price REAL DEFAULT 0,
    cost_price REAL DEFAULT 0, stock_qty INTEGER DEFAULT 0,
    min_qty INTEGER DEFAULT 5, expiry_date TEXT DEFAULT '',
    is_active INTEGER DEFAULT 1
);
CREATE TABLE IF NOT EXISTS pharmacy_suppliers (
    id SERIAL PRIMARY KEY,
    company_name TEXT DEFAULT '', contact_person TEXT DEFAULT '',
    phone TEXT DEFAULT '', email TEXT DEFAULT '',
    address TEXT DEFAULT '', tax_number TEXT DEFAULT '', notes TEXT DEFAULT ''
);
CREATE TABLE IF NOT EXISTS pharmacy_sales (
    id SERIAL PRIMARY KEY,
    patient_id INTEGER, sale_type TEXT DEFAULT '',
    total_amount REAL DEFAULT 0, discount REAL DEFAULT 0,
    insurance_coverage REAL DEFAULT 0, patient_share REAL DEFAULT 0,
    payment_method TEXT DEFAULT '', cashier TEXT DEFAULT '',
    invoice_number TEXT DEFAULT '',
    created_at TIMESTAMP DEFAULT CURRENT_TIMESTAMP
);
CREATE TABLE IF NOT EXISTS pharmacy_sale_items (
    id SERIAL PRIMARY KEY,
    sale_id INTEGER, drug_id INTEGER, qty INTEGER DEFAULT 0,
    unit_price REAL DEFAULT 0, total_price REAL DEFAULT 0,
    bonus_qty INTEGER DEFAULT 0, discount REAL DEFAULT 0
);
CREATE TABLE IF NOT EXISTS pharmacy_purchase_orders (
    id SERIAL PRIMARY KEY,
    supplier_id INTEGER, order_date TEXT DEFAULT '',
    total_amount REAL DEFAULT 0, discount REAL DEFAULT 0,
    bonus_value REAL DEFAULT 0, status TEXT DEFAULT 'Draft',
    notes TEXT DEFAULT '', created_at TIMESTAMP DEFAULT CURRENT_TIMESTAMP
);
CREATE TABLE IF NOT EXISTS pharmacy_purchase_items (
    id SERIAL PRIMARY KEY,
    purchase_id INTEGER, drug_id INTEGER, qty INTEGER DEFAULT 0,
    unit_cost REAL DEFAULT 0, bonus_qty INTEGER DEFAULT 0,
    discount REAL DEFAULT 0, expiry_date TEXT DEFAULT '',
    batch_number TEXT DEFAULT ''
);
CREATE TABLE IF NOT EXISTS pharmacy_opening_balances (
    id SERIAL PRIMARY KEY,
    drug_id INTEGER, qty INTEGER DEFAULT 0,
    unit_cost REAL DEFAULT 0, expiry_date TEXT DEFAULT '',
    batch_number TEXT DEFAULT '',
    entry_date TIMESTAMP DEFAULT CURRENT_TIMESTAMP
);
        `);

        // ===== FINANCE TABLES =====
        await client.query(`
CREATE TABLE IF NOT EXISTS finance_chart_of_accounts (
    id SERIAL PRIMARY KEY,
    account_code TEXT DEFAULT '', account_name_ar TEXT DEFAULT '',
    account_name_en TEXT DEFAULT '', parent_id INTEGER DEFAULT 0,
    account_level INTEGER DEFAULT 1, account_type TEXT DEFAULT '',
    is_active INTEGER DEFAULT 1
);
CREATE TABLE IF NOT EXISTS finance_journal_entries (
    id SERIAL PRIMARY KEY,
    entry_number TEXT DEFAULT '', entry_date TEXT DEFAULT '',
    description TEXT DEFAULT '', reference TEXT DEFAULT '',
    is_auto INTEGER DEFAULT 0, fiscal_year_id INTEGER,
    is_posted INTEGER DEFAULT 0, created_by TEXT DEFAULT '',
    created_at TIMESTAMP DEFAULT CURRENT_TIMESTAMP
);
CREATE TABLE IF NOT EXISTS finance_journal_lines (
    id SERIAL PRIMARY KEY,
    entry_id INTEGER, account_id INTEGER,
    debit REAL DEFAULT 0, credit REAL DEFAULT 0,
    cost_center_id INTEGER DEFAULT 0, notes TEXT DEFAULT ''
);
CREATE TABLE IF NOT EXISTS finance_fiscal_years (
    id SERIAL PRIMARY KEY,
    year_name TEXT DEFAULT '', start_date TEXT DEFAULT '',
    end_date TEXT DEFAULT '', is_closed INTEGER DEFAULT 0,
    closed_at TEXT DEFAULT ''
);
CREATE TABLE IF NOT EXISTS finance_cost_centers (
    id SERIAL PRIMARY KEY,
    center_name TEXT DEFAULT '', center_code TEXT DEFAULT '',
    clinic_id INTEGER DEFAULT 0, is_active INTEGER DEFAULT 1
);
CREATE TABLE IF NOT EXISTS finance_tax_declarations (
    id SERIAL PRIMARY KEY,
    period_start TEXT DEFAULT '', period_end TEXT DEFAULT '',
    total_sales REAL DEFAULT 0, total_vat REAL DEFAULT 0,
    status TEXT DEFAULT 'Draft', submitted_at TEXT DEFAULT ''
);
CREATE TABLE IF NOT EXISTS finance_doctor_commissions (
    id SERIAL PRIMARY KEY,
    doctor_id INTEGER, period TEXT DEFAULT '',
    total_revenue REAL DEFAULT 0, commission_rate REAL DEFAULT 0,
    commission_amount REAL DEFAULT 0, status TEXT DEFAULT 'Pending'
);
CREATE TABLE IF NOT EXISTS finance_vouchers (
    id SERIAL PRIMARY KEY,
    voucher_number TEXT DEFAULT '', voucher_type TEXT DEFAULT '',
    amount REAL DEFAULT 0, account_id INTEGER,
    description TEXT DEFAULT '', payment_method TEXT DEFAULT '',
    reference TEXT DEFAULT '', voucher_date TEXT DEFAULT '',
    created_by TEXT DEFAULT '',
    created_at TIMESTAMP DEFAULT CURRENT_TIMESTAMP
);
        `);

        // ===== HR TABLES =====
        await client.query(`
CREATE TABLE IF NOT EXISTS hr_employees (
    id SERIAL PRIMARY KEY,
    emp_number TEXT DEFAULT '', name_ar TEXT DEFAULT '', name_en TEXT DEFAULT '',
    national_id TEXT DEFAULT '', phone TEXT DEFAULT '', email TEXT DEFAULT '',
    department TEXT DEFAULT '', job_title TEXT DEFAULT '',
    hire_date TEXT DEFAULT '', contract_end TEXT DEFAULT '',
    basic_salary REAL DEFAULT 0, housing_allowance REAL DEFAULT 0,
    transport_allowance REAL DEFAULT 0, is_active INTEGER DEFAULT 1
);
CREATE TABLE IF NOT EXISTS hr_salaries (
    id SERIAL PRIMARY KEY,
    employee_id INTEGER, month TEXT DEFAULT '',
    basic REAL DEFAULT 0, allowances REAL DEFAULT 0,
    deductions REAL DEFAULT 0, advances_deducted REAL DEFAULT 0,
    net_salary REAL DEFAULT 0, payment_date TEXT DEFAULT '',
    status TEXT DEFAULT 'Pending'
);
CREATE TABLE IF NOT EXISTS hr_leaves (
    id SERIAL PRIMARY KEY,
    employee_id INTEGER, leave_type TEXT DEFAULT '',
    start_date TEXT DEFAULT '', end_date TEXT DEFAULT '',
    days INTEGER DEFAULT 0, status TEXT DEFAULT 'Pending',
    approved_by TEXT DEFAULT '', notes TEXT DEFAULT ''
);
CREATE TABLE IF NOT EXISTS hr_advances (
    id SERIAL PRIMARY KEY,
    employee_id INTEGER, amount REAL DEFAULT 0,
    request_date TEXT DEFAULT '', installments INTEGER DEFAULT 1,
    remaining REAL DEFAULT 0, status TEXT DEFAULT 'Pending',
    notes TEXT DEFAULT ''
);
CREATE TABLE IF NOT EXISTS hr_employee_documents (
    id SERIAL PRIMARY KEY,
    employee_id INTEGER, doc_type TEXT DEFAULT '',
    doc_number TEXT DEFAULT '', issue_date TEXT DEFAULT '',
    expiry_date TEXT DEFAULT '', file_path TEXT DEFAULT '',
    alert_days INTEGER DEFAULT 30
);
CREATE TABLE IF NOT EXISTS hr_attendance (
    id SERIAL PRIMARY KEY,
    employee_id INTEGER, attendance_date TEXT DEFAULT '',
    check_in TEXT DEFAULT '', check_out TEXT DEFAULT '',
    total_hours REAL DEFAULT 0, status TEXT DEFAULT 'Present',
    source TEXT DEFAULT 'Manual'
);
CREATE TABLE IF NOT EXISTS hr_employee_custody (
    id SERIAL PRIMARY KEY,
    employee_id INTEGER, item_name TEXT DEFAULT '',
    handed_date TEXT DEFAULT '', returned_date TEXT DEFAULT '',
    status TEXT DEFAULT 'Active', notes TEXT DEFAULT ''
);
        `);

        // ===== INVENTORY TABLES =====
        await client.query(`
CREATE TABLE IF NOT EXISTS inventory_items (
    id SERIAL PRIMARY KEY,
    item_name TEXT DEFAULT '', item_code TEXT DEFAULT '',
    barcode TEXT DEFAULT '', category TEXT DEFAULT '',
    unit TEXT DEFAULT '', cost_price REAL DEFAULT 0,
    stock_qty INTEGER DEFAULT 0, min_qty INTEGER DEFAULT 5,
    is_active INTEGER DEFAULT 1
);
CREATE TABLE IF NOT EXISTS inventory_opening_balances (
    id SERIAL PRIMARY KEY, item_id INTEGER,
    qty INTEGER DEFAULT 0, unit_cost REAL DEFAULT 0,
    balance_date TEXT DEFAULT '', notes TEXT DEFAULT ''
);
CREATE TABLE IF NOT EXISTS inventory_purchases (
    id SERIAL PRIMARY KEY, supplier_id INTEGER,
    purchase_date TEXT DEFAULT '', total_amount REAL DEFAULT 0,
    status TEXT DEFAULT 'Received', notes TEXT DEFAULT '',
    created_at TIMESTAMP DEFAULT CURRENT_TIMESTAMP
);
CREATE TABLE IF NOT EXISTS inventory_purchase_items (
    id SERIAL PRIMARY KEY, purchase_id INTEGER, item_id INTEGER,
    qty INTEGER DEFAULT 0, unit_cost REAL DEFAULT 0, total_cost REAL DEFAULT 0
);
CREATE TABLE IF NOT EXISTS inventory_issue_to_dept (
    id SERIAL PRIMARY KEY, department TEXT DEFAULT '',
    issued_by TEXT DEFAULT '', issue_date TEXT DEFAULT '',
    status TEXT DEFAULT 'Issued', notes TEXT DEFAULT '',
    created_at TIMESTAMP DEFAULT CURRENT_TIMESTAMP
);
CREATE TABLE IF NOT EXISTS inventory_issue_items (
    id SERIAL PRIMARY KEY, issue_id INTEGER, item_id INTEGER,
    qty INTEGER DEFAULT 0, notes TEXT DEFAULT ''
);
CREATE TABLE IF NOT EXISTS inventory_dept_requests (
    id SERIAL PRIMARY KEY, department TEXT DEFAULT '',
    requested_by TEXT DEFAULT '', request_date TEXT DEFAULT '',
    status TEXT DEFAULT 'Pending', approved_by TEXT DEFAULT '',
    notes TEXT DEFAULT ''
);
CREATE TABLE IF NOT EXISTS inventory_dept_request_items (
    id SERIAL PRIMARY KEY, request_id INTEGER, item_id INTEGER,
    qty_requested INTEGER DEFAULT 0, qty_approved INTEGER DEFAULT 0
);
CREATE TABLE IF NOT EXISTS inventory_stock_count (
    id SERIAL PRIMARY KEY, item_id INTEGER,
    counted_qty INTEGER DEFAULT 0, system_qty INTEGER DEFAULT 0,
    difference INTEGER DEFAULT 0, count_date TEXT DEFAULT '',
    counted_by TEXT DEFAULT ''
);

CREATE TABLE IF NOT EXISTS plans (
    id             SERIAL PRIMARY KEY,
    plan_key       VARCHAR(50)  NOT NULL UNIQUE,
    name_ar        VARCHAR(120) NOT NULL,
    name_en        VARCHAR(120) NOT NULL,
    description_ar TEXT         NOT NULL DEFAULT '',
    description_en TEXT         NOT NULL DEFAULT '',
    currency       CHAR(3)      NOT NULL,
    monthly_price  NUMERIC(12,2) NOT NULL DEFAULT 0 CHECK (monthly_price >= 0),
    yearly_price   NUMERIC(12,2) NOT NULL DEFAULT 0 CHECK (yearly_price  >= 0),
    trial_days     INTEGER      NOT NULL DEFAULT 0 CHECK (trial_days >= 0 AND trial_days <= 365),
    active         BOOLEAN      NOT NULL DEFAULT true,
    sort_order     INTEGER      NOT NULL DEFAULT 0,
    created_at     TIMESTAMPTZ  NOT NULL DEFAULT now(),
    updated_at     TIMESTAMPTZ  NOT NULL DEFAULT now(),
    CONSTRAINT plans_plan_key_fmt CHECK (plan_key ~ '^[a-z0-9_]{2,40}$')
);

CREATE TABLE IF NOT EXISTS plan_entitlements (
    plan_id                INTEGER PRIMARY KEY REFERENCES plans(id) ON DELETE CASCADE,
    max_users              INTEGER CHECK (max_users IS NULL OR max_users >= 0),
    max_branches           INTEGER CHECK (max_branches IS NULL OR max_branches >= 0),
    max_invoices_per_month INTEGER CHECK (max_invoices_per_month IS NULL OR max_invoices_per_month >= 0),
    modules_enabled        TEXT        NOT NULL DEFAULT '',
    support_level          VARCHAR(20) NOT NULL DEFAULT 'standard',
    api_access             BOOLEAN     NOT NULL DEFAULT false,
    custom_domain          BOOLEAN     NOT NULL DEFAULT false
);

CREATE TABLE IF NOT EXISTS tenant_plan_assignments (
    id                SERIAL PRIMARY KEY,
    tenant_id         INTEGER     NOT NULL REFERENCES tenants(id) ON DELETE CASCADE,
    plan_key          VARCHAR(50) NOT NULL REFERENCES plans(plan_key),
    assignment_source VARCHAR(20) NOT NULL DEFAULT 'manual',
    assigned_by       INTEGER,
    assigned_at       TIMESTAMPTZ NOT NULL DEFAULT now(),
    effective_from    TIMESTAMPTZ NOT NULL DEFAULT now(),
    effective_to      TIMESTAMPTZ,
    CONSTRAINT tpa_source_chk CHECK (assignment_source IN ('manual','trial','migration'))
);
        `);

        // ===== OTHER TABLES =====
        await client.query(`
CREATE TABLE IF NOT EXISTS clinical_departments (
    id SERIAL PRIMARY KEY,
    tenant_id INTEGER NOT NULL REFERENCES tenants(id) ON DELETE CASCADE,
    code TEXT NOT NULL UNIQUE,
    name_ar TEXT DEFAULT '',
    name_en TEXT DEFAULT '',
    owner_role VARCHAR(50) NOT NULL DEFAULT 'CMO',
    created_at TIMESTAMP DEFAULT CURRENT_TIMESTAMP
);
ALTER TABLE clinical_departments ENABLE ROW LEVEL SECURITY;
ALTER TABLE clinical_departments FORCE ROW LEVEL SECURITY;
DROP POLICY IF EXISTS rls_clinical_departments ON clinical_departments;
CREATE POLICY rls_clinical_departments ON clinical_departments
    USING (tenant_id = NULLIF(current_setting('app.tenant_id', true), '')::integer)
    WITH CHECK (tenant_id = NULLIF(current_setting('app.tenant_id', true), '')::integer);

CREATE TABLE IF NOT EXISTS clinical_templates (
    id SERIAL PRIMARY KEY,
    department_id INTEGER NOT NULL REFERENCES clinical_departments(id) ON DELETE CASCADE,
    version TEXT DEFAULT '1.0.0',
    form_structure JSONB NOT NULL,
    is_active INTEGER DEFAULT 1,
    created_at TIMESTAMP DEFAULT CURRENT_TIMESTAMP
);

CREATE TABLE IF NOT EXISTS clinical_records (
    id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
    tenant_id INTEGER NOT NULL REFERENCES tenants(id) ON DELETE CASCADE,
    patient_id INTEGER NOT NULL,
    template_id INTEGER REFERENCES clinical_templates(id) ON DELETE SET NULL,
    record_data JSONB NOT NULL,
    is_locked INTEGER DEFAULT 0,
    content_hash TEXT DEFAULT '',
    digital_signature TEXT DEFAULT '',
    created_at TIMESTAMP DEFAULT CURRENT_TIMESTAMP
);
ALTER TABLE clinical_records ENABLE ROW LEVEL SECURITY;
ALTER TABLE clinical_records FORCE ROW LEVEL SECURITY;
DROP POLICY IF EXISTS rls_clinical_records ON clinical_records;
CREATE POLICY rls_clinical_records ON clinical_records
    USING (tenant_id = NULLIF(current_setting('app.tenant_id', true), '')::integer)
    WITH CHECK (tenant_id = NULLIF(current_setting('app.tenant_id', true), '')::integer);

CREATE TABLE IF NOT EXISTS medical_services (
    id SERIAL PRIMARY KEY,
    name_en TEXT DEFAULT '', name_ar TEXT DEFAULT '',
    specialty TEXT DEFAULT '', category TEXT DEFAULT '',
    price REAL DEFAULT 0, is_active INTEGER DEFAULT 1
);
CREATE TABLE IF NOT EXISTS form_templates (
    id SERIAL PRIMARY KEY,
    template_name TEXT DEFAULT '', department TEXT DEFAULT '',
    form_fields TEXT DEFAULT '', is_active INTEGER DEFAULT 1,
    created_by TEXT DEFAULT '',
    created_at TIMESTAMP DEFAULT CURRENT_TIMESTAMP
);
CREATE TABLE IF NOT EXISTS internal_messages (
    id SERIAL PRIMARY KEY,
    tenant_id INTEGER NOT NULL REFERENCES tenants(id) ON DELETE CASCADE,
    sender_id INTEGER, receiver_id INTEGER,
    subject TEXT DEFAULT '', body TEXT DEFAULT '',
    is_read INTEGER DEFAULT 0, priority TEXT DEFAULT 'Normal',
    created_at TIMESTAMP DEFAULT CURRENT_TIMESTAMP
);
CREATE TABLE IF NOT EXISTS packages (
    id SERIAL PRIMARY KEY,
    package_name_ar TEXT DEFAULT '', package_name_en TEXT DEFAULT '',
    department TEXT DEFAULT '', total_sessions INTEGER DEFAULT 1,
    price REAL DEFAULT 0, is_active INTEGER DEFAULT 1,
    created_at TIMESTAMP DEFAULT CURRENT_TIMESTAMP
);
CREATE TABLE IF NOT EXISTS package_sessions (
    id SERIAL PRIMARY KEY,
    tenant_id INTEGER NOT NULL REFERENCES tenants(id) ON DELETE CASCADE,
    package_id INTEGER, patient_id INTEGER,
    session_number INTEGER DEFAULT 0, session_date TEXT DEFAULT '',
    status TEXT DEFAULT 'Pending', notes TEXT DEFAULT '',
    performed_by TEXT DEFAULT ''
);
CREATE TABLE IF NOT EXISTS discount_rules (
    id SERIAL PRIMARY KEY,
    rule_name TEXT DEFAULT '', discount_type TEXT DEFAULT 'Percentage',
    discount_value REAL DEFAULT 0, applies_to TEXT DEFAULT 'All',
    min_amount REAL DEFAULT 0, max_discount REAL DEFAULT 0,
    start_date TEXT DEFAULT '', end_date TEXT DEFAULT '',
    is_active INTEGER DEFAULT 1
);
CREATE TABLE IF NOT EXISTS online_bookings (
    id SERIAL PRIMARY KEY,
    patient_name TEXT DEFAULT '', phone TEXT DEFAULT '',
    email TEXT DEFAULT '', department TEXT DEFAULT '',
    doctor_name TEXT DEFAULT '', preferred_date TEXT DEFAULT '',
    preferred_time TEXT DEFAULT '', status TEXT DEFAULT 'Pending',
    source TEXT DEFAULT 'Online', notes TEXT DEFAULT '',
    created_at TIMESTAMP DEFAULT CURRENT_TIMESTAMP
);
CREATE TABLE IF NOT EXISTS lab_samples (
    id SERIAL PRIMARY KEY,
    order_id INTEGER, sample_type TEXT DEFAULT '',
    barcode TEXT DEFAULT '', collection_date TEXT DEFAULT '',
    collected_by TEXT DEFAULT '', status TEXT DEFAULT 'Collected',
    storage_location TEXT DEFAULT '', notes TEXT DEFAULT ''
);
CREATE TABLE IF NOT EXISTS user_permissions (
    id SERIAL PRIMARY KEY,
    user_id INTEGER, module_name TEXT DEFAULT '',
    can_view INTEGER DEFAULT 0, can_add INTEGER DEFAULT 0,
    can_edit INTEGER DEFAULT 0, can_delete INTEGER DEFAULT 0,
    can_print INTEGER DEFAULT 0
);
CREATE TABLE IF NOT EXISTS doctor_inventory_requests (
    id SERIAL PRIMARY KEY,
    doctor_id INTEGER, department TEXT DEFAULT '',
    request_date TEXT DEFAULT '', status TEXT DEFAULT 'Pending',
    approved_by TEXT DEFAULT '', notes TEXT DEFAULT '',
    created_at TIMESTAMP DEFAULT CURRENT_TIMESTAMP
);
CREATE TABLE IF NOT EXISTS doctor_inventory_request_items (
    id SERIAL PRIMARY KEY,
    request_id INTEGER, item_id INTEGER,
    qty_requested INTEGER DEFAULT 0, qty_approved INTEGER DEFAULT 0,
    notes TEXT DEFAULT ''
);
CREATE TABLE IF NOT EXISTS queue_advertisements (
    id SERIAL PRIMARY KEY,
    title TEXT DEFAULT '', image_path TEXT DEFAULT '',
    display_order INTEGER DEFAULT 0, duration_seconds INTEGER DEFAULT 10,
    is_active INTEGER DEFAULT 1,
    created_at TIMESTAMP DEFAULT CURRENT_TIMESTAMP
);
CREATE TABLE IF NOT EXISTS integration_settings (
    id SERIAL PRIMARY KEY,
    integration_name TEXT DEFAULT '', provider TEXT DEFAULT '',
    api_key TEXT DEFAULT '', api_secret TEXT DEFAULT '',
    endpoint_url TEXT DEFAULT '', is_enabled INTEGER DEFAULT 0,
    config_json TEXT DEFAULT '', last_sync TEXT DEFAULT ''
);
CREATE TABLE IF NOT EXISTS company_settings (
    setting_key TEXT PRIMARY KEY,
    setting_value TEXT DEFAULT ''
);
CREATE TABLE IF NOT EXISTS system_users (
    id SERIAL PRIMARY KEY,
    username TEXT UNIQUE NOT NULL, password_hash TEXT DEFAULT '',
    display_name TEXT DEFAULT '', role TEXT DEFAULT 'Reception',
    speciality TEXT DEFAULT '', permissions TEXT DEFAULT '',
    commission_type TEXT DEFAULT 'percentage',
    commission_value REAL DEFAULT 0,
    is_active INTEGER DEFAULT 1,
    created_at TIMESTAMP DEFAULT CURRENT_TIMESTAMP
);
CREATE TABLE IF NOT EXISTS nursing_vitals (
    id SERIAL PRIMARY KEY,
    patient_id INTEGER, patient_name TEXT DEFAULT '',
    bp TEXT DEFAULT '', temp REAL DEFAULT 0,
    weight REAL DEFAULT 0, pulse INTEGER DEFAULT 0,
    o2_sat INTEGER DEFAULT 0, notes TEXT DEFAULT '',
    created_at TIMESTAMP DEFAULT CURRENT_TIMESTAMP
);
CREATE TABLE IF NOT EXISTS medical_certificates (
    id SERIAL PRIMARY KEY,
    patient_id INTEGER, patient_name TEXT DEFAULT '',
    doctor_id INTEGER, doctor_name TEXT DEFAULT '',
    cert_type TEXT DEFAULT 'sick_leave',
    diagnosis TEXT DEFAULT '', notes TEXT DEFAULT '',
    start_date TEXT DEFAULT '', end_date TEXT DEFAULT '',
    days INTEGER DEFAULT 0,
    created_at TIMESTAMP DEFAULT CURRENT_TIMESTAMP
);
CREATE TABLE IF NOT EXISTS patient_referrals (
    id SERIAL PRIMARY KEY,
    patient_id INTEGER, patient_name TEXT DEFAULT '',
    from_doctor_id INTEGER, from_doctor TEXT DEFAULT '',
    to_department TEXT DEFAULT '', to_doctor TEXT DEFAULT '',
    reason TEXT DEFAULT '', urgency TEXT DEFAULT 'Normal',
    status TEXT DEFAULT 'Pending', notes TEXT DEFAULT '',
    created_at TIMESTAMP DEFAULT CURRENT_TIMESTAMP
);
        `);

        // ===== SURGICAL & BLOOD BANK TABLES =====
        await client.query(`
CREATE TABLE IF NOT EXISTS surgeries (
    id SERIAL PRIMARY KEY,
    patient_id INTEGER, patient_name TEXT DEFAULT '',
    surgeon_id INTEGER, surgeon_name TEXT DEFAULT '',
    anesthetist_id INTEGER, anesthetist_name TEXT DEFAULT '',
    procedure_name TEXT DEFAULT '', procedure_name_ar TEXT DEFAULT '',
    surgery_type TEXT DEFAULT 'Elective',
    operating_room TEXT DEFAULT '', priority TEXT DEFAULT 'Normal',
    scheduled_date TEXT DEFAULT '', scheduled_time TEXT DEFAULT '',
    estimated_duration INTEGER DEFAULT 60,
    actual_start TEXT DEFAULT '', actual_end TEXT DEFAULT '',
    status TEXT DEFAULT 'Scheduled',
    preop_status TEXT DEFAULT 'Pending',
    notes TEXT DEFAULT '', post_op_notes TEXT DEFAULT '',
    created_at TIMESTAMP DEFAULT CURRENT_TIMESTAMP
);
CREATE TABLE IF NOT EXISTS surgery_preop_assessments (
    id SERIAL PRIMARY KEY,
    surgery_id INTEGER, patient_id INTEGER,
    npo_confirmed INTEGER DEFAULT 0,
    allergies_reviewed INTEGER DEFAULT 0, allergies_notes TEXT DEFAULT '',
    medications_reviewed INTEGER DEFAULT 0, medications_notes TEXT DEFAULT '',
    labs_reviewed INTEGER DEFAULT 0, labs_notes TEXT DEFAULT '',
    imaging_reviewed INTEGER DEFAULT 0, imaging_notes TEXT DEFAULT '',
    blood_type_confirmed INTEGER DEFAULT 0, blood_reserved INTEGER DEFAULT 0,
    consent_signed INTEGER DEFAULT 0,
    anesthesia_clearance INTEGER DEFAULT 0,
    nursing_assessment INTEGER DEFAULT 0, nursing_notes TEXT DEFAULT '',
    cardiac_clearance INTEGER DEFAULT 0, cardiac_notes TEXT DEFAULT '',
    pulmonary_clearance INTEGER DEFAULT 0,
    infection_screening INTEGER DEFAULT 0,
    dvt_prophylaxis INTEGER DEFAULT 0,
    overall_status TEXT DEFAULT 'Incomplete',
    assessed_by TEXT DEFAULT '',
    created_at TIMESTAMP DEFAULT CURRENT_TIMESTAMP
);
CREATE TABLE IF NOT EXISTS surgery_preop_tests (
    id SERIAL PRIMARY KEY,
    surgery_id INTEGER, patient_id INTEGER,
    test_type TEXT DEFAULT '', test_name TEXT DEFAULT '',
    is_required INTEGER DEFAULT 1, is_completed INTEGER DEFAULT 0,
    result_summary TEXT DEFAULT '', order_id INTEGER DEFAULT 0,
    notes TEXT DEFAULT '',
    created_at TIMESTAMP DEFAULT CURRENT_TIMESTAMP
);
CREATE TABLE IF NOT EXISTS surgery_anesthesia_records (
    id SERIAL PRIMARY KEY,
    surgery_id INTEGER, patient_id INTEGER,
    anesthetist_name TEXT DEFAULT '',
    asa_class TEXT DEFAULT 'ASA I',
    anesthesia_type TEXT DEFAULT 'General',
    airway_assessment TEXT DEFAULT '',
    mallampati_score TEXT DEFAULT '',
    premedication TEXT DEFAULT '',
    induction_agents TEXT DEFAULT '',
    maintenance_agents TEXT DEFAULT '',
    muscle_relaxants TEXT DEFAULT '',
    monitors_used TEXT DEFAULT '',
    iv_access TEXT DEFAULT '',
    fluid_given TEXT DEFAULT '',
    blood_loss_ml INTEGER DEFAULT 0,
    complications TEXT DEFAULT '',
    recovery_notes TEXT DEFAULT '',
    notes TEXT DEFAULT '',
    created_at TIMESTAMP DEFAULT CURRENT_TIMESTAMP
);
CREATE TABLE IF NOT EXISTS operating_rooms (
    id SERIAL PRIMARY KEY,
    room_name TEXT DEFAULT '', room_name_ar TEXT DEFAULT '',
    location TEXT DEFAULT '',
    equipment TEXT DEFAULT '',
    status TEXT DEFAULT 'Available',
    notes TEXT DEFAULT ''
);
        `);

        await client.query(`
CREATE TABLE IF NOT EXISTS blood_bank_donors (
    id SERIAL PRIMARY KEY,
    donor_name TEXT DEFAULT '', donor_name_ar TEXT DEFAULT '',
    national_id TEXT DEFAULT '', phone TEXT DEFAULT '',
    blood_type TEXT DEFAULT '', rh_factor TEXT DEFAULT '+',
    age INTEGER DEFAULT 0, gender TEXT DEFAULT '',
    last_donation_date TEXT DEFAULT '',
    is_eligible INTEGER DEFAULT 1,
    medical_history TEXT DEFAULT '', notes TEXT DEFAULT '',
    created_at TIMESTAMP DEFAULT CURRENT_TIMESTAMP
);
CREATE TABLE IF NOT EXISTS blood_bank_units (
    id SERIAL PRIMARY KEY,
    bag_number TEXT DEFAULT '',
    blood_type TEXT DEFAULT '', rh_factor TEXT DEFAULT '+',
    component TEXT DEFAULT 'Whole Blood',
    donor_id INTEGER DEFAULT 0,
    collection_date TEXT DEFAULT '', expiry_date TEXT DEFAULT '',
    volume_ml INTEGER DEFAULT 450,
    status TEXT DEFAULT 'Available',
    storage_location TEXT DEFAULT '',
    notes TEXT DEFAULT '',
    created_at TIMESTAMP DEFAULT CURRENT_TIMESTAMP
);
CREATE TABLE IF NOT EXISTS blood_bank_crossmatch (
    id SERIAL PRIMARY KEY,
    patient_id INTEGER, patient_name TEXT DEFAULT '',
    patient_blood_type TEXT DEFAULT '',
    units_needed INTEGER DEFAULT 1,
    unit_id INTEGER DEFAULT 0,
    lab_technician TEXT DEFAULT '',
    result TEXT DEFAULT 'Pending',
    surgery_id INTEGER DEFAULT 0,
    notes TEXT DEFAULT '',
    created_at TIMESTAMP DEFAULT CURRENT_TIMESTAMP
);
CREATE TABLE IF NOT EXISTS blood_bank_transfusions (
    id SERIAL PRIMARY KEY,
    patient_id INTEGER, patient_name TEXT DEFAULT '',
    unit_id INTEGER, bag_number TEXT DEFAULT '',
    blood_type TEXT DEFAULT '', component TEXT DEFAULT '',
    administered_by TEXT DEFAULT '',
    start_time TEXT DEFAULT '', end_time TEXT DEFAULT '',
    volume_ml INTEGER DEFAULT 0,
    adverse_reaction INTEGER DEFAULT 0,
    reaction_details TEXT DEFAULT '',
    vital_signs_before TEXT DEFAULT '', vital_signs_after TEXT DEFAULT '',
    notes TEXT DEFAULT '',
    created_at TIMESTAMP DEFAULT CURRENT_TIMESTAMP
);
CREATE TABLE IF NOT EXISTS consent_forms (
    id SERIAL PRIMARY KEY,
    patient_id INTEGER, patient_name TEXT DEFAULT '',
    form_type TEXT DEFAULT 'general',
    form_title TEXT DEFAULT '', form_title_ar TEXT DEFAULT '',
    content TEXT DEFAULT '',
    doctor_name TEXT DEFAULT '',
    patient_signature TEXT DEFAULT '',
    witness_name TEXT DEFAULT '', witness_signature TEXT DEFAULT '',
    signed_at TEXT DEFAULT '',
    language TEXT DEFAULT 'ar',
    status TEXT DEFAULT 'Pending',
    surgery_id INTEGER DEFAULT 0,
    notes TEXT DEFAULT '',
    created_at TIMESTAMP DEFAULT CURRENT_TIMESTAMP
);
        `);

        // ===== EMERGENCY DEPARTMENT TABLES =====
        await client.query(`
CREATE TABLE IF NOT EXISTS emergency_visits (
    id SERIAL PRIMARY KEY,
    patient_id INTEGER, patient_name TEXT DEFAULT '',
    arrival_mode TEXT DEFAULT 'Walk-in',
    arrival_time TIMESTAMP DEFAULT CURRENT_TIMESTAMP,
    chief_complaint TEXT DEFAULT '', chief_complaint_ar TEXT DEFAULT '',
    triage_level INTEGER DEFAULT 3,
    triage_color TEXT DEFAULT 'Yellow',
    triage_nurse TEXT DEFAULT '',
    triage_vitals TEXT DEFAULT '',
    assigned_doctor TEXT DEFAULT '', assigned_bed TEXT DEFAULT '',
    disposition TEXT DEFAULT 'Pending',
    disposition_time TEXT DEFAULT '',
    acuity_notes TEXT DEFAULT '',
    discharge_time TEXT DEFAULT '',
    discharge_diagnosis TEXT DEFAULT '',
    discharge_instructions TEXT DEFAULT '',
    discharge_medications TEXT DEFAULT '',
    followup_date TEXT DEFAULT '',
    status TEXT DEFAULT 'Active',
    created_at TIMESTAMP DEFAULT CURRENT_TIMESTAMP
);
CREATE TABLE IF NOT EXISTS emergency_trauma_assessments (
    id SERIAL PRIMARY KEY,
    visit_id INTEGER, patient_id INTEGER,
    airway TEXT DEFAULT '', breathing TEXT DEFAULT '',
    circulation TEXT DEFAULT '', disability TEXT DEFAULT '',
    exposure TEXT DEFAULT '',
    gcs_eye INTEGER DEFAULT 4, gcs_verbal INTEGER DEFAULT 5, gcs_motor INTEGER DEFAULT 6,
    gcs_total INTEGER DEFAULT 15,
    mechanism_of_injury TEXT DEFAULT '',
    trauma_team_activated INTEGER DEFAULT 0,
    assessed_by TEXT DEFAULT '',
    created_at TIMESTAMP DEFAULT CURRENT_TIMESTAMP
);
CREATE TABLE IF NOT EXISTS emergency_beds (
    id SERIAL PRIMARY KEY,
    bed_name TEXT DEFAULT '', bed_name_ar TEXT DEFAULT '',
    zone TEXT DEFAULT 'General', zone_ar TEXT DEFAULT '',
    status TEXT DEFAULT 'Available',
    current_patient_id INTEGER DEFAULT 0,
    notes TEXT DEFAULT ''
);
        `);

        // ===== INPATIENT ADT TABLES =====
        await client.query(`
CREATE TABLE IF NOT EXISTS wards (
    id SERIAL PRIMARY KEY,
    ward_name TEXT DEFAULT '', ward_name_ar TEXT DEFAULT '',
    ward_type TEXT DEFAULT 'General',
    floor TEXT DEFAULT '', building TEXT DEFAULT '',
    total_beds INTEGER DEFAULT 0,
    status TEXT DEFAULT 'Active',
    notes TEXT DEFAULT ''
);
CREATE TABLE IF NOT EXISTS beds (
    id SERIAL PRIMARY KEY,
    ward_id INTEGER, bed_number TEXT DEFAULT '',
    bed_type TEXT DEFAULT 'Standard',
    room_number TEXT DEFAULT '',
    status TEXT DEFAULT 'Available',
    current_patient_id INTEGER DEFAULT 0,
    current_admission_id INTEGER DEFAULT 0,
    isolation_type TEXT DEFAULT '',
    notes TEXT DEFAULT ''
);
CREATE TABLE IF NOT EXISTS admissions (
    id SERIAL PRIMARY KEY,
    patient_id INTEGER, patient_name TEXT DEFAULT '',
    admission_type TEXT DEFAULT 'Regular',
    admission_date TIMESTAMP DEFAULT CURRENT_TIMESTAMP,
    admitting_doctor TEXT DEFAULT '', attending_doctor TEXT DEFAULT '',
    department TEXT DEFAULT '', ward_id INTEGER, bed_id INTEGER,
    diagnosis TEXT DEFAULT '', icd10_code TEXT DEFAULT '',
    admission_orders TEXT DEFAULT '',
    diet_order TEXT DEFAULT 'Regular',
    activity_level TEXT DEFAULT 'Bed Rest',
    dvt_prophylaxis TEXT DEFAULT '',
    expected_los INTEGER DEFAULT 3,
    insurance_auth TEXT DEFAULT '',
    status TEXT DEFAULT 'Active',
    discharge_date TEXT DEFAULT '', discharge_type TEXT DEFAULT '',
    discharge_summary TEXT DEFAULT '', discharge_instructions TEXT DEFAULT '',
    discharge_medications TEXT DEFAULT '',
    followup_date TEXT DEFAULT '', followup_doctor TEXT DEFAULT '',
    created_at TIMESTAMP DEFAULT CURRENT_TIMESTAMP
);
CREATE TABLE IF NOT EXISTS admission_daily_rounds (
    id SERIAL PRIMARY KEY,
    admission_id INTEGER, patient_id INTEGER,
    round_date TEXT DEFAULT '', round_time TEXT DEFAULT '',
    doctor_name TEXT DEFAULT '',
    subjective TEXT DEFAULT '', objective TEXT DEFAULT '',
    assessment TEXT DEFAULT '', plan TEXT DEFAULT '',
    vitals_summary TEXT DEFAULT '',
    orders TEXT DEFAULT '', diet_changes TEXT DEFAULT '',
    created_at TIMESTAMP DEFAULT CURRENT_TIMESTAMP
);
CREATE TABLE IF NOT EXISTS bed_transfers (
    id SERIAL PRIMARY KEY,
    admission_id INTEGER, patient_id INTEGER,
    from_ward INTEGER, from_bed INTEGER,
    to_ward INTEGER, to_bed INTEGER,
    transfer_reason TEXT DEFAULT '',
    transferred_by TEXT DEFAULT '',
    transfer_date TIMESTAMP DEFAULT CURRENT_TIMESTAMP
);
        `);

        // ===== ICU TABLES =====
        await client.query(`
CREATE TABLE IF NOT EXISTS icu_monitoring (
    id SERIAL PRIMARY KEY,
    admission_id INTEGER, patient_id INTEGER,
    monitor_time TIMESTAMP DEFAULT CURRENT_TIMESTAMP,
    hr INTEGER DEFAULT 0, sbp INTEGER DEFAULT 0, dbp INTEGER DEFAULT 0, map INTEGER DEFAULT 0,
    rr INTEGER DEFAULT 0, spo2 INTEGER DEFAULT 0, temp REAL DEFAULT 0,
    etco2 INTEGER DEFAULT 0, cvp INTEGER DEFAULT 0,
    fio2 INTEGER DEFAULT 0, peep INTEGER DEFAULT 0,
    urine_output INTEGER DEFAULT 0,
    notes TEXT DEFAULT '', recorded_by TEXT DEFAULT ''
);
CREATE TABLE IF NOT EXISTS icu_ventilator (
    id SERIAL PRIMARY KEY,
    admission_id INTEGER, patient_id INTEGER,
    vent_mode TEXT DEFAULT '', fio2 INTEGER DEFAULT 21,
    tidal_volume INTEGER DEFAULT 0, respiratory_rate INTEGER DEFAULT 0,
    peep INTEGER DEFAULT 0, pip INTEGER DEFAULT 0,
    ie_ratio TEXT DEFAULT '1:2', ps INTEGER DEFAULT 0,
    started_at TEXT DEFAULT '', ended_at TEXT DEFAULT '',
    ett_size TEXT DEFAULT '', ett_position TEXT DEFAULT '',
    cuff_pressure INTEGER DEFAULT 0,
    notes TEXT DEFAULT '', recorded_by TEXT DEFAULT '',
    created_at TIMESTAMP DEFAULT CURRENT_TIMESTAMP
);
CREATE TABLE IF NOT EXISTS icu_scores (
    id SERIAL PRIMARY KEY,
    admission_id INTEGER, patient_id INTEGER,
    score_date TEXT DEFAULT '',
    apache_ii INTEGER DEFAULT 0, sofa INTEGER DEFAULT 0,
    gcs INTEGER DEFAULT 15, rass INTEGER DEFAULT 0,
    cam_icu INTEGER DEFAULT 0, braden INTEGER DEFAULT 23,
    morse_fall INTEGER DEFAULT 0, pain_score INTEGER DEFAULT 0,
    calculated_by TEXT DEFAULT '',
    created_at TIMESTAMP DEFAULT CURRENT_TIMESTAMP
);
CREATE TABLE IF NOT EXISTS icu_fluid_balance (
    id SERIAL PRIMARY KEY,
    admission_id INTEGER, patient_id INTEGER,
    balance_date TEXT DEFAULT '', shift TEXT DEFAULT 'Day',
    iv_fluids INTEGER DEFAULT 0, oral_intake INTEGER DEFAULT 0,
    blood_products INTEGER DEFAULT 0, medications_iv INTEGER DEFAULT 0,
    total_intake INTEGER DEFAULT 0,
    urine INTEGER DEFAULT 0, drains INTEGER DEFAULT 0,
    ngt_output INTEGER DEFAULT 0, stool INTEGER DEFAULT 0,
    vomit INTEGER DEFAULT 0, insensible INTEGER DEFAULT 0,
    total_output INTEGER DEFAULT 0,
    net_balance INTEGER DEFAULT 0,
    recorded_by TEXT DEFAULT '',
    created_at TIMESTAMP DEFAULT CURRENT_TIMESTAMP
);
        `);

        // ===== CSSD / STERILIZATION TABLES =====
        await client.query(`
CREATE TABLE IF NOT EXISTS cssd_instrument_sets (
    id SERIAL PRIMARY KEY,
    set_name TEXT DEFAULT '', set_name_ar TEXT DEFAULT '',
    set_code TEXT DEFAULT '', category TEXT DEFAULT '',
    instrument_count INTEGER DEFAULT 0,
    instruments_list TEXT DEFAULT '',
    department TEXT DEFAULT '',
    status TEXT DEFAULT 'Available',
    notes TEXT DEFAULT ''
);
CREATE TABLE IF NOT EXISTS cssd_sterilization_cycles (
    id SERIAL PRIMARY KEY,
    cycle_number TEXT DEFAULT '',
    machine_name TEXT DEFAULT '',
    cycle_type TEXT DEFAULT 'Steam Autoclave',
    temperature REAL DEFAULT 0, pressure REAL DEFAULT 0,
    duration_minutes INTEGER DEFAULT 0,
    start_time TIMESTAMP DEFAULT CURRENT_TIMESTAMP,
    end_time TEXT DEFAULT '',
    operator TEXT DEFAULT '',
    bi_test_result TEXT DEFAULT 'Pending',
    ci_result TEXT DEFAULT '',
    status TEXT DEFAULT 'In Progress',
    notes TEXT DEFAULT ''
);
CREATE TABLE IF NOT EXISTS cssd_load_items (
    id SERIAL PRIMARY KEY,
    cycle_id INTEGER, set_id INTEGER,
    set_name TEXT DEFAULT '', barcode TEXT DEFAULT '',
    status TEXT DEFAULT 'Processing',
    used_in_surgery_id INTEGER DEFAULT 0,
    used_date TEXT DEFAULT '',
    notes TEXT DEFAULT ''
);
        `);

        // ===== DIETARY / NUTRITION TABLES =====
        await client.query(`
CREATE TABLE IF NOT EXISTS diet_orders (
    id SERIAL PRIMARY KEY,
    tenant_id INTEGER NOT NULL REFERENCES tenants(id) ON DELETE CASCADE,
    admission_id INTEGER, patient_id INTEGER, patient_name TEXT DEFAULT '',
    diet_type TEXT DEFAULT 'Regular',
    diet_type_ar TEXT DEFAULT 'عادي',
    texture TEXT DEFAULT 'Normal', fluid TEXT DEFAULT 'Normal',
    allergies TEXT DEFAULT '', restrictions TEXT DEFAULT '',
    supplements TEXT DEFAULT '',
    ordered_by TEXT DEFAULT '',
    meal_preferences TEXT DEFAULT '',
    start_date TEXT DEFAULT '', end_date TEXT DEFAULT '',
    status TEXT DEFAULT 'Active',
    notes TEXT DEFAULT '',
    created_at TIMESTAMP DEFAULT CURRENT_TIMESTAMP
);
CREATE TABLE IF NOT EXISTS diet_meals (
    id SERIAL PRIMARY KEY,
    tenant_id INTEGER NOT NULL REFERENCES tenants(id) ON DELETE CASCADE,
    order_id INTEGER, patient_id INTEGER,
    meal_type TEXT DEFAULT 'Lunch',
    meal_date TEXT DEFAULT '',
    items TEXT DEFAULT '',
    calories INTEGER DEFAULT 0,
    delivered INTEGER DEFAULT 0, delivered_by TEXT DEFAULT '',
    consumed_percentage INTEGER DEFAULT 0,
    notes TEXT DEFAULT '',
    created_at TIMESTAMP DEFAULT CURRENT_TIMESTAMP
);
CREATE TABLE IF NOT EXISTS nutrition_assessments (
    id SERIAL PRIMARY KEY,
    tenant_id INTEGER NOT NULL REFERENCES tenants(id) ON DELETE CASCADE,
    patient_id INTEGER, patient_name TEXT DEFAULT '',
    assessment_date TEXT DEFAULT '',
    height_cm REAL DEFAULT 0, weight_kg REAL DEFAULT 0,
    bmi REAL DEFAULT 0, bmi_category TEXT DEFAULT '',
    ideal_body_weight REAL DEFAULT 0,
    caloric_needs INTEGER DEFAULT 0, protein_needs REAL DEFAULT 0,
    screening_score INTEGER DEFAULT 0,
    malnutrition_risk TEXT DEFAULT 'Low',
    plan TEXT DEFAULT '',
    assessed_by TEXT DEFAULT '',
    created_at TIMESTAMP DEFAULT CURRENT_TIMESTAMP
);
        `);

        // ===== INFECTION CONTROL TABLES =====
        await client.query(`
CREATE TABLE IF NOT EXISTS infection_surveillance (
    id SERIAL PRIMARY KEY,
    patient_id INTEGER, patient_name TEXT DEFAULT '',
    infection_type TEXT DEFAULT '',
    infection_site TEXT DEFAULT '',
    organism TEXT DEFAULT '', sensitivity TEXT DEFAULT '',
    detection_date TEXT DEFAULT '',
    hai_category TEXT DEFAULT '',
    device_related INTEGER DEFAULT 0, device_type TEXT DEFAULT '',
    ward TEXT DEFAULT '', bed TEXT DEFAULT '',
    isolation_type TEXT DEFAULT '',
    outcome TEXT DEFAULT '',
    reported_by TEXT DEFAULT '',
    notes TEXT DEFAULT '',
    created_at TIMESTAMP DEFAULT CURRENT_TIMESTAMP
);
CREATE TABLE IF NOT EXISTS infection_outbreaks (
    id SERIAL PRIMARY KEY,
    outbreak_name TEXT DEFAULT '', organism TEXT DEFAULT '',
    start_date TEXT DEFAULT '', end_date TEXT DEFAULT '',
    affected_ward TEXT DEFAULT '',
    total_cases INTEGER DEFAULT 0,
    investigation_notes TEXT DEFAULT '',
    control_measures TEXT DEFAULT '',
    status TEXT DEFAULT 'Active',
    reported_by TEXT DEFAULT '',
    created_at TIMESTAMP DEFAULT CURRENT_TIMESTAMP
);
CREATE TABLE IF NOT EXISTS employee_exposures (
    id SERIAL PRIMARY KEY,
    employee_id INTEGER, employee_name TEXT DEFAULT '',
    exposure_type TEXT DEFAULT '',
    exposure_date TEXT DEFAULT '',
    source_patient TEXT DEFAULT '',
    body_fluid TEXT DEFAULT '',
    ppe_worn TEXT DEFAULT '',
    action_taken TEXT DEFAULT '',
    followup_date TEXT DEFAULT '',
    result TEXT DEFAULT 'Pending',
    reported_by TEXT DEFAULT '',
    created_at TIMESTAMP DEFAULT CURRENT_TIMESTAMP
);
CREATE TABLE IF NOT EXISTS hand_hygiene_audits (
    id SERIAL PRIMARY KEY,
    audit_date TEXT DEFAULT '', auditor TEXT DEFAULT '',
    department TEXT DEFAULT '',
    moments_observed INTEGER DEFAULT 0,
    moments_compliant INTEGER DEFAULT 0,
    compliance_rate REAL DEFAULT 0,
    notes TEXT DEFAULT '',
    created_at TIMESTAMP DEFAULT CURRENT_TIMESTAMP
);
        `);

        // ===== QUALITY & PATIENT SAFETY TABLES =====
        await client.query(`
CREATE TABLE IF NOT EXISTS quality_incidents (
    id SERIAL PRIMARY KEY,
    incident_type TEXT DEFAULT '',
    severity TEXT DEFAULT 'Minor',
    incident_date TEXT DEFAULT '', incident_time TEXT DEFAULT '',
    department TEXT DEFAULT '', location TEXT DEFAULT '',
    patient_id INTEGER DEFAULT 0, patient_name TEXT DEFAULT '',
    description TEXT DEFAULT '',
    immediate_action TEXT DEFAULT '',
    reported_by TEXT DEFAULT '',
    assigned_to TEXT DEFAULT '',
    root_cause TEXT DEFAULT '',
    corrective_action TEXT DEFAULT '',
    preventive_action TEXT DEFAULT '',
    status TEXT DEFAULT 'Open',
    closed_date TEXT DEFAULT '',
    created_at TIMESTAMP DEFAULT CURRENT_TIMESTAMP
);
CREATE TABLE IF NOT EXISTS quality_patient_satisfaction (
    id SERIAL PRIMARY KEY,
    patient_id INTEGER DEFAULT 0, patient_name TEXT DEFAULT '',
    department TEXT DEFAULT '',
    survey_date TEXT DEFAULT '',
    overall_rating INTEGER DEFAULT 0,
    cleanliness INTEGER DEFAULT 0, staff_courtesy INTEGER DEFAULT 0,
    wait_time INTEGER DEFAULT 0, communication INTEGER DEFAULT 0,
    pain_management INTEGER DEFAULT 0, food_quality INTEGER DEFAULT 0,
    comments TEXT DEFAULT '',
    would_recommend INTEGER DEFAULT 0,
    created_at TIMESTAMP DEFAULT CURRENT_TIMESTAMP
);
CREATE TABLE IF NOT EXISTS quality_kpis (
    id SERIAL PRIMARY KEY,
    kpi_name TEXT DEFAULT '', kpi_name_ar TEXT DEFAULT '',
    category TEXT DEFAULT '',
    target_value REAL DEFAULT 0, actual_value REAL DEFAULT 0,
    unit TEXT DEFAULT '%',
    period TEXT DEFAULT '',
    department TEXT DEFAULT '',
    status TEXT DEFAULT 'On Track',
    notes TEXT DEFAULT '',
    created_at TIMESTAMP DEFAULT CURRENT_TIMESTAMP
);
        `);

        // ===== MAINTENANCE & BIOMEDICAL TABLES =====
        await client.query(`
CREATE TABLE IF NOT EXISTS maintenance_work_orders (
    id SERIAL PRIMARY KEY,
    wo_number TEXT DEFAULT '',
    request_type TEXT DEFAULT 'Corrective',
    priority TEXT DEFAULT 'Normal',
    department TEXT DEFAULT '', location TEXT DEFAULT '',
    equipment_id INTEGER DEFAULT 0,
    description TEXT DEFAULT '', description_ar TEXT DEFAULT '',
    requested_by TEXT DEFAULT '',
    assigned_to TEXT DEFAULT '',
    scheduled_date TEXT DEFAULT '',
    completed_date TEXT DEFAULT '',
    cost REAL DEFAULT 0,
    status TEXT DEFAULT 'Open',
    resolution TEXT DEFAULT '',
    created_at TIMESTAMP DEFAULT CURRENT_TIMESTAMP
);
CREATE TABLE IF NOT EXISTS maintenance_equipment (
    id SERIAL PRIMARY KEY,
    equipment_name TEXT DEFAULT '', equipment_name_ar TEXT DEFAULT '',
    equipment_code TEXT DEFAULT '',
    category TEXT DEFAULT '',
    manufacturer TEXT DEFAULT '', model TEXT DEFAULT '',
    serial_number TEXT DEFAULT '',
    department TEXT DEFAULT '', location TEXT DEFAULT '',
    purchase_date TEXT DEFAULT '', warranty_end TEXT DEFAULT '',
    last_calibration TEXT DEFAULT '', next_calibration TEXT DEFAULT '',
    last_pm TEXT DEFAULT '', next_pm TEXT DEFAULT '',
    status TEXT DEFAULT 'Active',
    notes TEXT DEFAULT ''
);
CREATE TABLE IF NOT EXISTS maintenance_pm_schedules (
    id SERIAL PRIMARY KEY,
    equipment_id INTEGER,
    pm_type TEXT DEFAULT '',
    frequency TEXT DEFAULT 'Monthly',
    last_done TEXT DEFAULT '', next_due TEXT DEFAULT '',
    performed_by TEXT DEFAULT '',
    checklist TEXT DEFAULT '',
    status TEXT DEFAULT 'Pending',
    notes TEXT DEFAULT ''
);
        `);

        // ===== PATIENT TRANSPORT TABLES =====
        await client.query(`
CREATE TABLE IF NOT EXISTS transport_requests (
    id SERIAL PRIMARY KEY,
    patient_id INTEGER, patient_name TEXT DEFAULT '',
    from_location TEXT DEFAULT '', to_location TEXT DEFAULT '',
    transport_type TEXT DEFAULT 'Wheelchair',
    priority TEXT DEFAULT 'Routine',
    requested_by TEXT DEFAULT '',
    assigned_porter TEXT DEFAULT '',
    request_time TIMESTAMP DEFAULT CURRENT_TIMESTAMP,
    pickup_time TEXT DEFAULT '', dropoff_time TEXT DEFAULT '',
    special_needs TEXT DEFAULT '',
    status TEXT DEFAULT 'Pending',
    notes TEXT DEFAULT ''
);
        `);

        // ===== AUDIT TRAIL =====
        await client.query(`
CREATE TABLE IF NOT EXISTS audit_trail (
    id SERIAL PRIMARY KEY,
    user_id INTEGER, username TEXT DEFAULT '',
    action TEXT DEFAULT '',
    module TEXT DEFAULT '',
    record_id INTEGER DEFAULT 0,
    old_values TEXT DEFAULT '', new_values TEXT DEFAULT '',
    ip_address TEXT DEFAULT '',
    created_at TIMESTAMP DEFAULT CURRENT_TIMESTAMP
);
        `);

        // Seed emergency beds
        if (allowSeed) {
            const ebCount = (await client.query('SELECT COUNT(*) as cnt FROM emergency_beds')).rows[0].cnt;
            if (parseInt(ebCount) === 0) {
                await client.query(`INSERT INTO emergency_beds (bed_name, bed_name_ar, zone, zone_ar, status) VALUES
                    ('ER-1', 'طوارئ-1', 'Resuscitation', 'الإنعاش', 'Available'),
                    ('ER-2', 'طوارئ-2', 'Resuscitation', 'الإنعاش', 'Available'),
                    ('ER-3', 'طوارئ-3', 'Critical', 'الحرجة', 'Available'),
                    ('ER-4', 'طوارئ-4', 'Critical', 'الحرجة', 'Available'),
                    ('ER-5', 'طوارئ-5', 'Acute', 'الحادة', 'Available'),
                    ('ER-6', 'طوارئ-6', 'Acute', 'الحادة', 'Available'),
                    ('ER-7', 'طوارئ-7', 'Observation', 'المراقبة', 'Available'),
                    ('ER-8', 'طوارئ-8', 'Observation', 'المراقبة', 'Available')
                `);
            }
        }

        // Seed default wards and beds
        if (allowSeed) {
            const wardCount = (await client.query('SELECT COUNT(*) as cnt FROM wards')).rows[0].cnt;
            if (parseInt(wardCount) === 0) {
                await client.query(`INSERT INTO wards (ward_name, ward_name_ar, ward_type, floor, total_beds) VALUES
                    ('Medical Ward', 'جناح الباطنة', 'Medical', '2nd Floor', 20),
                    ('Surgical Ward', 'جناح الجراحة', 'Surgical', '3rd Floor', 20),
                    ('Pediatric Ward', 'جناح الأطفال', 'Pediatric', '4th Floor', 15),
                    ('Maternity Ward', 'جناح الولادة', 'Maternity', '4th Floor', 10),
                    ('ICU', 'العناية المركزة', 'ICU', '2nd Floor', 8),
                    ('NICU', 'عناية الأطفال المركزة', 'NICU', '4th Floor', 6),
                    ('CCU', 'عناية القلب', 'CCU', '2nd Floor', 6),
                    ('VIP Ward', 'جناح كبار الشخصيات', 'VIP', '5th Floor', 10)
                `);
                // Seed beds for each ward
                const wards = (await client.query('SELECT id, total_beds, ward_type FROM wards')).rows;
                for (const w of wards) {
                    for (let i = 1; i <= w.total_beds; i++) {
                        const bedType = w.ward_type === 'ICU' || w.ward_type === 'NICU' || w.ward_type === 'CCU' ? 'ICU' : w.ward_type === 'VIP' ? 'VIP' : 'Standard';
                        const room = Math.ceil(i / 2);
                        await client.query('INSERT INTO beds (ward_id, bed_number, bed_type, room_number, status) VALUES ($1, $2, $3, $4, $5)', [w.id, `${i}`, bedType, `${room}`, 'Available']);
                    }
                }
            }
        }

        // Migration: add commission columns to existing system_users table
        await client.query(`
            DO $$ BEGIN
                ALTER TABLE system_users ADD COLUMN commission_type TEXT DEFAULT 'percentage';
            EXCEPTION WHEN duplicate_column THEN NULL;
            END $$;
            DO $$ BEGIN
                ALTER TABLE system_users ADD COLUMN commission_value REAL DEFAULT 0;
            EXCEPTION WHEN duplicate_column THEN NULL;
            END $$;
        `);

        // Migration: add commission columns to employees table
        await client.query(`
            DO $$ BEGIN
                ALTER TABLE employees ADD COLUMN commission_type TEXT DEFAULT 'percentage';
            EXCEPTION WHEN duplicate_column THEN NULL;
            END $$;
            DO $$ BEGIN
                ALTER TABLE employees ADD COLUMN commission_value REAL DEFAULT 0;
            EXCEPTION WHEN duplicate_column THEN NULL;
            END $$;
        `);

        // Migration: add new nursing vitals columns
        const nursingCols = ['height REAL DEFAULT 0', 'respiratory_rate INTEGER DEFAULT 0', 'blood_sugar INTEGER DEFAULT 0', 'chronic_diseases TEXT DEFAULT \'\'', 'current_medications TEXT DEFAULT \'\'', 'allergies TEXT DEFAULT \'\''];
        for (const col of nursingCols) {
            const colName = col.split(' ')[0];
            await client.query(`DO $$ BEGIN ALTER TABLE nursing_vitals ADD COLUMN ${col}; EXCEPTION WHEN duplicate_column THEN NULL; END $$;`);
        }

        // Migration: add nationality column to patients table
        await client.query(`DO $$ BEGIN ALTER TABLE patients ADD COLUMN nationality TEXT DEFAULT ''; EXCEPTION WHEN duplicate_column THEN NULL; END $$;`);

        // Migration: add vat_amount column to invoices table
        await client.query(`DO $$ BEGIN ALTER TABLE invoices ADD COLUMN vat_amount REAL DEFAULT 0; EXCEPTION WHEN duplicate_column THEN NULL; END $$;`);

        // Migration: add blood_type and gender columns to patients table
        await client.query(`DO $$ BEGIN ALTER TABLE patients ADD COLUMN blood_type TEXT DEFAULT ''; EXCEPTION WHEN duplicate_column THEN NULL; END $$;`);
        await client.query(`DO $$ BEGIN ALTER TABLE patients ADD COLUMN gender TEXT DEFAULT ''; EXCEPTION WHEN duplicate_column THEN NULL; END $$;`);

        // Seed default operating rooms
        if (allowSeed) {
            const orCount = (await client.query('SELECT COUNT(*) as cnt FROM operating_rooms')).rows[0].cnt;
            if (parseInt(orCount) === 0) {
                await client.query(`INSERT INTO operating_rooms (room_name, room_name_ar, location, equipment, status) VALUES
                    ('OR-1', 'غرفة عمليات 1', 'الطابق الثاني', 'General Surgery Equipment', 'Available'),
                    ('OR-2', 'غرفة عمليات 2', 'الطابق الثاني', 'Orthopedic Equipment', 'Available'),
                    ('OR-3', 'غرفة عمليات 3', 'الطابق الثالث', 'Cardiac Equipment', 'Available'),
                    ('Minor OR', 'غرفة عمليات صغرى', 'الطابق الأول', 'Minor Procedures Equipment', 'Available')
                `);
            }
        }

        // Default settings
        if (allowSeed) {
            const settingKeys = ['company_name_ar', 'company_name_en', 'tax_number', 'address', 'phone', 'logo_path', 'sample_data_inserted', 'theme'];
            for (const key of settingKeys) {
                await client.query('INSERT INTO company_settings (setting_key, setting_value) VALUES ($1, $2) ON CONFLICT (setting_key) DO NOTHING', [key, '']);
            }
        }

        // ===== MEDICAL RECORDS / HIM =====
        await client.query(`
CREATE TABLE IF NOT EXISTS medical_records_files (
    id SERIAL PRIMARY KEY,
    tenant_id INTEGER NOT NULL REFERENCES tenants(id) ON DELETE CASCADE,
    patient_id INTEGER, file_number TEXT DEFAULT '',
    location TEXT DEFAULT 'Archive', shelf_number TEXT DEFAULT '',
    status TEXT DEFAULT 'In Archive',
    last_requested_by TEXT DEFAULT '', last_requested_at TEXT DEFAULT '',
    notes TEXT DEFAULT '',
    created_at TIMESTAMP DEFAULT CURRENT_TIMESTAMP
);
CREATE TABLE IF NOT EXISTS medical_records_requests (
    id SERIAL PRIMARY KEY,
    tenant_id INTEGER NOT NULL REFERENCES tenants(id) ON DELETE CASCADE,
    patient_id INTEGER, file_number TEXT DEFAULT '',
    requested_by TEXT DEFAULT '', department TEXT DEFAULT '',
    purpose TEXT DEFAULT 'Clinic Visit',
    status TEXT DEFAULT 'Pending',
    requested_at TIMESTAMP DEFAULT CURRENT_TIMESTAMP,
    delivered_at TEXT DEFAULT '', returned_at TEXT DEFAULT '',
    notes TEXT DEFAULT ''
);
CREATE TABLE IF NOT EXISTS medical_records_coding (
    id SERIAL PRIMARY KEY,
    tenant_id INTEGER NOT NULL REFERENCES tenants(id) ON DELETE CASCADE,
    patient_id INTEGER, visit_id INTEGER,
    primary_diagnosis TEXT DEFAULT '', primary_icd10 TEXT DEFAULT '',
    secondary_diagnoses TEXT DEFAULT '',
    drg_code TEXT DEFAULT '', coder TEXT DEFAULT '',
    coding_date TEXT DEFAULT '', status TEXT DEFAULT 'Pending',
    notes TEXT DEFAULT ''
);
        `);

        // ===== CLINICAL PHARMACY =====
        await client.query(`
CREATE TABLE IF NOT EXISTS clinical_pharmacy_reviews (
    id SERIAL PRIMARY KEY,
    tenant_id INTEGER NOT NULL REFERENCES tenants(id) ON DELETE CASCADE,
    patient_id INTEGER, patient_name TEXT DEFAULT '',
    prescription_id INTEGER,
    review_type TEXT DEFAULT 'Medication Review',
    pharmacist TEXT DEFAULT '',
    findings TEXT DEFAULT '', recommendations TEXT DEFAULT '',
    interventions TEXT DEFAULT '',
    outcome TEXT DEFAULT 'Pending',
    severity TEXT DEFAULT 'Low',
    status TEXT DEFAULT 'Open',
    branch_id INTEGER,
    created_at TIMESTAMP DEFAULT CURRENT_TIMESTAMP
);
CREATE TABLE IF NOT EXISTS drug_interactions (
    id SERIAL PRIMARY KEY,
    drug_a TEXT DEFAULT '', drug_b TEXT DEFAULT '',
    interaction_type TEXT DEFAULT '', severity TEXT DEFAULT 'Moderate',
    description TEXT DEFAULT '', clinical_action TEXT DEFAULT '',
    tenant_id INTEGER, branch_id INTEGER
);
CREATE TABLE IF NOT EXISTS patient_drug_education (
    id SERIAL PRIMARY KEY,
    tenant_id INTEGER NOT NULL REFERENCES tenants(id) ON DELETE CASCADE,
    patient_id INTEGER, patient_name TEXT DEFAULT '',
    medication TEXT DEFAULT '', instructions TEXT DEFAULT '',
    side_effects TEXT DEFAULT '', precautions TEXT DEFAULT '',
    educated_by TEXT DEFAULT '',
    branch_id INTEGER,
    created_at TIMESTAMP DEFAULT CURRENT_TIMESTAMP
);
        `);

        // ===== REHABILITATION / PT =====
        await client.query(`
CREATE TABLE IF NOT EXISTS rehab_patients (
    id SERIAL PRIMARY KEY,
    tenant_id INTEGER NOT NULL REFERENCES tenants(id) ON DELETE CASCADE,
    patient_id INTEGER, patient_name TEXT DEFAULT '',
    diagnosis TEXT DEFAULT '', referral_source TEXT DEFAULT '',
    therapist TEXT DEFAULT '', therapy_type TEXT DEFAULT 'Physical Therapy',
    start_date TEXT DEFAULT '', target_end_date TEXT DEFAULT '',
    status TEXT DEFAULT 'Active',
    notes TEXT DEFAULT '',
    created_at TIMESTAMP DEFAULT CURRENT_TIMESTAMP
);
CREATE TABLE IF NOT EXISTS rehab_sessions (
    id SERIAL PRIMARY KEY,
    tenant_id INTEGER NOT NULL REFERENCES tenants(id) ON DELETE CASCADE,
    rehab_patient_id INTEGER, patient_id INTEGER,
    session_date TEXT DEFAULT '', session_number INTEGER DEFAULT 1,
    therapist TEXT DEFAULT '',
    session_type TEXT DEFAULT 'Individual',
    exercises TEXT DEFAULT '', duration_minutes INTEGER DEFAULT 30,
    pain_before INTEGER DEFAULT 0, pain_after INTEGER DEFAULT 0,
    progress_notes TEXT DEFAULT '', status TEXT DEFAULT 'Completed',
    created_at TIMESTAMP DEFAULT CURRENT_TIMESTAMP
);
CREATE TABLE IF NOT EXISTS rehab_goals (
    id SERIAL PRIMARY KEY,
    tenant_id INTEGER NOT NULL REFERENCES tenants(id) ON DELETE CASCADE,
    rehab_patient_id INTEGER,
    goal_description TEXT DEFAULT '',
    target_date TEXT DEFAULT '',
    progress INTEGER DEFAULT 0,
    status TEXT DEFAULT 'In Progress',
    notes TEXT DEFAULT ''
);
CREATE TABLE IF NOT EXISTS rehab_assessments (
    id SERIAL PRIMARY KEY,
    tenant_id INTEGER NOT NULL REFERENCES tenants(id) ON DELETE CASCADE,
    rehab_patient_id INTEGER, patient_id INTEGER,
    assessment_type TEXT DEFAULT '',
    rom_scores TEXT DEFAULT '', strength_scores TEXT DEFAULT '',
    functional_scores TEXT DEFAULT '', balance_scores TEXT DEFAULT '',
    pain_level INTEGER DEFAULT 0,
    assessor TEXT DEFAULT '',
    created_at TIMESTAMP DEFAULT CURRENT_TIMESTAMP
);
        `);

        // ===== eMAR (Electronic Medication Administration Record) =====
        await client.query(`
CREATE TABLE IF NOT EXISTS emar_orders (
    id SERIAL PRIMARY KEY,
    patient_id INTEGER, patient_name TEXT DEFAULT '',
    admission_id INTEGER,
    medication TEXT DEFAULT '', dose TEXT DEFAULT '',
    route TEXT DEFAULT 'Oral', frequency TEXT DEFAULT 'TID',
    start_date TEXT DEFAULT '', end_date TEXT DEFAULT '',
    prescriber TEXT DEFAULT '', status TEXT DEFAULT 'Active',
    notes TEXT DEFAULT '',
    created_at TIMESTAMP DEFAULT CURRENT_TIMESTAMP
);
CREATE TABLE IF NOT EXISTS emar_administrations (
    id SERIAL PRIMARY KEY,
    emar_order_id INTEGER, patient_id INTEGER,
    medication TEXT DEFAULT '', dose TEXT DEFAULT '',
    scheduled_time TEXT DEFAULT '', actual_time TEXT DEFAULT '',
    administered_by TEXT DEFAULT '',
    status TEXT DEFAULT 'Given',
    reason_not_given TEXT DEFAULT '',
    vital_signs TEXT DEFAULT '',
    notes TEXT DEFAULT '',
    created_at TIMESTAMP DEFAULT CURRENT_TIMESTAMP
);
        `);

        // ===== NURSING CARE PLAN =====
        await client.query(`
CREATE TABLE IF NOT EXISTS nursing_care_plans (
    id SERIAL PRIMARY KEY,
    patient_id INTEGER, patient_name TEXT DEFAULT '',
    admission_id INTEGER,
    diagnosis TEXT DEFAULT '', priority TEXT DEFAULT 'Medium',
    goals TEXT DEFAULT '', interventions TEXT DEFAULT '',
    expected_outcomes TEXT DEFAULT '',
    nurse TEXT DEFAULT '', status TEXT DEFAULT 'Active',
    review_date TEXT DEFAULT '',
    created_at TIMESTAMP DEFAULT CURRENT_TIMESTAMP
);
CREATE TABLE IF NOT EXISTS nursing_assessments (
    id SERIAL PRIMARY KEY,
    patient_id INTEGER, patient_name TEXT DEFAULT '',
    assessment_type TEXT DEFAULT 'General',
    fall_risk_score INTEGER DEFAULT 0,
    braden_score INTEGER DEFAULT 23,
    pain_score INTEGER DEFAULT 0,
    gcs_score INTEGER DEFAULT 15,
    nurse TEXT DEFAULT '', shift TEXT DEFAULT 'Morning',
    notes TEXT DEFAULT '',
    created_at TIMESTAMP DEFAULT CURRENT_TIMESTAMP
);
        `);

        // ===== FINANCIAL DAILY CLOSE =====
        await client.query(`
CREATE TABLE IF NOT EXISTS daily_close (
    id SERIAL PRIMARY KEY,
    close_date TEXT DEFAULT '',
    cashier TEXT DEFAULT '',
    total_cash NUMERIC(12,2) DEFAULT 0,
    total_card NUMERIC(12,2) DEFAULT 0,
    total_insurance NUMERIC(12,2) DEFAULT 0,
    total_transactions INTEGER DEFAULT 0,
    opening_balance NUMERIC(12,2) DEFAULT 0,
    closing_balance NUMERIC(12,2) DEFAULT 0,
    variance NUMERIC(12,2) DEFAULT 0,
    notes TEXT DEFAULT '', status TEXT DEFAULT 'Open',
    closed_by TEXT DEFAULT '',
    created_at TIMESTAMP DEFAULT CURRENT_TIMESTAMP
);
        `);

        // ===== PATIENT PORTAL =====
        await client.query(`
CREATE TABLE IF NOT EXISTS portal_users (
    id SERIAL PRIMARY KEY,
    tenant_id INTEGER NOT NULL REFERENCES tenants(id) ON DELETE CASCADE,
    patient_id INTEGER UNIQUE, username TEXT DEFAULT '',
    password_hash TEXT DEFAULT '', email TEXT DEFAULT '',
    phone TEXT DEFAULT '', is_active INTEGER DEFAULT 1,
    last_login TEXT DEFAULT '',
    created_at TIMESTAMP DEFAULT CURRENT_TIMESTAMP
);
CREATE TABLE IF NOT EXISTS portal_appointments (
    id SERIAL PRIMARY KEY,
    tenant_id INTEGER NOT NULL REFERENCES tenants(id) ON DELETE CASCADE,
    patient_id INTEGER, portal_user_id INTEGER,
    department TEXT DEFAULT '', preferred_date TEXT DEFAULT '',
    preferred_time TEXT DEFAULT '', reason TEXT DEFAULT '',
    status TEXT DEFAULT 'Requested',
    notes TEXT DEFAULT '',
    created_at TIMESTAMP DEFAULT CURRENT_TIMESTAMP
);
        `);

        // ===== ZATCA E-INVOICING =====
        await client.query(`
CREATE TABLE IF NOT EXISTS zatca_invoices (
    id SERIAL PRIMARY KEY,
    invoice_id INTEGER, invoice_number TEXT DEFAULT '',
    invoice_type TEXT DEFAULT 'Standard',
    seller_name TEXT DEFAULT '', seller_vat TEXT DEFAULT '',
    buyer_name TEXT DEFAULT '', buyer_vat TEXT DEFAULT '',
    total_before_vat NUMERIC(12,2) DEFAULT 0,
    vat_amount NUMERIC(12,2) DEFAULT 0,
    total_with_vat NUMERIC(12,2) DEFAULT 0,
    qr_code TEXT DEFAULT '', xml_hash TEXT DEFAULT '',
    submission_status TEXT DEFAULT 'Pending',
    submission_date TEXT DEFAULT '',
    zatca_response TEXT DEFAULT '',
    created_at TIMESTAMP DEFAULT CURRENT_TIMESTAMP
);
        `);

        // ===== TELEMEDICINE =====
        await client.query(`
CREATE TABLE IF NOT EXISTS telemedicine_sessions (
    id SERIAL PRIMARY KEY,
    patient_id INTEGER, patient_name TEXT DEFAULT '',
    doctor TEXT DEFAULT '', speciality TEXT DEFAULT '',
    session_type TEXT DEFAULT 'Video',
    scheduled_date TEXT DEFAULT '', scheduled_time TEXT DEFAULT '',
    duration_minutes INTEGER DEFAULT 15,
    meeting_link TEXT DEFAULT '',
    diagnosis TEXT DEFAULT '', prescription TEXT DEFAULT '',
    status TEXT DEFAULT 'Scheduled',
    notes TEXT DEFAULT '',
    created_at TIMESTAMP DEFAULT CURRENT_TIMESTAMP
);
        `);

        // ===== PATHOLOGY =====
        await client.query(`
CREATE TABLE IF NOT EXISTS pathology_cases (
    id SERIAL PRIMARY KEY,
    patient_id INTEGER, patient_name TEXT DEFAULT '',
    specimen_type TEXT DEFAULT '', collection_date TEXT DEFAULT '',
    received_date TEXT DEFAULT '',
    pathologist TEXT DEFAULT '',
    gross_description TEXT DEFAULT '',
    microscopic_findings TEXT DEFAULT '',
    diagnosis TEXT DEFAULT '', icd_code TEXT DEFAULT '',
    stage TEXT DEFAULT '', grade TEXT DEFAULT '',
    status TEXT DEFAULT 'Received',
    report_date TEXT DEFAULT '',
    notes TEXT DEFAULT '',
    created_at TIMESTAMP DEFAULT CURRENT_TIMESTAMP
);
        `);

        // ===== SOCIAL WORK =====
        await client.query(`
CREATE TABLE IF NOT EXISTS social_work_cases (
    id SERIAL PRIMARY KEY,
    patient_id INTEGER, patient_name TEXT DEFAULT '',
    case_type TEXT DEFAULT 'General',
    social_worker TEXT DEFAULT '',
    assessment TEXT DEFAULT '', plan TEXT DEFAULT '',
    interventions TEXT DEFAULT '',
    referrals TEXT DEFAULT '',
    status TEXT DEFAULT 'Open',
    priority TEXT DEFAULT 'Medium',
    follow_up_date TEXT DEFAULT '',
    notes TEXT DEFAULT '',
    created_at TIMESTAMP DEFAULT CURRENT_TIMESTAMP
);
        `);

        // ===== MORTUARY =====
        await client.query(`
CREATE TABLE IF NOT EXISTS mortuary_cases (
    id SERIAL PRIMARY KEY,
    patient_id INTEGER, deceased_name TEXT DEFAULT '',
    date_of_death TEXT DEFAULT '', time_of_death TEXT DEFAULT '',
    cause_of_death TEXT DEFAULT '', icd_code TEXT DEFAULT '',
    attending_physician TEXT DEFAULT '',
    next_of_kin TEXT DEFAULT '', next_of_kin_phone TEXT DEFAULT '',
    autopsy_required INTEGER DEFAULT 0,
    body_location TEXT DEFAULT '',
    release_status TEXT DEFAULT 'Pending',
    released_to TEXT DEFAULT '', released_date TEXT DEFAULT '',
    death_certificate_number TEXT DEFAULT '',
    notes TEXT DEFAULT '',
    created_at TIMESTAMP DEFAULT CURRENT_TIMESTAMP
);
        `);

        // ===== CME (Continuing Medical Education) =====
        await client.query(`
CREATE TABLE IF NOT EXISTS cme_activities (
    id SERIAL PRIMARY KEY,
    title TEXT DEFAULT '', category TEXT DEFAULT 'Conference',
    provider TEXT DEFAULT '', credit_hours NUMERIC(4,1) DEFAULT 0,
    activity_date TEXT DEFAULT '',
    location TEXT DEFAULT '',
    max_participants INTEGER DEFAULT 50,
    registered INTEGER DEFAULT 0,
    status TEXT DEFAULT 'Upcoming',
    description TEXT DEFAULT '',
    created_at TIMESTAMP DEFAULT CURRENT_TIMESTAMP
);
CREATE TABLE IF NOT EXISTS cme_registrations (
    id SERIAL PRIMARY KEY,
    activity_id INTEGER, employee_id INTEGER,
    employee_name TEXT DEFAULT '',
    registration_date TEXT DEFAULT '',
    attendance_status TEXT DEFAULT 'Registered',
    certificate_issued INTEGER DEFAULT 0,
    notes TEXT DEFAULT ''
);
        `);

        // ===== COSMETIC / PLASTIC SURGERY =====
        await client.query(`
CREATE TABLE IF NOT EXISTS cosmetic_procedures (
    id SERIAL PRIMARY KEY,
    name_en TEXT DEFAULT '', name_ar TEXT DEFAULT '',
    category TEXT DEFAULT 'Face',
    description TEXT DEFAULT '',
    estimated_duration INTEGER DEFAULT 60,
    anesthesia_type TEXT DEFAULT 'Local',
    average_cost NUMERIC(12,2) DEFAULT 0,
    risks TEXT DEFAULT '',
    recovery_days INTEGER DEFAULT 7,
    is_active INTEGER DEFAULT 1
);
CREATE TABLE IF NOT EXISTS cosmetic_cases (
    id SERIAL PRIMARY KEY,
    patient_id INTEGER, patient_name TEXT DEFAULT '',
    procedure_id INTEGER, procedure_name TEXT DEFAULT '',
    surgeon TEXT DEFAULT '', assistant TEXT DEFAULT '',
    anesthetist TEXT DEFAULT '',
    surgery_date TEXT DEFAULT '', surgery_time TEXT DEFAULT '',
    duration_minutes INTEGER DEFAULT 60,
    anesthesia_type TEXT DEFAULT 'Local',
    operating_room TEXT DEFAULT '',
    pre_op_notes TEXT DEFAULT '',
    operative_notes TEXT DEFAULT '',
    post_op_notes TEXT DEFAULT '',
    complications TEXT DEFAULT '',
    total_cost NUMERIC(12,2) DEFAULT 0,
    payment_status TEXT DEFAULT 'Pending',
    status TEXT DEFAULT 'Scheduled',
    created_at TIMESTAMP DEFAULT CURRENT_TIMESTAMP
);
CREATE TABLE IF NOT EXISTS cosmetic_consents (
    id SERIAL PRIMARY KEY,
    case_id INTEGER, patient_id INTEGER,
    patient_name TEXT DEFAULT '',
    procedure_name TEXT DEFAULT '',
    consent_type TEXT DEFAULT 'Surgery',
    surgeon TEXT DEFAULT '',
    risks_explained TEXT DEFAULT '',
    alternatives_explained TEXT DEFAULT '',
    expected_results TEXT DEFAULT '',
    limitations TEXT DEFAULT '',
    patient_questions TEXT DEFAULT '',
    is_photography_consent INTEGER DEFAULT 0,
    is_anesthesia_consent INTEGER DEFAULT 0,
    is_blood_transfusion_consent INTEGER DEFAULT 0,
    witness_name TEXT DEFAULT '',
    consent_date TEXT DEFAULT '',
    consent_time TEXT DEFAULT '',
    patient_signature TEXT DEFAULT '',
    witness_signature TEXT DEFAULT '',
    status TEXT DEFAULT 'Pending',
    created_at TIMESTAMP DEFAULT CURRENT_TIMESTAMP
);
CREATE TABLE IF NOT EXISTS cosmetic_photos (
    id SERIAL PRIMARY KEY,
    case_id INTEGER, patient_id INTEGER,
    photo_type TEXT DEFAULT 'Before',
    photo_angle TEXT DEFAULT 'Front',
    photo_date TEXT DEFAULT '',
    photo_path TEXT DEFAULT '',
    notes TEXT DEFAULT '',
    taken_by TEXT DEFAULT '',
    created_at TIMESTAMP DEFAULT CURRENT_TIMESTAMP
);
CREATE TABLE IF NOT EXISTS cosmetic_followups (
    id SERIAL PRIMARY KEY,
    case_id INTEGER, patient_id INTEGER,
    patient_name TEXT DEFAULT '',
    followup_date TEXT DEFAULT '',
    days_post_op INTEGER DEFAULT 0,
    healing_status TEXT DEFAULT 'Good',
    pain_level INTEGER DEFAULT 0,
    swelling TEXT DEFAULT 'Mild',
    complications TEXT DEFAULT '',
    patient_satisfaction INTEGER DEFAULT 0,
    surgeon_notes TEXT DEFAULT '',
    next_followup TEXT DEFAULT '',
    surgeon TEXT DEFAULT '',
    status TEXT DEFAULT 'Completed',
    created_at TIMESTAMP DEFAULT CURRENT_TIMESTAMP
);
        `);

        // Seed cosmetic procedures catalog
        if (allowSeed) {
            await client.query(`INSERT INTO cosmetic_procedures (name_en, name_ar, category, description, estimated_duration, anesthesia_type, average_cost, risks, recovery_days) VALUES
                ('Rhinoplasty', 'تجميل الأنف', 'Face', 'Reshaping of the nose for aesthetic or functional purposes', 120, 'General', 15000, 'Bleeding, infection, asymmetry, breathing difficulties, numbness', 14),
                ('Blepharoplasty', 'شد الجفون', 'Face', 'Upper and/or lower eyelid surgery to remove excess skin and fat', 90, 'Local', 8000, 'Dry eyes, blurred vision, asymmetry, scarring', 10),
                ('Facelift (Rhytidectomy)', 'شد الوجه', 'Face', 'Lifting and tightening facial tissues to reduce sagging', 180, 'General', 25000, 'Hematoma, nerve injury, scarring, hair loss near incisions', 21),
                ('Otoplasty', 'تجميل الأذن', 'Face', 'Reshaping or repositioning of the ears', 90, 'Local', 7000, 'Asymmetry, infection, overcorrection, scarring', 7),
                ('Lip Augmentation', 'تكبير الشفاه', 'Face', 'Enhancement of lip volume using fillers or implants', 30, 'Local', 3000, 'Swelling, bruising, asymmetry, allergic reaction', 3),
                ('Botox Injection', 'حقن البوتوكس', 'Non-Surgical', 'Wrinkle relaxation using botulinum toxin', 15, 'None', 1500, 'Bruising, headache, drooping, temporary weakness', 0),
                ('Dermal Fillers', 'حقن الفيلر', 'Non-Surgical', 'Volume restoration using hyaluronic acid fillers', 30, 'Local', 2500, 'Swelling, bruising, lumps, vascular occlusion', 2),
                ('Chemical Peel', 'التقشير الكيميائي', 'Non-Surgical', 'Chemical solution applied to improve skin texture', 45, 'None', 1000, 'Redness, peeling, pigmentation changes, scarring', 5),
                ('Breast Augmentation', 'تكبير الثدي', 'Body', 'Enlargement using implants or fat transfer', 120, 'General', 20000, 'Capsular contracture, implant rupture, asymmetry, infection', 14),
                ('Liposuction', 'شفط الدهون', 'Body', 'Removal of excess fat deposits from specific body areas', 120, 'General', 12000, 'Contour irregularities, fluid accumulation, numbness', 14),
                ('Abdominoplasty', 'شد البطن', 'Body', 'Removal of excess skin and fat from the abdomen', 180, 'General', 18000, 'Seroma, wound healing issues, scarring, numbness', 21),
                ('Laser Hair Removal', 'إزالة الشعر بالليزر', 'Laser', 'Permanent hair reduction using laser technology', 30, 'None', 500, 'Burns, pigmentation changes, paradoxical growth', 0),
                ('Laser Skin Resurfacing', 'تقشير البشرة بالليزر', 'Laser', 'Laser treatment to improve skin texture and reduce wrinkles', 60, 'Local', 3000, 'Redness, swelling, infection, pigmentation changes', 7),
                ('Hair Transplant (FUE)', 'زراعة الشعر', 'Hair', 'Follicular unit extraction for hair restoration', 360, 'Local', 15000, 'Infection, scarring, graft failure, temporary shock loss', 14),
                ('PRP Therapy', 'علاج البلازما', 'Non-Surgical', 'Platelet-rich plasma injections for skin rejuvenation', 30, 'None', 1500, 'Bruising, swelling, infection, minimal pain', 1)
            ON CONFLICT DO NOTHING`);
        }

        // ===== TENANT ISOLATION FOUNDATION TABLES =====
        await client.query(`
            CREATE TABLE IF NOT EXISTS tenants (
                id SERIAL PRIMARY KEY,
                name VARCHAR(200) NOT NULL,
                subdomain VARCHAR(100) UNIQUE NOT NULL,
                status VARCHAR(50) DEFAULT 'active',
                plan_type VARCHAR(50) DEFAULT 'standard',
                created_at TIMESTAMP DEFAULT CURRENT_TIMESTAMP
            );
            CREATE TABLE IF NOT EXISTS facilities (
                id SERIAL PRIMARY KEY,
                tenant_id INTEGER NOT NULL REFERENCES tenants(id) ON DELETE CASCADE,
                name VARCHAR(255) NOT NULL,
                tax_number VARCHAR(100),
                created_at TIMESTAMP DEFAULT CURRENT_TIMESTAMP
            );
            CREATE TABLE IF NOT EXISTS branches (
                id SERIAL PRIMARY KEY,
                facility_id INTEGER NOT NULL REFERENCES facilities(id) ON DELETE CASCADE,
                name VARCHAR(255) NOT NULL,
                address TEXT,
                created_at TIMESTAMP DEFAULT CURRENT_TIMESTAMP
            );
            CREATE TABLE IF NOT EXISTS departments (
                id SERIAL PRIMARY KEY,
                branch_id INTEGER NOT NULL REFERENCES branches(id) ON DELETE CASCADE,
                name_ar VARCHAR(255) NOT NULL,
                name_en VARCHAR(255) NOT NULL,
                is_active BOOLEAN DEFAULT TRUE,
                created_at TIMESTAMP DEFAULT CURRENT_TIMESTAMP
            );
            CREATE TABLE IF NOT EXISTS user_tenants (
                id SERIAL PRIMARY KEY,
                user_id INTEGER NOT NULL REFERENCES system_users(id) ON DELETE CASCADE,
                tenant_id INTEGER NOT NULL REFERENCES tenants(id) ON DELETE CASCADE,
                is_active BOOLEAN DEFAULT TRUE,
                created_at TIMESTAMP DEFAULT CURRENT_TIMESTAMP,
                CONSTRAINT uq_user_tenant UNIQUE(user_id, tenant_id)
            );
            CREATE TABLE IF NOT EXISTS user_facilities (
                id SERIAL PRIMARY KEY,
                user_id INTEGER NOT NULL REFERENCES system_users(id) ON DELETE CASCADE,
                facility_id INTEGER NOT NULL REFERENCES facilities(id) ON DELETE CASCADE,
                branch_id INTEGER NOT NULL REFERENCES branches(id) ON DELETE CASCADE,
                is_primary BOOLEAN DEFAULT TRUE,
                created_at TIMESTAMP DEFAULT CURRENT_TIMESTAMP,
                CONSTRAINT uq_user_facility_branch UNIQUE(user_id, facility_id, branch_id)
            );
            CREATE TABLE IF NOT EXISTS tenant_settings (
                id SERIAL PRIMARY KEY,
                tenant_id INTEGER NOT NULL REFERENCES tenants(id) ON DELETE CASCADE,
                setting_key VARCHAR(100) NOT NULL,
                setting_value TEXT NOT NULL,
                CONSTRAINT uq_tenant_setting_key UNIQUE(tenant_id, setting_key)
            );

            -- Lab Tests Overrides
            CREATE TABLE IF NOT EXISTS tenant_lab_test_overrides (
                id SERIAL PRIMARY KEY,
                tenant_id INTEGER NOT NULL REFERENCES tenants(id) ON DELETE CASCADE,
                test_id INTEGER NOT NULL REFERENCES lab_tests_catalog(id) ON DELETE CASCADE,
                custom_price REAL NOT NULL,
                is_active INTEGER DEFAULT 1,
                created_at TIMESTAMP DEFAULT CURRENT_TIMESTAMP,
                updated_at TIMESTAMP DEFAULT CURRENT_TIMESTAMP,
                CONSTRAINT uq_tenant_lab_test UNIQUE (tenant_id, test_id)
            );
            CREATE INDEX IF NOT EXISTS idx_tenant_lab_overrides ON tenant_lab_test_overrides (tenant_id, test_id);
            ALTER TABLE tenant_lab_test_overrides ENABLE ROW LEVEL SECURITY;
            ALTER TABLE tenant_lab_test_overrides FORCE ROW LEVEL SECURITY;
            DROP POLICY IF EXISTS rls_tenant_lab_test_overrides_tenant_isolation ON tenant_lab_test_overrides;
            CREATE POLICY rls_tenant_lab_test_overrides_tenant_isolation ON tenant_lab_test_overrides
                FOR ALL
                USING (tenant_id = NULLIF(current_setting('app.tenant_id', true), '')::integer)
                WITH CHECK (tenant_id = NULLIF(current_setting('app.tenant_id', true), '')::integer);

            -- Radiology Overrides
            CREATE TABLE IF NOT EXISTS tenant_radiology_overrides (
                id SERIAL PRIMARY KEY,
                tenant_id INTEGER NOT NULL REFERENCES tenants(id) ON DELETE CASCADE,
                radiology_id INTEGER NOT NULL REFERENCES radiology_catalog(id) ON DELETE CASCADE,
                custom_price REAL NOT NULL,
                custom_template TEXT,
                is_active INTEGER DEFAULT 1,
                created_at TIMESTAMP DEFAULT CURRENT_TIMESTAMP,
                updated_at TIMESTAMP DEFAULT CURRENT_TIMESTAMP,
                CONSTRAINT uq_tenant_radiology UNIQUE (tenant_id, radiology_id)
            );
            CREATE INDEX IF NOT EXISTS idx_tenant_rad_overrides ON tenant_radiology_overrides (tenant_id, radiology_id);
            ALTER TABLE tenant_radiology_overrides ENABLE ROW LEVEL SECURITY;
            ALTER TABLE tenant_radiology_overrides FORCE ROW LEVEL SECURITY;
            DROP POLICY IF EXISTS rls_tenant_radiology_overrides_tenant_isolation ON tenant_radiology_overrides;
            CREATE POLICY rls_tenant_radiology_overrides_tenant_isolation ON tenant_radiology_overrides
                FOR ALL
                USING (tenant_id = NULLIF(current_setting('app.tenant_id', true), '')::integer)
                WITH CHECK (tenant_id = NULLIF(current_setting('app.tenant_id', true), '')::integer);

            -- Medical Services Overrides
            CREATE TABLE IF NOT EXISTS tenant_service_overrides (
                id SERIAL PRIMARY KEY,
                tenant_id INTEGER NOT NULL REFERENCES tenants(id) ON DELETE CASCADE,
                service_id INTEGER NOT NULL REFERENCES medical_services(id) ON DELETE CASCADE,
                custom_price REAL NOT NULL,
                is_active INTEGER DEFAULT 1,
                created_at TIMESTAMP DEFAULT CURRENT_TIMESTAMP,
                updated_at TIMESTAMP DEFAULT CURRENT_TIMESTAMP,
                CONSTRAINT uq_tenant_service UNIQUE (tenant_id, service_id)
            );
            CREATE INDEX IF NOT EXISTS idx_tenant_svc_overrides ON tenant_service_overrides (tenant_id, service_id);
            ALTER TABLE tenant_service_overrides ENABLE ROW LEVEL SECURITY;
            ALTER TABLE tenant_service_overrides FORCE ROW LEVEL SECURITY;
            DROP POLICY IF EXISTS rls_tenant_service_overrides_tenant_isolation ON tenant_service_overrides;
            CREATE POLICY rls_tenant_service_overrides_tenant_isolation ON tenant_service_overrides
                FOR ALL
                USING (tenant_id = NULLIF(current_setting('app.tenant_id', true), '')::integer)
                WITH CHECK (tenant_id = NULLIF(current_setting('app.tenant_id', true), '')::integer);
        `);

        // ===== IDEMPOTENT SEED DATA FOR DEFAULT TENANT =====
        if (allowSeed) {
            // Default Tenant
            await client.query(`
                INSERT INTO tenants (id, name, subdomain, status, plan_type) 
                VALUES (1, 'Nama Medical Default Tenant', 'default', 'active', 'standard') 
                ON CONFLICT (id) DO NOTHING
            `);
            // Default Facility
            await client.query(`
                INSERT INTO facilities (id, tenant_id, name, tax_number) 
                VALUES (1, 1, 'Default Medical Facility', '300000000000003') 
                ON CONFLICT (id) DO NOTHING
            `);
            // Default Branch
            await client.query(`
                ALTER TABLE branches ADD COLUMN IF NOT EXISTS facility_id INTEGER;
            `);
            await client.query(`
                INSERT INTO branches (id, facility_id, name, address) 
                VALUES (1, 1, 'Main Branch', 'Riyadh, Saudi Arabia') 
                ON CONFLICT (id) DO NOTHING
            `);

            // Synchronize sequences after manual seeding of ID 1
            await client.query(`
                SELECT setval(pg_get_serial_sequence('tenants', 'id'), COALESCE((SELECT MAX(id)+1 FROM tenants), 1), false);
                SELECT setval(pg_get_serial_sequence('facilities', 'id'), COALESCE((SELECT MAX(id)+1 FROM facilities), 1), false);
                SELECT setval(pg_get_serial_sequence('branches', 'id'), COALESCE((SELECT MAX(id)+1 FROM branches), 1), false);
            `).catch(err => console.error('Sequence sync error:', err.message));

            // Seed plans and plan_entitlements
            const plansCount = (await client.query("SELECT COUNT(*) as cnt FROM plans")).rows[0].cnt;
            if (parseInt(plansCount) === 0) {
                const plans = [
                    { key: 'free_trial', name_ar: 'فترة تجريبية', name_en: 'Free Trial', desc_ar: 'تجربة مجانية لمدة 14 يوماً', desc_en: '14-day free trial', curr: 'SAR', m_price: 0, y_price: 0, trial: 14, sort: 1, max_u: 3, max_b: 1, max_i: 100, mods: 'dashboard,patients,appointments,settings', support: 'basic', api: false, domain: false },
                    { key: 'basic', name_ar: 'الباقة الأساسية', name_en: 'Basic Plan', desc_ar: 'للمستشفيات والعيادات الصغيرة', desc_en: 'For small clinics and hospitals', curr: 'SAR', m_price: 150, y_price: 1500, trial: 0, sort: 2, max_u: 10, max_b: 2, max_i: 1000, mods: 'dashboard,patients,appointments,nursing,billing,settings', support: 'standard', api: false, domain: false },
                    { key: 'premium', name_ar: 'الباقة المتميزة', name_en: 'Premium Plan', desc_ar: 'للمراكز الطبية المتوسطة والكبيرة', desc_en: 'For medium to large medical centers', curr: 'SAR', m_price: 500, y_price: 5000, trial: 0, sort: 3, max_u: 50, max_b: 5, max_i: 5000, mods: 'dashboard,patients,appointments,nursing,lab,radiology,pharmacy,inventory,billing,settings', support: 'priority', api: true, domain: true },
                    { key: 'enterprise', name_ar: 'باقة المنشآت الكبرى', name_en: 'Enterprise Plan', desc_ar: 'حلول متكاملة للمستشفيات والمجموعات الكبرى', desc_en: 'Complete solutions for large hospitals and groups', curr: 'SAR', m_price: 2000, y_price: 20000, trial: 0, sort: 4, max_u: null, max_b: null, max_i: null, mods: 'dashboard,patients,appointments,doctor,nursing,lab,radiology,pharmacy,inventory,invoices,accounts,finance,insurance,reports,messaging,settings,surgery,icu,emergency,inpatient,bloodbank,obgyn,antenatal,cssd,quality,infection,him,medical-records,pathology,hr,maintenance,api', support: 'enterprise', api: true, domain: true }
                ];
                for (const p of plans) {
                    const row = (await client.query(`
                        INSERT INTO plans (plan_key, name_ar, name_en, description_ar, description_en, currency, monthly_price, yearly_price, trial_days, sort_order)
                        VALUES ($1, $2, $3, $4, $5, $6, $7, $8, $9, $10) RETURNING id
                    `, [p.key, p.name_ar, p.name_en, p.desc_ar, p.desc_en, p.curr, p.m_price, p.y_price, p.trial, p.sort])).rows[0];
                    await client.query(`
                        INSERT INTO plan_entitlements (plan_id, max_users, max_branches, max_invoices_per_month, modules_enabled, support_level, api_access, custom_domain)
                        VALUES ($1, $2, $3, $4, $5, $6, $7, $8)
                    `, [row.id, p.max_u, p.max_b, p.max_i, p.mods, p.support, p.api, p.domain]);
                }
            }

            // Default tenant plan assignment
            await client.query(`
                INSERT INTO tenant_plan_assignments (tenant_id, plan_key, assignment_source)
                VALUES (1, 'premium', 'manual')
                ON CONFLICT DO NOTHING
            `);

            // Default admin
            await client.query(`INSERT INTO system_users (username, password_hash, display_name, role) VALUES ('admin', '$2b$12$G36aRwyn13/eICGIdRF4leQfi/g6xYROPVNvQ1cMrh95PDK9fbs0q', 'المدير العام', 'Admin') ON CONFLICT (username) DO NOTHING`);

            // Map admin to default tenant/facility
            await client.query(`
                INSERT INTO user_tenants (user_id, tenant_id) 
                VALUES ((SELECT id FROM system_users WHERE username='admin' LIMIT 1), 1) 
                ON CONFLICT (user_id, tenant_id) DO NOTHING
            `);
            await client.query(`
                INSERT INTO user_facilities (user_id, facility_id, branch_id) 
                VALUES ((SELECT id FROM system_users WHERE username='admin' LIMIT 1), 1, 1) 
                ON CONFLICT (user_id, facility_id, branch_id) DO NOTHING
            `);

            // Seed integration_settings for tenant 1
            const intCount = (await client.query("SELECT COUNT(*) as cnt FROM integration_settings WHERE tenant_id = 1")).rows[0].cnt;
            if (parseInt(intCount) === 0) {
                await client.query(`
                    INSERT INTO integration_settings (tenant_id, integration_name, provider, endpoint_url, is_enabled, config_json) VALUES
                    (1, 'ZATCA', 'ZATCA', 'https://gw-fatoora.zatca.gov.sa/sdk/api/v2', 1, '{}'),
                    (1, 'NPHIES', 'NPHIES', 'https://nphies.sa/api/v1/fhir', 1, '{}'),
                    (1, 'CBAHI', 'CBAHI', 'https://cbahi.gov.sa/api/v1', 0, '{}'),
                    (1, 'PDPL', 'Jumanasoft-Sec', 'https://www.jumanasoft.com/api/pdpl', 1, '{}')
                `);
            }
        }

        // ===== MIGRATIONS: Add missing columns to existing tables =====
        try {
            await client.query(`
                ALTER TABLE emergency_visits ADD COLUMN IF NOT EXISTS discharge_time TEXT DEFAULT '';
                ALTER TABLE emergency_visits ADD COLUMN IF NOT EXISTS discharge_diagnosis TEXT DEFAULT '';
                ALTER TABLE emergency_visits ADD COLUMN IF NOT EXISTS discharge_instructions TEXT DEFAULT '';
                ALTER TABLE emergency_visits ADD COLUMN IF NOT EXISTS discharge_medications TEXT DEFAULT '';
                ALTER TABLE emergency_visits ADD COLUMN IF NOT EXISTS followup_date TEXT DEFAULT '';

                -- Tenant columns and backfill for test tables (patients, invoices)
                ALTER TABLE patients ADD COLUMN IF NOT EXISTS tenant_id INTEGER;
                ALTER TABLE patients ADD COLUMN IF NOT EXISTS facility_id INTEGER;
                ALTER TABLE invoices ADD COLUMN IF NOT EXISTS tenant_id INTEGER;
                ALTER TABLE invoices ADD COLUMN IF NOT EXISTS facility_id INTEGER;

                -- Additional tenant columns for all other tables
ALTER TABLE medical_records ADD COLUMN IF NOT EXISTS tenant_id INTEGER;
ALTER TABLE medical_records ADD COLUMN IF NOT EXISTS facility_id INTEGER;
CREATE INDEX IF NOT EXISTS idx_medical_records_tenant_facility ON medical_records (tenant_id, facility_id, patient_id);
ALTER TABLE prescriptions ADD COLUMN IF NOT EXISTS tenant_id INTEGER;
ALTER TABLE prescriptions ADD COLUMN IF NOT EXISTS facility_id INTEGER;
CREATE INDEX IF NOT EXISTS idx_prescriptions_tenant_facility ON prescriptions (tenant_id, facility_id, patient_id);
ALTER TABLE dental_records ADD COLUMN IF NOT EXISTS tenant_id INTEGER;
ALTER TABLE dental_records ADD COLUMN IF NOT EXISTS facility_id INTEGER;
CREATE INDEX IF NOT EXISTS idx_dental_records_tenant_facility ON dental_records (tenant_id, facility_id, patient_id);
ALTER TABLE lab_radiology_orders ADD COLUMN IF NOT EXISTS tenant_id INTEGER;
ALTER TABLE lab_radiology_orders ADD COLUMN IF NOT EXISTS facility_id INTEGER;
CREATE INDEX IF NOT EXISTS idx_lab_rad_orders_tenant_facility ON lab_radiology_orders (tenant_id, facility_id, patient_id);
ALTER TABLE lab_results ADD COLUMN IF NOT EXISTS tenant_id INTEGER;
ALTER TABLE lab_results ADD COLUMN IF NOT EXISTS facility_id INTEGER;
CREATE INDEX IF NOT EXISTS idx_lab_results_tenant_facility ON lab_results (tenant_id, facility_id);
ALTER TABLE nursing_vitals ADD COLUMN IF NOT EXISTS tenant_id INTEGER;
ALTER TABLE nursing_vitals ADD COLUMN IF NOT EXISTS facility_id INTEGER;
CREATE INDEX IF NOT EXISTS idx_nursing_vitals_tenant_facility ON nursing_vitals (tenant_id, facility_id, patient_id);
ALTER TABLE medical_certificates ADD COLUMN IF NOT EXISTS tenant_id INTEGER;
ALTER TABLE medical_certificates ADD COLUMN IF NOT EXISTS facility_id INTEGER;
CREATE INDEX IF NOT EXISTS idx_med_certificates_tenant_facility ON medical_certificates (tenant_id, facility_id);
ALTER TABLE patient_referrals ADD COLUMN IF NOT EXISTS tenant_id INTEGER;
ALTER TABLE patient_referrals ADD COLUMN IF NOT EXISTS facility_id INTEGER;
CREATE INDEX IF NOT EXISTS idx_patient_referrals_tenant_facility ON patient_referrals (tenant_id, facility_id);
ALTER TABLE surgeries ADD COLUMN IF NOT EXISTS tenant_id INTEGER;
ALTER TABLE surgeries ADD COLUMN IF NOT EXISTS facility_id INTEGER;
CREATE INDEX IF NOT EXISTS idx_surgeries_tenant_facility ON surgeries (tenant_id, facility_id);
ALTER TABLE surgery_preop_assessments ADD COLUMN IF NOT EXISTS tenant_id INTEGER;
ALTER TABLE surgery_preop_assessments ADD COLUMN IF NOT EXISTS facility_id INTEGER;
ALTER TABLE surgery_preop_tests ADD COLUMN IF NOT EXISTS tenant_id INTEGER;
ALTER TABLE surgery_preop_tests ADD COLUMN IF NOT EXISTS facility_id INTEGER;
ALTER TABLE surgery_anesthesia_records ADD COLUMN IF NOT EXISTS tenant_id INTEGER;
ALTER TABLE surgery_anesthesia_records ADD COLUMN IF NOT EXISTS facility_id INTEGER;
ALTER TABLE consent_forms ADD COLUMN IF NOT EXISTS tenant_id INTEGER;
ALTER TABLE consent_forms ADD COLUMN IF NOT EXISTS facility_id INTEGER;
CREATE INDEX IF NOT EXISTS idx_consent_forms_tenant_facility ON consent_forms (tenant_id, facility_id);
ALTER TABLE emergency_visits ADD COLUMN IF NOT EXISTS tenant_id INTEGER;
ALTER TABLE emergency_visits ADD COLUMN IF NOT EXISTS facility_id INTEGER;
CREATE INDEX IF NOT EXISTS idx_er_visits_tenant_facility ON emergency_visits (tenant_id, facility_id);
-- E7 ED workflow / ESI columns (dev-only convenience; production receives these via migrations/e7_01_emergency_ed_workflow_up.sql).
ALTER TABLE emergency_visits ADD COLUMN IF NOT EXISTS esi_level INTEGER DEFAULT 0;
ALTER TABLE emergency_visits ADD COLUMN IF NOT EXISTS esi_rationale TEXT DEFAULT '';
ALTER TABLE emergency_visits ADD COLUMN IF NOT EXISTS er_phase TEXT DEFAULT 'Arrival';
ALTER TABLE emergency_visits ADD COLUMN IF NOT EXISTS triage_started_at TEXT DEFAULT '';
ALTER TABLE emergency_visits ADD COLUMN IF NOT EXISTS provider_assigned_at TEXT DEFAULT '';
ALTER TABLE emergency_visits ADD COLUMN IF NOT EXISTS time_to_provider_min INTEGER DEFAULT 0;
ALTER TABLE emergency_visits ADD COLUMN IF NOT EXISTS disposition_type TEXT DEFAULT '';
CREATE INDEX IF NOT EXISTS idx_er_visits_phase ON emergency_visits (tenant_id, status, esi_level);
ALTER TABLE emergency_trauma_assessments ADD COLUMN IF NOT EXISTS tenant_id INTEGER;
ALTER TABLE emergency_trauma_assessments ADD COLUMN IF NOT EXISTS facility_id INTEGER;
ALTER TABLE admissions ADD COLUMN IF NOT EXISTS tenant_id INTEGER;
ALTER TABLE admissions ADD COLUMN IF NOT EXISTS facility_id INTEGER;
CREATE INDEX IF NOT EXISTS idx_admissions_tenant_facility ON admissions (tenant_id, facility_id);
ALTER TABLE admission_daily_rounds ADD COLUMN IF NOT EXISTS tenant_id INTEGER;
ALTER TABLE admission_daily_rounds ADD COLUMN IF NOT EXISTS facility_id INTEGER;
ALTER TABLE icu_monitoring ADD COLUMN IF NOT EXISTS tenant_id INTEGER;
ALTER TABLE icu_monitoring ADD COLUMN IF NOT EXISTS facility_id INTEGER;
ALTER TABLE icu_ventilator ADD COLUMN IF NOT EXISTS tenant_id INTEGER;
ALTER TABLE icu_ventilator ADD COLUMN IF NOT EXISTS facility_id INTEGER;
ALTER TABLE icu_scores ADD COLUMN IF NOT EXISTS tenant_id INTEGER;
ALTER TABLE icu_scores ADD COLUMN IF NOT EXISTS facility_id INTEGER;
ALTER TABLE icu_fluid_balance ADD COLUMN IF NOT EXISTS tenant_id INTEGER;
ALTER TABLE icu_fluid_balance ADD COLUMN IF NOT EXISTS facility_id INTEGER;
ALTER TABLE emar_orders ADD COLUMN IF NOT EXISTS tenant_id INTEGER;
ALTER TABLE emar_orders ADD COLUMN IF NOT EXISTS facility_id INTEGER;
ALTER TABLE emar_administrations ADD COLUMN IF NOT EXISTS tenant_id INTEGER;
ALTER TABLE emar_administrations ADD COLUMN IF NOT EXISTS facility_id INTEGER;
ALTER TABLE nursing_care_plans ADD COLUMN IF NOT EXISTS tenant_id INTEGER;
ALTER TABLE nursing_care_plans ADD COLUMN IF NOT EXISTS facility_id INTEGER;
ALTER TABLE nursing_assessments ADD COLUMN IF NOT EXISTS tenant_id INTEGER;
ALTER TABLE nursing_assessments ADD COLUMN IF NOT EXISTS facility_id INTEGER;
CREATE INDEX IF NOT EXISTS idx_nursing_assessments_tenant_facility ON nursing_assessments (tenant_id, facility_id, patient_id);

ALTER TABLE telemedicine_sessions ADD COLUMN IF NOT EXISTS tenant_id INTEGER;
ALTER TABLE telemedicine_sessions ADD COLUMN IF NOT EXISTS facility_id INTEGER;
ALTER TABLE pathology_cases ADD COLUMN IF NOT EXISTS tenant_id INTEGER;
ALTER TABLE pathology_cases ADD COLUMN IF NOT EXISTS facility_id INTEGER;
ALTER TABLE social_work_cases ADD COLUMN IF NOT EXISTS tenant_id INTEGER;
ALTER TABLE social_work_cases ADD COLUMN IF NOT EXISTS facility_id INTEGER;
ALTER TABLE mortuary_cases ADD COLUMN IF NOT EXISTS tenant_id INTEGER;
ALTER TABLE mortuary_cases ADD COLUMN IF NOT EXISTS facility_id INTEGER;
ALTER TABLE cosmetic_cases ADD COLUMN IF NOT EXISTS tenant_id INTEGER;
ALTER TABLE cosmetic_cases ADD COLUMN IF NOT EXISTS facility_id INTEGER;
ALTER TABLE cosmetic_consents ADD COLUMN IF NOT EXISTS tenant_id INTEGER;
ALTER TABLE cosmetic_consents ADD COLUMN IF NOT EXISTS facility_id INTEGER;
ALTER TABLE cosmetic_photos ADD COLUMN IF NOT EXISTS tenant_id INTEGER;
ALTER TABLE cosmetic_photos ADD COLUMN IF NOT EXISTS facility_id INTEGER;
ALTER TABLE cosmetic_followups ADD COLUMN IF NOT EXISTS tenant_id INTEGER;
ALTER TABLE cosmetic_followups ADD COLUMN IF NOT EXISTS facility_id INTEGER;
ALTER TABLE insurance_claims ADD COLUMN IF NOT EXISTS tenant_id INTEGER;
ALTER TABLE insurance_claims ADD COLUMN IF NOT EXISTS facility_id INTEGER;
ALTER TABLE insurance_claims ADD COLUMN IF NOT EXISTS branch_id INTEGER;
CREATE INDEX IF NOT EXISTS idx_ins_claims_tenant_fac_branch ON insurance_claims (tenant_id, facility_id, branch_id);
ALTER TABLE finance_journal_entries ADD COLUMN IF NOT EXISTS tenant_id INTEGER;
ALTER TABLE finance_journal_entries ADD COLUMN IF NOT EXISTS facility_id INTEGER;
ALTER TABLE finance_journal_entries ADD COLUMN IF NOT EXISTS branch_id INTEGER;
CREATE INDEX IF NOT EXISTS idx_journal_entries_tenant_fac_branch ON finance_journal_entries (tenant_id, facility_id, branch_id);
ALTER TABLE finance_journal_lines ADD COLUMN IF NOT EXISTS tenant_id INTEGER;
ALTER TABLE finance_journal_lines ADD COLUMN IF NOT EXISTS facility_id INTEGER;
ALTER TABLE finance_journal_lines ADD COLUMN IF NOT EXISTS branch_id INTEGER;
ALTER TABLE finance_tax_declarations ADD COLUMN IF NOT EXISTS tenant_id INTEGER;
ALTER TABLE finance_tax_declarations ADD COLUMN IF NOT EXISTS facility_id INTEGER;
ALTER TABLE finance_tax_declarations ADD COLUMN IF NOT EXISTS branch_id INTEGER;
ALTER TABLE finance_doctor_commissions ADD COLUMN IF NOT EXISTS tenant_id INTEGER;
ALTER TABLE finance_doctor_commissions ADD COLUMN IF NOT EXISTS facility_id INTEGER;
ALTER TABLE finance_vouchers ADD COLUMN IF NOT EXISTS tenant_id INTEGER;
ALTER TABLE finance_vouchers ADD COLUMN IF NOT EXISTS facility_id INTEGER;
ALTER TABLE finance_vouchers ADD COLUMN IF NOT EXISTS branch_id INTEGER;
ALTER TABLE zatca_invoices ADD COLUMN IF NOT EXISTS tenant_id INTEGER;
ALTER TABLE zatca_invoices ADD COLUMN IF NOT EXISTS facility_id INTEGER;
ALTER TABLE zatca_invoices ADD COLUMN IF NOT EXISTS branch_id INTEGER;
CREATE INDEX IF NOT EXISTS idx_zatca_invoices_tenant_fac_branch ON zatca_invoices (tenant_id, facility_id, branch_id);
ALTER TABLE appointments ADD COLUMN IF NOT EXISTS tenant_id INTEGER;
ALTER TABLE appointments ADD COLUMN IF NOT EXISTS branch_id INTEGER;
CREATE INDEX IF NOT EXISTS idx_appts_tenant_branch ON appointments (tenant_id, branch_id, appt_date);
ALTER TABLE waiting_queue ADD COLUMN IF NOT EXISTS tenant_id INTEGER;
ALTER TABLE waiting_queue ADD COLUMN IF NOT EXISTS branch_id INTEGER;
CREATE INDEX IF NOT EXISTS idx_waiting_tenant_branch ON waiting_queue (tenant_id, branch_id);
ALTER TABLE online_bookings ADD COLUMN IF NOT EXISTS tenant_id INTEGER;
ALTER TABLE portal_appointments ADD COLUMN IF NOT EXISTS tenant_id INTEGER;
ALTER TABLE operating_rooms ADD COLUMN IF NOT EXISTS tenant_id INTEGER;
ALTER TABLE operating_rooms ADD COLUMN IF NOT EXISTS branch_id INTEGER;
ALTER TABLE emergency_beds ADD COLUMN IF NOT EXISTS tenant_id INTEGER;
ALTER TABLE emergency_beds ADD COLUMN IF NOT EXISTS branch_id INTEGER;
ALTER TABLE wards ADD COLUMN IF NOT EXISTS tenant_id INTEGER;
ALTER TABLE wards ADD COLUMN IF NOT EXISTS branch_id INTEGER;
ALTER TABLE beds ADD COLUMN IF NOT EXISTS tenant_id INTEGER;
ALTER TABLE beds ADD COLUMN IF NOT EXISTS branch_id INTEGER;
ALTER TABLE bed_transfers ADD COLUMN IF NOT EXISTS tenant_id INTEGER;
ALTER TABLE bed_transfers ADD COLUMN IF NOT EXISTS branch_id INTEGER;
ALTER TABLE maintenance_work_orders ADD COLUMN IF NOT EXISTS tenant_id INTEGER;
ALTER TABLE maintenance_work_orders ADD COLUMN IF NOT EXISTS branch_id INTEGER;
ALTER TABLE transport_requests ADD COLUMN IF NOT EXISTS tenant_id INTEGER;
ALTER TABLE transport_requests ADD COLUMN IF NOT EXISTS branch_id INTEGER;
ALTER TABLE hr_employees ADD COLUMN IF NOT EXISTS tenant_id INTEGER;
ALTER TABLE hr_employees ADD COLUMN IF NOT EXISTS facility_id INTEGER;
ALTER TABLE hr_employees ADD COLUMN IF NOT EXISTS branch_id INTEGER;
CREATE INDEX IF NOT EXISTS idx_hr_employees_tenant ON hr_employees (tenant_id);
ALTER TABLE hr_salaries ADD COLUMN IF NOT EXISTS tenant_id INTEGER;
ALTER TABLE hr_leaves ADD COLUMN IF NOT EXISTS tenant_id INTEGER;
ALTER TABLE hr_advances ADD COLUMN IF NOT EXISTS tenant_id INTEGER;
ALTER TABLE hr_employee_documents ADD COLUMN IF NOT EXISTS tenant_id INTEGER;
ALTER TABLE hr_attendance ADD COLUMN IF NOT EXISTS tenant_id INTEGER;
ALTER TABLE hr_attendance ADD COLUMN IF NOT EXISTS branch_id INTEGER;
ALTER TABLE hr_employee_custody ADD COLUMN IF NOT EXISTS tenant_id INTEGER;
ALTER TABLE inventory_items ADD COLUMN IF NOT EXISTS tenant_id INTEGER;
ALTER TABLE inventory_items ADD COLUMN IF NOT EXISTS branch_id INTEGER;
ALTER TABLE inventory_opening_balances ADD COLUMN IF NOT EXISTS tenant_id INTEGER;
ALTER TABLE inventory_opening_balances ADD COLUMN IF NOT EXISTS branch_id INTEGER;
ALTER TABLE inventory_purchases ADD COLUMN IF NOT EXISTS tenant_id INTEGER;
ALTER TABLE inventory_purchases ADD COLUMN IF NOT EXISTS branch_id INTEGER;
ALTER TABLE inventory_purchase_items ADD COLUMN IF NOT EXISTS tenant_id INTEGER;
ALTER TABLE inventory_purchase_items ADD COLUMN IF NOT EXISTS branch_id INTEGER;
ALTER TABLE inventory_issue_to_dept ADD COLUMN IF NOT EXISTS tenant_id INTEGER;
ALTER TABLE inventory_issue_to_dept ADD COLUMN IF NOT EXISTS branch_id INTEGER;
ALTER TABLE inventory_issue_items ADD COLUMN IF NOT EXISTS tenant_id INTEGER;
ALTER TABLE inventory_issue_items ADD COLUMN IF NOT EXISTS branch_id INTEGER;
ALTER TABLE inventory_dept_requests ADD COLUMN IF NOT EXISTS tenant_id INTEGER;
ALTER TABLE inventory_dept_requests ADD COLUMN IF NOT EXISTS branch_id INTEGER;
ALTER TABLE inventory_dept_request_items ADD COLUMN IF NOT EXISTS tenant_id INTEGER;
ALTER TABLE inventory_dept_request_items ADD COLUMN IF NOT EXISTS branch_id INTEGER;
ALTER TABLE inventory_stock_count ADD COLUMN IF NOT EXISTS tenant_id INTEGER;
ALTER TABLE inventory_stock_count ADD COLUMN IF NOT EXISTS branch_id INTEGER;
ALTER TABLE doctor_inventory_requests ADD COLUMN IF NOT EXISTS tenant_id INTEGER;
ALTER TABLE doctor_inventory_requests ADD COLUMN IF NOT EXISTS branch_id INTEGER;
ALTER TABLE doctor_inventory_request_items ADD COLUMN IF NOT EXISTS tenant_id INTEGER;
ALTER TABLE pharmacy_prescriptions_queue ADD COLUMN IF NOT EXISTS tenant_id INTEGER;
ALTER TABLE pharmacy_prescriptions_queue ADD COLUMN IF NOT EXISTS branch_id INTEGER;
CREATE INDEX IF NOT EXISTS idx_ph_rx_queue_tenant ON pharmacy_prescriptions_queue (tenant_id, branch_id);
ALTER TABLE pharmacy_drug_catalog ADD COLUMN IF NOT EXISTS tenant_id INTEGER;
ALTER TABLE pharmacy_drug_catalog ADD COLUMN IF NOT EXISTS branch_id INTEGER;
ALTER TABLE pharmacy_suppliers ADD COLUMN IF NOT EXISTS tenant_id INTEGER;
ALTER TABLE pharmacy_sales ADD COLUMN IF NOT EXISTS tenant_id INTEGER;
ALTER TABLE pharmacy_sales ADD COLUMN IF NOT EXISTS branch_id INTEGER;
ALTER TABLE pharmacy_sale_items ADD COLUMN IF NOT EXISTS tenant_id INTEGER;
ALTER TABLE pharmacy_purchase_orders ADD COLUMN IF NOT EXISTS tenant_id INTEGER;
ALTER TABLE pharmacy_purchase_orders ADD COLUMN IF NOT EXISTS branch_id INTEGER;
ALTER TABLE pharmacy_purchase_items ADD COLUMN IF NOT EXISTS tenant_id INTEGER;
ALTER TABLE pharmacy_opening_balances ADD COLUMN IF NOT EXISTS tenant_id INTEGER;
ALTER TABLE pharmacy_opening_balances ADD COLUMN IF NOT EXISTS branch_id INTEGER;
ALTER TABLE audit_trail ADD COLUMN IF NOT EXISTS tenant_id INTEGER;
CREATE INDEX IF NOT EXISTS idx_audit_trail_tenant ON audit_trail (tenant_id);
ALTER TABLE quality_incidents ADD COLUMN IF NOT EXISTS tenant_id INTEGER;
-- E17: incident-management columns on pre-existing quality_incidents (canonical schema in migrations/e17_001; ALTERs kept idempotent so app boots before migration runs)
-- I1 FIX: NOT NULL added to match migration canonical schema; ADD COLUMN IF NOT EXISTS is safe for existing rows (default fills them).
ALTER TABLE quality_incidents ADD COLUMN IF NOT EXISTS harm_level TEXT NOT NULL DEFAULT 'None';
ALTER TABLE quality_incidents ADD COLUMN IF NOT EXISTS near_miss INTEGER NOT NULL DEFAULT 0;
ALTER TABLE quality_incidents ADD COLUMN IF NOT EXISTS confidential INTEGER NOT NULL DEFAULT 0;
ALTER TABLE quality_incidents ADD COLUMN IF NOT EXISTS encounter_id INTEGER;
ALTER TABLE quality_incidents ADD COLUMN IF NOT EXISTS visit_id INTEGER;
ALTER TABLE quality_incidents ADD COLUMN IF NOT EXISTS workflow_state TEXT NOT NULL DEFAULT 'Open';
-- I1 FIX: backfill any pre-existing rows that already have the column but with NULL (handles case where column existed without NOT NULL).
UPDATE quality_incidents SET harm_level = 'None' WHERE harm_level IS NULL;
UPDATE quality_incidents SET near_miss = 0 WHERE near_miss IS NULL;
UPDATE quality_incidents SET confidential = 0 WHERE confidential IS NULL;
UPDATE quality_incidents SET workflow_state = 'Open' WHERE workflow_state IS NULL;
ALTER TABLE quality_patient_satisfaction ADD COLUMN IF NOT EXISTS tenant_id INTEGER;
ALTER TABLE quality_kpis ADD COLUMN IF NOT EXISTS tenant_id INTEGER;
ALTER TABLE infection_surveillance ADD COLUMN IF NOT EXISTS tenant_id INTEGER;
ALTER TABLE infection_outbreaks ADD COLUMN IF NOT EXISTS tenant_id INTEGER;
ALTER TABLE employee_exposures ADD COLUMN IF NOT EXISTS tenant_id INTEGER;
ALTER TABLE hand_hygiene_audits ADD COLUMN IF NOT EXISTS tenant_id INTEGER;
ALTER TABLE company_settings ADD COLUMN IF NOT EXISTS tenant_id INTEGER;
ALTER TABLE integration_settings ADD COLUMN IF NOT EXISTS tenant_id INTEGER;
ALTER TABLE queue_advertisements ADD COLUMN IF NOT EXISTS tenant_id INTEGER;
ALTER TABLE maintenance_pm_schedules ADD COLUMN IF NOT EXISTS tenant_id INTEGER;
ALTER TABLE maintenance_equipment ADD COLUMN IF NOT EXISTS tenant_id INTEGER;

-- Wisdom Dental & Periodontal Expansion
ALTER TABLE dental_records ADD COLUMN IF NOT EXISTS affected_surfaces TEXT DEFAULT '';

CREATE TABLE IF NOT EXISTS dental_periodontal_exams (
    id SERIAL PRIMARY KEY,
    patient_id INTEGER,
    tooth_number INTEGER,
    probing_depth INTEGER,
    bleeding_on_probing BOOLEAN DEFAULT FALSE,
    gingival_recession INTEGER DEFAULT 0,
    tenant_id INTEGER,
    facility_id INTEGER,
    exam_date TIMESTAMP DEFAULT CURRENT_TIMESTAMP
);
CREATE INDEX IF NOT EXISTS idx_dental_periodontal_tenant ON dental_periodontal_exams (tenant_id, facility_id, patient_id);

CREATE TABLE IF NOT EXISTS dental_images (
    id SERIAL PRIMARY KEY,
    patient_id INTEGER,
    tooth_number INTEGER,
    image_path TEXT,
    image_type TEXT DEFAULT 'X-Ray',
    tenant_id INTEGER,
    facility_id INTEGER,
    created_at TIMESTAMP DEFAULT CURRENT_TIMESTAMP
);
CREATE INDEX IF NOT EXISTS idx_dental_images_tenant ON dental_images (tenant_id, facility_id, patient_id);

-- Cardiology & Oncology Expansion
CREATE TABLE IF NOT EXISTS cardiology_cath_reports (
    id SERIAL PRIMARY KEY,
    patient_id INTEGER,
    blockage_lad INTEGER DEFAULT 0,
    blockage_lcx INTEGER DEFAULT 0,
    blockage_rca INTEGER DEFAULT 0,
    findings TEXT DEFAULT '',
    tenant_id INTEGER,
    facility_id INTEGER,
    created_at TIMESTAMP DEFAULT CURRENT_TIMESTAMP
);
CREATE INDEX IF NOT EXISTS idx_cardio_cath_tenant ON cardiology_cath_reports (tenant_id, facility_id, patient_id);

CREATE TABLE IF NOT EXISTS oncology_patient_regimens (
    id SERIAL PRIMARY KEY,
    patient_id INTEGER,
    regimen_name TEXT,
    cycle_number INTEGER,
    status TEXT DEFAULT 'Scheduled',
    start_date TEXT,
    tenant_id INTEGER,
    facility_id INTEGER,
    created_at TIMESTAMP DEFAULT CURRENT_TIMESTAMP
);
CREATE INDEX IF NOT EXISTS idx_onco_regimens_tenant ON oncology_patient_regimens (tenant_id, facility_id, patient_id);
            `);

            // Perform backfill
            await client.query(`
                UPDATE patients SET tenant_id = 1, facility_id = 1 WHERE tenant_id IS NULL;
                UPDATE invoices SET tenant_id = 1, facility_id = 1 WHERE tenant_id IS NULL;

                -- Additional backfill updates
UPDATE medical_records SET tenant_id = 1, facility_id = 1 WHERE tenant_id IS NULL;
UPDATE prescriptions SET tenant_id = 1, facility_id = 1 WHERE tenant_id IS NULL;
UPDATE dental_records SET tenant_id = 1, facility_id = 1 WHERE tenant_id IS NULL;
UPDATE lab_radiology_orders SET tenant_id = 1, facility_id = 1 WHERE tenant_id IS NULL;
UPDATE lab_results SET tenant_id = 1, facility_id = 1 WHERE tenant_id IS NULL;
UPDATE nursing_vitals SET tenant_id = 1, facility_id = 1 WHERE tenant_id IS NULL;
UPDATE medical_certificates SET tenant_id = 1, facility_id = 1 WHERE tenant_id IS NULL;
UPDATE patient_referrals SET tenant_id = 1, facility_id = 1 WHERE tenant_id IS NULL;
UPDATE surgeries SET tenant_id = 1, facility_id = 1 WHERE tenant_id IS NULL;
UPDATE surgery_preop_assessments SET tenant_id = 1, facility_id = 1 WHERE tenant_id IS NULL;
UPDATE surgery_preop_tests SET tenant_id = 1, facility_id = 1 WHERE tenant_id IS NULL;
UPDATE surgery_anesthesia_records SET tenant_id = 1, facility_id = 1 WHERE tenant_id IS NULL;
UPDATE consent_forms SET tenant_id = 1, facility_id = 1 WHERE tenant_id IS NULL;
UPDATE emergency_visits SET tenant_id = 1, facility_id = 1 WHERE tenant_id IS NULL;
UPDATE emergency_trauma_assessments SET tenant_id = 1, facility_id = 1 WHERE tenant_id IS NULL;
UPDATE admissions SET tenant_id = 1, facility_id = 1 WHERE tenant_id IS NULL;
UPDATE admission_daily_rounds SET tenant_id = 1, facility_id = 1 WHERE tenant_id IS NULL;
UPDATE icu_monitoring SET tenant_id = 1, facility_id = 1 WHERE tenant_id IS NULL;
UPDATE icu_ventilator SET tenant_id = 1, facility_id = 1 WHERE tenant_id IS NULL;
UPDATE icu_scores SET tenant_id = 1, facility_id = 1 WHERE tenant_id IS NULL;
UPDATE icu_fluid_balance SET tenant_id = 1, facility_id = 1 WHERE tenant_id IS NULL;
UPDATE emar_orders SET tenant_id = 1, facility_id = 1 WHERE tenant_id IS NULL;
UPDATE emar_administrations SET tenant_id = 1, facility_id = 1 WHERE tenant_id IS NULL;
UPDATE nursing_care_plans SET tenant_id = 1, facility_id = 1 WHERE tenant_id IS NULL;
UPDATE nursing_assessments SET tenant_id = 1, facility_id = 1 WHERE tenant_id IS NULL;
UPDATE telemedicine_sessions SET tenant_id = 1, facility_id = 1 WHERE tenant_id IS NULL;
UPDATE pathology_cases SET tenant_id = 1, facility_id = 1 WHERE tenant_id IS NULL;
UPDATE social_work_cases SET tenant_id = 1, facility_id = 1 WHERE tenant_id IS NULL;
UPDATE mortuary_cases SET tenant_id = 1, facility_id = 1 WHERE tenant_id IS NULL;
UPDATE cosmetic_cases SET tenant_id = 1, facility_id = 1 WHERE tenant_id IS NULL;
UPDATE cosmetic_consents SET tenant_id = 1, facility_id = 1 WHERE tenant_id IS NULL;
UPDATE cosmetic_photos SET tenant_id = 1, facility_id = 1 WHERE tenant_id IS NULL;
UPDATE cosmetic_followups SET tenant_id = 1, facility_id = 1 WHERE tenant_id IS NULL;
UPDATE insurance_claims SET tenant_id = 1, facility_id = 1, branch_id = 1 WHERE tenant_id IS NULL;
UPDATE finance_journal_entries SET tenant_id = 1, facility_id = 1, branch_id = 1 WHERE tenant_id IS NULL;
UPDATE finance_journal_lines SET tenant_id = 1, facility_id = 1, branch_id = 1 WHERE tenant_id IS NULL;
UPDATE finance_tax_declarations SET tenant_id = 1, facility_id = 1, branch_id = 1 WHERE tenant_id IS NULL;
UPDATE finance_doctor_commissions SET tenant_id = 1, facility_id = 1 WHERE tenant_id IS NULL;
UPDATE finance_vouchers SET tenant_id = 1, facility_id = 1, branch_id = 1 WHERE tenant_id IS NULL;
UPDATE zatca_invoices SET tenant_id = 1, facility_id = 1, branch_id = 1 WHERE tenant_id IS NULL;
UPDATE appointments SET tenant_id = 1, branch_id = 1 WHERE tenant_id IS NULL;
UPDATE waiting_queue SET tenant_id = 1, branch_id = 1 WHERE tenant_id IS NULL;
UPDATE online_bookings SET tenant_id = 1 WHERE tenant_id IS NULL;
UPDATE portal_appointments SET tenant_id = 1 WHERE tenant_id IS NULL;
UPDATE operating_rooms SET tenant_id = 1, branch_id = 1 WHERE tenant_id IS NULL;
UPDATE emergency_beds SET tenant_id = 1, branch_id = 1 WHERE tenant_id IS NULL;
UPDATE wards SET tenant_id = 1, branch_id = 1 WHERE tenant_id IS NULL;
UPDATE beds SET tenant_id = 1, branch_id = 1 WHERE tenant_id IS NULL;
UPDATE bed_transfers SET tenant_id = 1, branch_id = 1 WHERE tenant_id IS NULL;
UPDATE maintenance_work_orders SET tenant_id = 1, branch_id = 1 WHERE tenant_id IS NULL;
UPDATE transport_requests SET tenant_id = 1, branch_id = 1 WHERE tenant_id IS NULL;
UPDATE hr_employees SET tenant_id = 1, facility_id = 1, branch_id = 1 WHERE tenant_id IS NULL;
UPDATE hr_salaries SET tenant_id = 1 WHERE tenant_id IS NULL;
UPDATE hr_leaves SET tenant_id = 1 WHERE tenant_id IS NULL;
UPDATE hr_advances SET tenant_id = 1 WHERE tenant_id IS NULL;
UPDATE hr_employee_documents SET tenant_id = 1 WHERE tenant_id IS NULL;
UPDATE hr_attendance SET tenant_id = 1, branch_id = 1 WHERE tenant_id IS NULL;
UPDATE hr_employee_custody SET tenant_id = 1 WHERE tenant_id IS NULL;
UPDATE inventory_items SET tenant_id = 1, branch_id = 1 WHERE tenant_id IS NULL;
UPDATE inventory_opening_balances SET tenant_id = 1, branch_id = 1 WHERE tenant_id IS NULL;
UPDATE inventory_purchases SET tenant_id = 1, branch_id = 1 WHERE tenant_id IS NULL;
UPDATE inventory_purchase_items SET tenant_id = 1, branch_id = 1 WHERE tenant_id IS NULL;
UPDATE inventory_issue_to_dept SET tenant_id = 1, branch_id = 1 WHERE tenant_id IS NULL;
UPDATE inventory_issue_items SET tenant_id = 1, branch_id = 1 WHERE tenant_id IS NULL;
UPDATE inventory_dept_requests SET tenant_id = 1, branch_id = 1 WHERE tenant_id IS NULL;
UPDATE inventory_dept_request_items SET tenant_id = 1, branch_id = 1 WHERE tenant_id IS NULL;
UPDATE inventory_stock_count SET tenant_id = 1, branch_id = 1 WHERE tenant_id IS NULL;
UPDATE doctor_inventory_requests SET tenant_id = 1, branch_id = 1 WHERE tenant_id IS NULL;
UPDATE doctor_inventory_request_items SET tenant_id = 1 WHERE tenant_id IS NULL;
UPDATE pharmacy_prescriptions_queue SET tenant_id = 1, branch_id = 1 WHERE tenant_id IS NULL;
UPDATE pharmacy_drug_catalog SET tenant_id = 1, branch_id = 1 WHERE tenant_id IS NULL;
UPDATE pharmacy_suppliers SET tenant_id = 1 WHERE tenant_id IS NULL;
UPDATE pharmacy_sales SET tenant_id = 1, branch_id = 1 WHERE tenant_id IS NULL;
UPDATE pharmacy_sale_items SET tenant_id = 1 WHERE tenant_id IS NULL;
UPDATE pharmacy_purchase_orders SET tenant_id = 1, branch_id = 1 WHERE tenant_id IS NULL;
UPDATE pharmacy_purchase_items SET tenant_id = 1 WHERE tenant_id IS NULL;
UPDATE pharmacy_opening_balances SET tenant_id = 1, branch_id = 1 WHERE tenant_id IS NULL;
UPDATE audit_trail SET tenant_id = 1 WHERE tenant_id IS NULL;
UPDATE quality_incidents SET tenant_id = 1 WHERE tenant_id IS NULL;
UPDATE quality_incidents SET workflow_state = CASE WHEN status = 'Closed' THEN 'Closed' ELSE 'Open' END WHERE workflow_state IS NULL;
UPDATE quality_patient_satisfaction SET tenant_id = 1 WHERE tenant_id IS NULL;
UPDATE quality_kpis SET tenant_id = 1 WHERE tenant_id IS NULL;
UPDATE infection_surveillance SET tenant_id = 1 WHERE tenant_id IS NULL;
UPDATE infection_outbreaks SET tenant_id = 1 WHERE tenant_id IS NULL;
UPDATE employee_exposures SET tenant_id = 1 WHERE tenant_id IS NULL;
UPDATE hand_hygiene_audits SET tenant_id = 1 WHERE tenant_id IS NULL;
UPDATE company_settings SET tenant_id = 1 WHERE tenant_id IS NULL;
UPDATE integration_settings SET tenant_id = 1 WHERE tenant_id IS NULL;
UPDATE queue_advertisements SET tenant_id = 1 WHERE tenant_id IS NULL;
UPDATE maintenance_pm_schedules SET tenant_id = 1 WHERE tenant_id IS NULL;
UPDATE maintenance_equipment SET tenant_id = 1 WHERE tenant_id IS NULL;
            `);
        } catch (e) { console.error('Migration error:', e.message); }

        // ===== PHASE A — NEW TABLES (A1-A4) =====
        try {
            await client.query(`
                -- A1: Patient Portal Messages
                CREATE TABLE IF NOT EXISTS portal_messages (
                    id SERIAL PRIMARY KEY,
                    patient_id INTEGER REFERENCES patients(id),
                    sender_type VARCHAR(20) DEFAULT 'patient' CHECK (sender_type IN ('patient','staff')),
                    sender_name TEXT NOT NULL DEFAULT '',
                    subject TEXT NOT NULL DEFAULT '',
                    body TEXT NOT NULL DEFAULT '',
                    department VARCHAR(100) DEFAULT 'General',
                    is_read BOOLEAN DEFAULT FALSE,
                    replied_at TIMESTAMPTZ,
                    replied_by TEXT,
                    reply_body TEXT,
                    tenant_id INTEGER NOT NULL DEFAULT 1,
                    facility_id INTEGER,
                    created_at TIMESTAMPTZ DEFAULT NOW()
                );
                CREATE INDEX IF NOT EXISTS idx_portal_messages_patient ON portal_messages(patient_id, tenant_id);
                CREATE INDEX IF NOT EXISTS idx_portal_messages_tenant ON portal_messages(tenant_id, is_read);

                -- A2: Pediatric Immunizations (Saudi MOH National Immunization Program)
                CREATE TABLE IF NOT EXISTS pediatric_immunizations (
                    id SERIAL PRIMARY KEY,
                    patient_id INTEGER NOT NULL REFERENCES patients(id),
                    vaccine_name VARCHAR(200) NOT NULL,
                    dose_number INTEGER DEFAULT 1,
                    given_date DATE NOT NULL,
                    batch_number VARCHAR(100) DEFAULT '',
                    site VARCHAR(50) DEFAULT '',      -- Left arm / Right thigh / etc.
                    route VARCHAR(30) DEFAULT 'IM',   -- IM / SC / ID / PO
                    next_due DATE,
                    reaction TEXT DEFAULT '',          -- أي ردة فعل
                    given_by TEXT NOT NULL DEFAULT '',
                    notes TEXT DEFAULT '',
                    tenant_id INTEGER NOT NULL DEFAULT 1,
                    facility_id INTEGER,
                    created_at TIMESTAMPTZ DEFAULT NOW()
                );
                CREATE INDEX IF NOT EXISTS idx_pediatric_immunizations_patient ON pediatric_immunizations(patient_id, tenant_id);
                CREATE INDEX IF NOT EXISTS idx_pediatric_immunizations_vaccine ON pediatric_immunizations(vaccine_name, tenant_id);

                -- A3: Nursing Pain Assessments (NRS/VAS/FLACC/FACES)
                CREATE TABLE IF NOT EXISTS nursing_pain_assessments (
                    id SERIAL PRIMARY KEY,
                    patient_id INTEGER NOT NULL REFERENCES patients(id),
                    patient_name TEXT DEFAULT '',
                    admission_id INTEGER REFERENCES admissions(id),
                    pain_scale VARCHAR(20) DEFAULT 'NRS' CHECK (pain_scale IN ('NRS','VAS','FLACC','FACES','BPS')),
                    pain_score INTEGER NOT NULL CHECK (pain_score BETWEEN 0 AND 10),
                    pain_location TEXT DEFAULT '',        -- موقع الألم
                    pain_character TEXT DEFAULT '',       -- طبيعة الألم
                    pain_radiation TEXT DEFAULT '',       -- انتشار الألم
                    pain_onset TEXT DEFAULT '',           -- متى بدأ
                    pain_duration TEXT DEFAULT '',        -- المدة
                    aggravating_factors TEXT DEFAULT '',  -- عوامل مُفاقِمة
                    relieving_factors TEXT DEFAULT '',    -- عوامل مُخففة
                    current_analgesia TEXT DEFAULT '',    -- مسكنات حالية
                    pain_goal INTEGER DEFAULT 3,          -- هدف النقرس (0-10)
                    reassessment_time TIMESTAMPTZ,        -- وقت إعادة التقييم
                    notes TEXT DEFAULT '',
                    assessed_by TEXT NOT NULL DEFAULT '',
                    assessed_at TIMESTAMPTZ DEFAULT NOW(),
                    tenant_id INTEGER NOT NULL DEFAULT 1,
                    facility_id INTEGER,
                    created_at TIMESTAMPTZ DEFAULT NOW()
                );
                CREATE INDEX IF NOT EXISTS idx_nursing_pain_patient ON nursing_pain_assessments(patient_id, tenant_id);
                CREATE INDEX IF NOT EXISTS idx_nursing_pain_admission ON nursing_pain_assessments(admission_id, tenant_id);
                CREATE INDEX IF NOT EXISTS idx_nursing_pain_score ON nursing_pain_assessments(pain_score, tenant_id);

                -- A4: ICU Daily Goals Checklist (CBAHI Requirement — Intensivist Bundle)
                CREATE TABLE IF NOT EXISTS icu_daily_goals (
                    id SERIAL PRIMARY KEY,
                    admission_id INTEGER NOT NULL REFERENCES admissions(id),
                    patient_id INTEGER NOT NULL REFERENCES patients(id),
                    patient_name TEXT DEFAULT '',
                    goal_date DATE NOT NULL DEFAULT CURRENT_DATE,
                    -- Ventilator
                    vent_goal_fio2 NUMERIC(5,2),          -- Target FiO2 %
                    vent_goal_peep NUMERIC(5,1),           -- Target PEEP cmH2O
                    vent_goal_tv NUMERIC(6,1),             -- Target Tidal Volume mL
                    vent_wean_plan TEXT DEFAULT '',         -- خطة الفطام
                    -- Sedation / Analgesia / Delirium (ABCDEF Bundle)
                    sedation_target_rass SMALLINT,         -- Target RASS (-5 to +4)
                    daily_sat BOOLEAN DEFAULT FALSE,        -- Daily Sedation Awakening Trial
                    daily_sbt BOOLEAN DEFAULT FALSE,        -- Daily Spontaneous Breathing Trial
                    pain_goal_nrs SMALLINT DEFAULT 3,
                    delirium_cam_icu TEXT DEFAULT '',       -- CAM-ICU result (Positive/Negative/Unable)
                    -- DVT / Stress Ulcer Prevention
                    dvt_prophylaxis TEXT DEFAULT '',        -- Heparin SQ / Mechanical / Contraindicated
                    stress_ulcer_prophy TEXT DEFAULT '',    -- PPI / H2 / Not Indicated
                    -- Nutrition
                    nutrition_route TEXT DEFAULT '',        -- PO / NG / NJ / TPN / NPO
                    caloric_goal_kcal NUMERIC(8,1),
                    protein_goal_g NUMERIC(6,1),
                    -- Infection / Lines / VAP Prevention
                    line_necessity_reviewed BOOLEAN DEFAULT FALSE,
                    foley_necessity_reviewed BOOLEAN DEFAULT FALSE,
                    oral_care_done BOOLEAN DEFAULT FALSE,   -- VAP Prevention
                    hob_elevation BOOLEAN DEFAULT TRUE,     -- Head Of Bed 30-45°
                    -- Early Mobility
                    mobility_goal TEXT DEFAULT '',          -- Passive / Sitting / Standing / Ambulate
                    -- Family Engagement
                    family_update_done BOOLEAN DEFAULT FALSE,
                    -- Free-text goals
                    medical_goals TEXT DEFAULT '',
                    nursing_goals TEXT DEFAULT '',
                    goals_discussed_with_team BOOLEAN DEFAULT FALSE,
                    notes TEXT DEFAULT '',
                    -- Audit
                    created_by TEXT DEFAULT '',
                    updated_by TEXT,
                    updated_at TIMESTAMPTZ,
                    tenant_id INTEGER NOT NULL DEFAULT 1,
                    facility_id INTEGER,
                    created_at TIMESTAMPTZ DEFAULT NOW(),
                    UNIQUE(admission_id, goal_date, tenant_id)
                );
                CREATE INDEX IF NOT EXISTS idx_icu_daily_goals_admission ON icu_daily_goals(admission_id, tenant_id);
                CREATE INDEX IF NOT EXISTS idx_icu_daily_goals_date ON icu_daily_goals(goal_date, tenant_id);
            `);
            console.log('  ✅ Phase A tables created (portal_messages, pediatric_immunizations, nursing_pain_assessments, icu_daily_goals)');
        } catch (e) { console.error('Phase A tables migration error:', e.message); }

        // ===== PHASE B — SAUDI COMPLIANCE TABLES (B1-B3) =====
        try {
            await client.query(`
                -- B1: NPHIES Remittance Advice (RA) from payer → provider
                CREATE TABLE IF NOT EXISTS nphies_remittance_advice (
                    id SERIAL PRIMARY KEY,
                    claim_id INTEGER REFERENCES insurance_claims(id),
                    payer_id INTEGER REFERENCES insurance_companies(id),
                    remittance_date DATE NOT NULL DEFAULT CURRENT_DATE,
                    fhir_bundle_id TEXT DEFAULT '',           -- NPHIES Bundle.id
                    payment_amount NUMERIC(12,2) DEFAULT 0,
                    adjustment_amount NUMERIC(12,2) DEFAULT 0,
                    denial_amount NUMERIC(12,2) DEFAULT 0,
                    payment_date DATE,
                    payment_reference TEXT DEFAULT '',
                    adjudication_status VARCHAR(30) DEFAULT 'pending'
                        CHECK (adjudication_status IN ('pending','approved','partial','denied','appealed')),
                    denial_reason TEXT DEFAULT '',
                    nphies_request_json JSONB,
                    nphies_response_json JSONB,
                    posted_to_gl BOOLEAN DEFAULT FALSE,   -- once posted to AR, lock
                    posted_at TIMESTAMPTZ,
                    posted_by TEXT,
                    tenant_id INTEGER NOT NULL DEFAULT 1,
                    facility_id INTEGER,
                    created_at TIMESTAMPTZ DEFAULT NOW()
                );
                CREATE INDEX IF NOT EXISTS idx_nphies_ra_claim ON nphies_remittance_advice(claim_id, tenant_id);
                CREATE INDEX IF NOT EXISTS idx_nphies_ra_payer ON nphies_remittance_advice(payer_id, tenant_id);
                CREATE INDEX IF NOT EXISTS idx_nphies_ra_status ON nphies_remittance_advice(adjudication_status, tenant_id);

                -- B1b: NPHIES Claim Status Inquiry log
                CREATE TABLE IF NOT EXISTS nphies_claim_status_inquiry (
                    id SERIAL PRIMARY KEY,
                    claim_id INTEGER REFERENCES insurance_claims(id),
                    inquiry_date TIMESTAMPTZ DEFAULT NOW(),
                    fhir_task_id TEXT DEFAULT '',
                    status_code VARCHAR(50) DEFAULT '',
                    status_description TEXT DEFAULT '',
                    nphies_request_json JSONB,
                    nphies_response_json JSONB,
                    tenant_id INTEGER NOT NULL DEFAULT 1,
                    created_at TIMESTAMPTZ DEFAULT NOW()
                );
                CREATE INDEX IF NOT EXISTS idx_nphies_csi_claim ON nphies_claim_status_inquiry(claim_id, tenant_id);

                -- B2: ZATCA Credit Notes (إشعارات الخصم/الائتمان)
                CREATE TABLE IF NOT EXISTS zatca_credit_notes (
                    id SERIAL PRIMARY KEY,
                    original_invoice_id INTEGER REFERENCES zatca_invoices(id),
                    credit_note_number TEXT NOT NULL DEFAULT '',
                    buyer_name TEXT DEFAULT '',
                    buyer_vat TEXT DEFAULT '',
                    credit_reason TEXT DEFAULT '',         -- Cancellation / Return / Discount
                    credit_reason_code VARCHAR(10) DEFAULT '', -- ZATCA reason codes
                    subtotal NUMERIC(12,2) DEFAULT 0,
                    vat_amount NUMERIC(12,2) DEFAULT 0,
                    total_with_vat NUMERIC(12,2) DEFAULT 0,
                    ubl_xml TEXT DEFAULT '',
                    xml_hash TEXT DEFAULT '',
                    digital_stamp TEXT DEFAULT '',
                    qr_code TEXT DEFAULT '',
                    clearance_status VARCHAR(30) DEFAULT 'pending',
                    submission_status VARCHAR(30) DEFAULT 'pending',
                    zatca_response JSONB,
                    invoice_counter INTEGER DEFAULT 1,     -- ICV — sequential counter
                    prev_invoice_hash TEXT DEFAULT '',     -- chaining
                    tenant_id INTEGER NOT NULL DEFAULT 1,
                    facility_id INTEGER,
                    created_at TIMESTAMPTZ DEFAULT NOW()
                );
                CREATE INDEX IF NOT EXISTS idx_zatca_cn_invoice ON zatca_credit_notes(original_invoice_id, tenant_id);
                CREATE INDEX IF NOT EXISTS idx_zatca_cn_tenant ON zatca_credit_notes(tenant_id, clearance_status);

                -- B3a: HR Credentialing & Privileging (Physician / Nurse licenses & privileges)
                CREATE TABLE IF NOT EXISTS hr_credentialing (
                    id SERIAL PRIMARY KEY,
                    employee_id INTEGER NOT NULL REFERENCES hr_employees(id),
                    employee_name TEXT DEFAULT '',
                    credential_type VARCHAR(50) NOT NULL  -- Medical License / DEA / Board Cert / Saudi Commission
                        DEFAULT 'Medical License',
                    credential_number TEXT NOT NULL DEFAULT '',
                    issuing_body TEXT DEFAULT '',           -- Saudi Commission, MOH, SCHS...
                    issue_date DATE,
                    expiry_date DATE,
                    is_active BOOLEAN DEFAULT TRUE,
                    privilege_area TEXT DEFAULT '',         -- General Surgery / Cardiology...
                    privilege_level VARCHAR(30) DEFAULT 'Full'
                        CHECK (privilege_level IN ('Full','Supervised','Limited','Provisional')),
                    verification_status VARCHAR(20) DEFAULT 'pending'
                        CHECK (verification_status IN ('pending','verified','expired','revoked')),
                    verified_by TEXT,
                    verified_at TIMESTAMPTZ,
                    alert_sent_30d BOOLEAN DEFAULT FALSE,  -- expiry alert 30 days
                    alert_sent_7d BOOLEAN DEFAULT FALSE,   -- expiry alert 7 days
                    document_url TEXT DEFAULT '',
                    notes TEXT DEFAULT '',
                    tenant_id INTEGER NOT NULL DEFAULT 1,
                    facility_id INTEGER,
                    created_at TIMESTAMPTZ DEFAULT NOW()
                );
                CREATE INDEX IF NOT EXISTS idx_hr_cred_employee ON hr_credentialing(employee_id, tenant_id);
                CREATE INDEX IF NOT EXISTS idx_hr_cred_expiry ON hr_credentialing(expiry_date, tenant_id);
                CREATE INDEX IF NOT EXISTS idx_hr_cred_type ON hr_credentialing(credential_type, tenant_id);

                -- B3b: GOSI Records (General Organization for Social Insurance)
                CREATE TABLE IF NOT EXISTS hr_gosi_records (
                    id SERIAL PRIMARY KEY,
                    employee_id INTEGER NOT NULL REFERENCES hr_employees(id),
                    employee_name TEXT DEFAULT '',
                    national_id TEXT DEFAULT '',
                    iqama_number TEXT DEFAULT '',
                    gosi_number TEXT DEFAULT '',           -- رقم التأمينات
                    nationality VARCHAR(50) DEFAULT '',
                    is_saudi BOOLEAN DEFAULT FALSE,
                    basic_salary NUMERIC(12,2) DEFAULT 0,
                    gosi_base_salary NUMERIC(12,2) DEFAULT 0,
                    employee_share_pct NUMERIC(5,2) DEFAULT 9.75,  -- % موظف
                    employer_share_pct NUMERIC(5,2) DEFAULT 12.00, -- % صاحب عمل (سعودي) أو 2% (غير سعودي - hazard only)
                    employee_contribution NUMERIC(12,2) DEFAULT 0,
                    employer_contribution NUMERIC(12,2) DEFAULT 0,
                    total_contribution NUMERIC(12,2) DEFAULT 0,
                    month_year DATE NOT NULL,              -- الشهر والسنة
                    submission_status VARCHAR(20) DEFAULT 'pending'
                        CHECK (submission_status IN ('pending','submitted','confirmed','error')),
                    gosi_response JSONB,
                    submitted_at TIMESTAMPTZ,
                    tenant_id INTEGER NOT NULL DEFAULT 1,
                    facility_id INTEGER,
                    created_at TIMESTAMPTZ DEFAULT NOW(),
                    UNIQUE(employee_id, month_year, tenant_id)
                );
                CREATE INDEX IF NOT EXISTS idx_gosi_employee ON hr_gosi_records(employee_id, tenant_id);
                CREATE INDEX IF NOT EXISTS idx_gosi_month ON hr_gosi_records(month_year, tenant_id);

                -- B3c: WPS Payroll File (Wage Protection System — نظام حماية الأجور)
                CREATE TABLE IF NOT EXISTS hr_wps_files (
                    id SERIAL PRIMARY KEY,
                    file_reference TEXT NOT NULL DEFAULT '', -- WPS file reference number
                    payroll_month DATE NOT NULL,             -- الشهر
                    total_employees INTEGER DEFAULT 0,
                    total_wages NUMERIC(14,2) DEFAULT 0,
                    file_format VARCHAR(20) DEFAULT 'SIF',   -- SIF (Salary Information File)
                    sif_content TEXT DEFAULT '',             -- محتوى ملف SIF
                    bank_code TEXT DEFAULT '',               -- رمز البنك
                    entity_id TEXT DEFAULT '',               -- Entity ID (MOL)
                    mol_reference TEXT DEFAULT '',           -- Ministry of Labour ref
                    submission_status VARCHAR(20) DEFAULT 'pending'
                        CHECK (submission_status IN ('pending','submitted','approved','rejected')),
                    submitted_at TIMESTAMPTZ,
                    approved_at TIMESTAMPTZ,
                    wps_response JSONB,
                    notes TEXT DEFAULT '',
                    created_by TEXT DEFAULT '',
                    tenant_id INTEGER NOT NULL DEFAULT 1,
                    facility_id INTEGER,
                    created_at TIMESTAMPTZ DEFAULT NOW(),
                    UNIQUE(payroll_month, tenant_id)
                );
                CREATE INDEX IF NOT EXISTS idx_wps_month ON hr_wps_files(payroll_month, tenant_id);
                CREATE INDEX IF NOT EXISTS idx_wps_status ON hr_wps_files(submission_status, tenant_id);

                -- B3d: Nitaqat / Saudization Tracking
                CREATE TABLE IF NOT EXISTS hr_nitaqat_records (
                    id SERIAL PRIMARY KEY,
                    snapshot_date DATE NOT NULL DEFAULT CURRENT_DATE,
                    total_employees INTEGER DEFAULT 0,
                    saudi_employees INTEGER DEFAULT 0,
                    non_saudi_employees INTEGER DEFAULT 0,
                    saudization_pct NUMERIC(5,2) DEFAULT 0,
                    required_pct NUMERIC(5,2) DEFAULT 0,    -- الحد المطلوب حسب القطاع
                    nitaqat_band VARCHAR(30) DEFAULT '',     -- Excellent/High/Medium/Low/Déficiente
                    activity_code TEXT DEFAULT '',           -- GOSI activity code
                    facility_size VARCHAR(20) DEFAULT '',    -- Small/Medium/Large/Giant
                    exempted_employees INTEGER DEFAULT 0,    -- معفيون (مدير، طبيب أجنبي...)
                    details_json JSONB,
                    tenant_id INTEGER NOT NULL DEFAULT 1,
                    facility_id INTEGER,
                    created_at TIMESTAMPTZ DEFAULT NOW()
                );
                CREATE INDEX IF NOT EXISTS idx_nitaqat_date ON hr_nitaqat_records(snapshot_date, tenant_id);
                CREATE INDEX IF NOT EXISTS idx_nitaqat_tenant ON hr_nitaqat_records(tenant_id, nitaqat_band);
            `);
            console.log('  ✅ Phase B tables created (nphies_remittance_advice, nphies_claim_status_inquiry, zatca_credit_notes, hr_credentialing, hr_gosi_records, hr_wps_files, hr_nitaqat_records)');
        } catch (e) { console.error('Phase B tables migration error:', e.message); }

        // ===== PHASE C — CLINICAL QUALITY (C1-C4) =====
        try {
            await client.query(`
                -- C1: Controlled Substances (مراقبة المخدرات والمؤثرات العقلية)
                CREATE TABLE IF NOT EXISTS pharmacy_controlled_substances (
                    id SERIAL PRIMARY KEY,
                    drug_name TEXT NOT NULL,
                    drug_code TEXT DEFAULT '',              -- local formulary code
                    schedule_class VARCHAR(10) DEFAULT '2' -- Saudi Schedule II/III/IV/V (مادة خاضعة)
                        CHECK (schedule_class IN ('2','3','4','5','H','N')),
                    dosage_form VARCHAR(50) DEFAULT '',
                    strength TEXT DEFAULT '',
                    unit VARCHAR(20) DEFAULT 'Tablet',
                    opening_balance NUMERIC(10,3) DEFAULT 0,
                    received_qty NUMERIC(10,3) DEFAULT 0,
                    dispensed_qty NUMERIC(10,3) DEFAULT 0,
                    wasted_qty NUMERIC(10,3) DEFAULT 0,
                    closing_balance NUMERIC(10,3) DEFAULT 0,
                    discrepancy NUMERIC(10,3) DEFAULT 0,
                    record_date DATE NOT NULL DEFAULT CURRENT_DATE,
                    location VARCHAR(100) DEFAULT '',      -- Ward/Pharmacy/ICU
                    witnessed_by TEXT DEFAULT '',          -- الشاهد الثاني (double-witness)
                    verified_by TEXT DEFAULT '',
                    notes TEXT DEFAULT '',
                    tenant_id INTEGER NOT NULL DEFAULT 1,
                    facility_id INTEGER,
                    created_at TIMESTAMPTZ DEFAULT NOW(),
                    UNIQUE(drug_code, record_date, location, tenant_id)
                );
                CREATE INDEX IF NOT EXISTS idx_cs_drug ON pharmacy_controlled_substances(drug_name, tenant_id);
                CREATE INDEX IF NOT EXISTS idx_cs_date ON pharmacy_controlled_substances(record_date, tenant_id);

                -- C1b: Controlled Substance Transactions (individual dispensing events)
                CREATE TABLE IF NOT EXISTS pharmacy_cs_transactions (
                    id SERIAL PRIMARY KEY,
                    cs_id INTEGER REFERENCES pharmacy_controlled_substances(id),
                    prescription_id INTEGER REFERENCES pharmacy_prescriptions(id),
                    patient_id INTEGER REFERENCES patients(id),
                    patient_name TEXT DEFAULT '',
                    admission_id INTEGER,
                    transaction_type VARCHAR(20) DEFAULT 'Dispense'
                        CHECK (transaction_type IN ('Receive','Dispense','Waste','Return','Transfer','Count')),
                    quantity NUMERIC(8,3) NOT NULL DEFAULT 0,
                    balance_after NUMERIC(10,3) DEFAULT 0,
                    witness1_name TEXT DEFAULT '',          -- الشاهد الأول (pharmacist)
                    witness2_name TEXT DEFAULT '',          -- الشاهد الثاني (nurse/second pharmacist)
                    witness1_id INTEGER,
                    witness2_id INTEGER,
                    administered_by TEXT DEFAULT '',
                    administered_at TIMESTAMPTZ,
                    reason TEXT DEFAULT '',
                    waste_amount NUMERIC(8,3) DEFAULT 0,
                    waste_reason TEXT DEFAULT '',
                    is_signed BOOLEAN DEFAULT FALSE,       -- double-signed
                    tenant_id INTEGER NOT NULL DEFAULT 1,
                    facility_id INTEGER,
                    created_at TIMESTAMPTZ DEFAULT NOW()
                );
                CREATE INDEX IF NOT EXISTS idx_cst_cs ON pharmacy_cs_transactions(cs_id, tenant_id);
                CREATE INDEX IF NOT EXISTS idx_cst_patient ON pharmacy_cs_transactions(patient_id, tenant_id);
                CREATE INDEX IF NOT EXISTS idx_cst_date ON pharmacy_cs_transactions(created_at, tenant_id);

                -- C2: Medication Reconciliation (مطابقة الأدوية)
                CREATE TABLE IF NOT EXISTS medication_reconciliations (
                    id SERIAL PRIMARY KEY,
                    patient_id INTEGER NOT NULL REFERENCES patients(id),
                    admission_id INTEGER,
                    reconciliation_type VARCHAR(20) NOT NULL DEFAULT 'Admission'
                        CHECK (reconciliation_type IN ('Admission','Discharge','Transfer')),
                    performed_by INTEGER,                  -- pharmacist/physician user_id
                    performed_by_name TEXT DEFAULT '',
                    performed_at TIMESTAMPTZ DEFAULT NOW(),
                    status VARCHAR(20) DEFAULT 'Draft'
                        CHECK (status IN ('Draft','Completed','Reviewed','Approved')),
                    reviewed_by TEXT DEFAULT '',
                    reviewed_at TIMESTAMPTZ,
                    home_medications JSONB,                -- [{name, dose, route, frequency, last_taken}]
                    hospital_medications JSONB,            -- [{name, dose, route, frequency, status: Continue/Hold/Modify/Discontinue}]
                    discrepancies JSONB,                   -- [{drug, issue, action, resolved}]
                    allergy_verified BOOLEAN DEFAULT FALSE,
                    high_alert_checked BOOLEAN DEFAULT FALSE,
                    patient_counselled BOOLEAN DEFAULT FALSE,
                    notes TEXT DEFAULT '',
                    tenant_id INTEGER NOT NULL DEFAULT 1,
                    facility_id INTEGER,
                    created_at TIMESTAMPTZ DEFAULT NOW()
                );
                CREATE INDEX IF NOT EXISTS idx_medrec_patient ON medication_reconciliations(patient_id, tenant_id);
                CREATE INDEX IF NOT EXISTS idx_medrec_type ON medication_reconciliations(reconciliation_type, tenant_id);
                CREATE INDEX IF NOT EXISTS idx_medrec_status ON medication_reconciliations(status, tenant_id);

                -- C3a: Lab Microbiology (زراعة ومضادات حيوية)
                CREATE TABLE IF NOT EXISTS lab_microbiology (
                    id SERIAL PRIMARY KEY,
                    order_id INTEGER REFERENCES lab_radiology_orders(id),
                    patient_id INTEGER NOT NULL REFERENCES patients(id),
                    admission_id INTEGER,
                    specimen_type VARCHAR(50) DEFAULT '', -- Blood/Urine/Sputum/Wound/CSF/Stool
                    collection_date DATE,
                    collection_time TIME,
                    collection_site TEXT DEFAULT '',
                    gram_stain TEXT DEFAULT '',            -- Gram-positive cocci / Gram-negative rods
                    preliminary_result TEXT DEFAULT '',
                    final_result TEXT DEFAULT '',
                    organism_identified TEXT DEFAULT '',   -- E. coli / Klebsiella / Staph aureus
                    colony_count TEXT DEFAULT '',          -- >100,000 CFU/mL
                    sensitivity_results JSONB,             -- [{antibiotic, mic, interpretation: S/I/R}]
                    antibiogram_profile TEXT DEFAULT '',   -- MRSA/ESBL/VRE/CRE flag
                    report_status VARCHAR(20) DEFAULT 'Pending'
                        CHECK (report_status IN ('Pending','Preliminary','Final','Verified')),
                    reported_by TEXT DEFAULT '',
                    reported_at TIMESTAMPTZ,
                    verified_by TEXT DEFAULT '',
                    verified_at TIMESTAMPTZ,
                    critical_value BOOLEAN DEFAULT FALSE,
                    critical_notified_to TEXT DEFAULT '',
                    critical_notified_at TIMESTAMPTZ,
                    loinc_code VARCHAR(20) DEFAULT '',     -- LOINC for culture type
                    tenant_id INTEGER NOT NULL DEFAULT 1,
                    facility_id INTEGER,
                    created_at TIMESTAMPTZ DEFAULT NOW()
                );
                CREATE INDEX IF NOT EXISTS idx_micro_patient ON lab_microbiology(patient_id, tenant_id);
                CREATE INDEX IF NOT EXISTS idx_micro_order ON lab_microbiology(order_id, tenant_id);
                CREATE INDEX IF NOT EXISTS idx_micro_organism ON lab_microbiology(organism_identified, tenant_id);

                -- C3b: LOINC Code Reference table
                CREATE TABLE IF NOT EXISTS lab_loinc_codes (
                    id SERIAL PRIMARY KEY,
                    loinc_code VARCHAR(20) UNIQUE NOT NULL,
                    short_name TEXT DEFAULT '',
                    long_name TEXT DEFAULT '',
                    component TEXT DEFAULT '',             -- Analyte
                    property TEXT DEFAULT '',              -- MCnc/SCnc/Prid
                    time_aspect VARCHAR(20) DEFAULT '',    -- Pt/24H
                    system TEXT DEFAULT '',                -- Bld/Urine/Ser/Plas
                    scale VARCHAR(20) DEFAULT '',          -- Qn/Ord/Nom
                    method TEXT DEFAULT '',
                    class_name TEXT DEFAULT '',            -- CHEM/MICRO/COAG
                    panel_name TEXT DEFAULT '',
                    specimen_type TEXT DEFAULT '',
                    unit TEXT DEFAULT '',
                    normal_range_male TEXT DEFAULT '',
                    normal_range_female TEXT DEFAULT '',
                    is_active BOOLEAN DEFAULT TRUE,
                    tenant_id INTEGER NOT NULL DEFAULT 1,
                    created_at TIMESTAMPTZ DEFAULT NOW()
                );
                CREATE INDEX IF NOT EXISTS idx_loinc_code ON lab_loinc_codes(loinc_code);
                CREATE INDEX IF NOT EXISTS idx_loinc_class ON lab_loinc_codes(class_name, tenant_id);

                -- C4: Problem List ICD-10 (قائمة المشكلات مرتبطة بـ ICD-10)
                CREATE TABLE IF NOT EXISTS patient_problem_list (
                    id SERIAL PRIMARY KEY,
                    patient_id INTEGER NOT NULL REFERENCES patients(id),
                    admission_id INTEGER,
                    icd10_code VARCHAR(20) NOT NULL DEFAULT '',
                    icd10_description TEXT DEFAULT '',
                    snomed_code VARCHAR(30) DEFAULT '',
                    problem_name TEXT NOT NULL DEFAULT '',
                    problem_type VARCHAR(30) DEFAULT 'Chronic'
                        CHECK (problem_type IN ('Chronic','Acute','Historical','Surgical','Allergy','Social','Family')),
                    onset_date DATE,
                    resolved_date DATE,
                    is_active BOOLEAN DEFAULT TRUE,
                    severity VARCHAR(20) DEFAULT 'Moderate'
                        CHECK (severity IN ('Mild','Moderate','Severe','Critical')),
                    status VARCHAR(20) DEFAULT 'Active'
                        CHECK (status IN ('Active','Resolved','Inactive','Recurrent')),
                    added_by TEXT DEFAULT '',
                    added_by_id INTEGER,
                    last_updated_by TEXT DEFAULT '',
                    encounter_id INTEGER,
                    notes TEXT DEFAULT '',
                    principal_diagnosis BOOLEAN DEFAULT FALSE,  -- PDx flag
                    tenant_id INTEGER NOT NULL DEFAULT 1,
                    facility_id INTEGER,
                    created_at TIMESTAMPTZ DEFAULT NOW()
                );
                CREATE INDEX IF NOT EXISTS idx_ppl_patient ON patient_problem_list(patient_id, tenant_id);
                CREATE INDEX IF NOT EXISTS idx_ppl_icd10 ON patient_problem_list(icd10_code, tenant_id);
                CREATE INDEX IF NOT EXISTS idx_ppl_active ON patient_problem_list(is_active, tenant_id);

                -- C4b: ICD-10 Code Reference (quick lookup)
                CREATE TABLE IF NOT EXISTS icd10_codes (
                    id SERIAL PRIMARY KEY,
                    code VARCHAR(20) UNIQUE NOT NULL,
                    description_en TEXT NOT NULL DEFAULT '',
                    description_ar TEXT DEFAULT '',
                    category VARCHAR(10) DEFAULT '',       -- A00-B99 / J00-J99...
                    chapter TEXT DEFAULT '',
                    is_billable BOOLEAN DEFAULT TRUE,
                    is_valid BOOLEAN DEFAULT TRUE,
                    created_at TIMESTAMPTZ DEFAULT NOW()
                );
                CREATE INDEX IF NOT EXISTS idx_icd10_code ON icd10_codes(code);
                CREATE INDEX IF NOT EXISTS idx_icd10_desc ON icd10_codes(description_en);
            `);
            console.log('  ✅ Phase C tables created (pharmacy_controlled_substances, pharmacy_cs_transactions, medication_reconciliations, lab_microbiology, lab_loinc_codes, patient_problem_list, icd10_codes)');
        } catch (e) { console.error('Phase C tables migration error:', e.message); }

        // ===== PHASE D — FINANCE & OPERATIONS (D1-D3) =====
        try {
            await client.query(`
                -- D1a: Accounts Payable (الذمم الدائنة)
                CREATE TABLE IF NOT EXISTS finance_accounts_payable (
                    id SERIAL PRIMARY KEY,
                    vendor_id INTEGER,                     -- FK to vendors table
                    vendor_name TEXT NOT NULL DEFAULT '',
                    invoice_number TEXT NOT NULL DEFAULT '',
                    invoice_date DATE NOT NULL DEFAULT CURRENT_DATE,
                    due_date DATE,
                    po_reference TEXT DEFAULT '',          -- Purchase Order ref
                    description TEXT DEFAULT '',
                    subtotal NUMERIC(14,2) DEFAULT 0,
                    vat_amount NUMERIC(14,2) DEFAULT 0,
                    total_amount NUMERIC(14,2) NOT NULL DEFAULT 0,
                    paid_amount NUMERIC(14,2) DEFAULT 0,
                    balance_due NUMERIC(14,2) GENERATED ALWAYS AS (total_amount - paid_amount) STORED,
                    payment_status VARCHAR(20) DEFAULT 'Unpaid'
                        CHECK (payment_status IN ('Unpaid','Partial','Paid','Overdue','Disputed','Cancelled')),
                    payment_method VARCHAR(30) DEFAULT '',
                    payment_date DATE,
                    payment_reference TEXT DEFAULT '',
                    gl_account_code VARCHAR(20) DEFAULT '', -- GL mapping
                    cost_center VARCHAR(50) DEFAULT '',
                    approved_by TEXT DEFAULT '',
                    approved_at TIMESTAMPTZ,
                    attachment_url TEXT DEFAULT '',
                    notes TEXT DEFAULT '',
                    tenant_id INTEGER NOT NULL DEFAULT 1,
                    facility_id INTEGER,
                    created_at TIMESTAMPTZ DEFAULT NOW()
                );
                CREATE INDEX IF NOT EXISTS idx_ap_vendor ON finance_accounts_payable(vendor_id, tenant_id);
                CREATE INDEX IF NOT EXISTS idx_ap_due ON finance_accounts_payable(due_date, tenant_id);
                CREATE INDEX IF NOT EXISTS idx_ap_status ON finance_accounts_payable(payment_status, tenant_id);

                -- D1b: Accounts Receivable (الذمم المدينة)
                CREATE TABLE IF NOT EXISTS finance_accounts_receivable (
                    id SERIAL PRIMARY KEY,
                    patient_id INTEGER REFERENCES patients(id),
                    patient_name TEXT DEFAULT '',
                    payer_type VARCHAR(20) DEFAULT 'Patient'
                        CHECK (payer_type IN ('Patient','Insurance','Government','Corporate','Other')),
                    payer_id INTEGER,                      -- insurance_company_id or corporate_id
                    payer_name TEXT DEFAULT '',
                    invoice_number TEXT NOT NULL DEFAULT '',
                    visit_id INTEGER,
                    admission_id INTEGER,
                    invoice_date DATE NOT NULL DEFAULT CURRENT_DATE,
                    due_date DATE,
                    subtotal NUMERIC(14,2) DEFAULT 0,
                    discount_amount NUMERIC(14,2) DEFAULT 0,
                    insurance_share NUMERIC(14,2) DEFAULT 0,
                    patient_share NUMERIC(14,2) DEFAULT 0,
                    vat_amount NUMERIC(14,2) DEFAULT 0,
                    total_amount NUMERIC(14,2) NOT NULL DEFAULT 0,
                    collected_amount NUMERIC(14,2) DEFAULT 0,
                    balance_due NUMERIC(14,2) GENERATED ALWAYS AS (total_amount - collected_amount) STORED,
                    collection_status VARCHAR(20) DEFAULT 'Outstanding'
                        CHECK (collection_status IN ('Outstanding','Partial','Collected','WriteOff','Disputed','Referred')),
                    last_payment_date DATE,
                    last_payment_amount NUMERIC(14,2) DEFAULT 0,
                    aging_bucket VARCHAR(20) DEFAULT 'Current', -- Current/30d/60d/90d/120d+
                    write_off_amount NUMERIC(14,2) DEFAULT 0,
                    write_off_reason TEXT DEFAULT '',
                    notes TEXT DEFAULT '',
                    tenant_id INTEGER NOT NULL DEFAULT 1,
                    facility_id INTEGER,
                    created_at TIMESTAMPTZ DEFAULT NOW()
                );
                CREATE INDEX IF NOT EXISTS idx_ar_patient ON finance_accounts_receivable(patient_id, tenant_id);
                CREATE INDEX IF NOT EXISTS idx_ar_payer ON finance_accounts_receivable(payer_type, payer_id, tenant_id);
                CREATE INDEX IF NOT EXISTS idx_ar_status ON finance_accounts_receivable(collection_status, tenant_id);
                CREATE INDEX IF NOT EXISTS idx_ar_due ON finance_accounts_receivable(due_date, tenant_id);

                -- D2: Vendor Management (إدارة الموردين)
                CREATE TABLE IF NOT EXISTS vendors (
                    id SERIAL PRIMARY KEY,
                    vendor_code TEXT UNIQUE,
                    vendor_name_ar TEXT NOT NULL DEFAULT '',
                    vendor_name_en TEXT DEFAULT '',
                    vendor_type VARCHAR(30) DEFAULT 'Supplier'
                        CHECK (vendor_type IN ('Supplier','Contractor','Consultant','Laboratory','Pharmaceutical','Medical Equipment','Maintenance','Other')),
                    contact_person TEXT DEFAULT '',
                    phone TEXT DEFAULT '',
                    email TEXT DEFAULT '',
                    address TEXT DEFAULT '',
                    city TEXT DEFAULT 'Riyadh',
                    country TEXT DEFAULT 'Saudi Arabia',
                    vat_number TEXT DEFAULT '',            -- رقم ضريبة القيمة المضافة
                    commercial_register TEXT DEFAULT '',   -- السجل التجاري
                    iban TEXT DEFAULT '',
                    bank_name TEXT DEFAULT '',
                    payment_terms INTEGER DEFAULT 30,      -- أيام الدفع
                    currency VARCHAR(5) DEFAULT 'SAR',
                    credit_limit NUMERIC(14,2) DEFAULT 0,
                    total_outstanding NUMERIC(14,2) DEFAULT 0,
                    rating INTEGER DEFAULT 3               -- 1-5 نجوم
                        CHECK (rating BETWEEN 1 AND 5),
                    is_approved BOOLEAN DEFAULT FALSE,
                    approved_by TEXT DEFAULT '',
                    approved_at TIMESTAMPTZ,
                    is_active BOOLEAN DEFAULT TRUE,
                    contract_start DATE,
                    contract_end DATE,
                    notes TEXT DEFAULT '',
                    tenant_id INTEGER NOT NULL DEFAULT 1,
                    facility_id INTEGER,
                    created_at TIMESTAMPTZ DEFAULT NOW()
                );
                CREATE INDEX IF NOT EXISTS idx_vendor_name ON vendors(vendor_name_ar, tenant_id);
                CREATE INDEX IF NOT EXISTS idx_vendor_type ON vendors(vendor_type, tenant_id);
                CREATE INDEX IF NOT EXISTS idx_vendor_active ON vendors(is_active, tenant_id);

                -- D3: Financial Reports snapshots (تقارير مالية مُجمَّعة)
                CREATE TABLE IF NOT EXISTS finance_report_snapshots (
                    id SERIAL PRIMARY KEY,
                    report_type VARCHAR(50) NOT NULL,      -- PL/BalanceSheet/CashFlow/AR_Aging/AP_Aging/Revenue
                    report_period_start DATE NOT NULL,
                    report_period_end DATE NOT NULL,
                    generated_by TEXT DEFAULT '',
                    generated_at TIMESTAMPTZ DEFAULT NOW(),
                    report_data JSONB NOT NULL DEFAULT '{}',  -- full P&L / BS data
                    total_revenue NUMERIC(16,2) DEFAULT 0,
                    total_expenses NUMERIC(16,2) DEFAULT 0,
                    net_income NUMERIC(16,2) DEFAULT 0,
                    total_assets NUMERIC(16,2) DEFAULT 0,
                    total_liabilities NUMERIC(16,2) DEFAULT 0,
                    total_equity NUMERIC(16,2) DEFAULT 0,
                    status VARCHAR(20) DEFAULT 'Draft'
                        CHECK (status IN ('Draft','Final','Approved','Audited')),
                    approved_by TEXT DEFAULT '',
                    tenant_id INTEGER NOT NULL DEFAULT 1,
                    facility_id INTEGER,
                    created_at TIMESTAMPTZ DEFAULT NOW()
                );
                CREATE INDEX IF NOT EXISTS idx_fin_rep_type ON finance_report_snapshots(report_type, tenant_id);
                CREATE INDEX IF NOT EXISTS idx_fin_rep_period ON finance_report_snapshots(report_period_start, tenant_id);
            `);
            console.log('  ✅ Phase D tables created (finance_accounts_payable, finance_accounts_receivable, vendors, finance_report_snapshots)');
        } catch (e) { console.error('Phase D tables migration error:', e.message); }

        // ===== PHASE E — INTEGRATION & AI (E1-E3) =====
        try {
            await client.query(`
                -- E1: FHIR Resource Store (FHIR R4 resource cache/log)
                CREATE TABLE IF NOT EXISTS fhir_resources (
                    id SERIAL PRIMARY KEY,
                    resource_type VARCHAR(50) NOT NULL,    -- Patient/Observation/Condition/MedicationRequest...
                    resource_id TEXT NOT NULL DEFAULT '',  -- FHIR logical id
                    version_id TEXT DEFAULT '1',
                    resource_json JSONB NOT NULL,
                    last_updated TIMESTAMPTZ DEFAULT NOW(),
                    source_system VARCHAR(50) DEFAULT 'NamaMedical',
                    source_reference TEXT DEFAULT '',      -- internal record reference
                    is_active BOOLEAN DEFAULT TRUE,
                    tenant_id INTEGER NOT NULL DEFAULT 1,
                    facility_id INTEGER,
                    created_at TIMESTAMPTZ DEFAULT NOW(),
                    UNIQUE(resource_type, resource_id, tenant_id)
                );
                CREATE INDEX IF NOT EXISTS idx_fhir_type ON fhir_resources(resource_type, tenant_id);
                CREATE INDEX IF NOT EXISTS idx_fhir_id ON fhir_resources(resource_id, tenant_id);
                CREATE INDEX IF NOT EXISTS idx_fhir_updated ON fhir_resources(last_updated, tenant_id);

                -- E2: HL7 Message Log (HL7 v2.x ADT/ORM/ORU messages)
                CREATE TABLE IF NOT EXISTS hl7_messages (
                    id SERIAL PRIMARY KEY,
                    message_type VARCHAR(20) NOT NULL,     -- ADT^A01 / ORM^O01 / ORU^R01 / DFT^P03
                    message_control_id TEXT DEFAULT '',
                    sending_application TEXT DEFAULT 'NamaMedical',
                    receiving_application TEXT DEFAULT '',
                    sending_facility TEXT DEFAULT '',
                    message_datetime TIMESTAMPTZ DEFAULT NOW(),
                    patient_id INTEGER REFERENCES patients(id),
                    message_body TEXT NOT NULL DEFAULT '', -- raw HL7 pipe-delimited
                    parsed_json JSONB,                     -- parsed segments
                    processing_status VARCHAR(20) DEFAULT 'Queued'
                        CHECK (processing_status IN ('Queued','Processing','Sent','Acknowledged','Failed','Rejected')),
                    ack_message TEXT DEFAULT '',
                    error_message TEXT DEFAULT '',
                    retry_count INTEGER DEFAULT 0,
                    direction VARCHAR(10) DEFAULT 'Outbound'
                        CHECK (direction IN ('Inbound','Outbound')),
                    interface_name TEXT DEFAULT '',        -- LIS/RIS/Analyzer/PACS
                    tenant_id INTEGER NOT NULL DEFAULT 1,
                    facility_id INTEGER,
                    created_at TIMESTAMPTZ DEFAULT NOW()
                );
                CREATE INDEX IF NOT EXISTS idx_hl7_type ON hl7_messages(message_type, tenant_id);
                CREATE INDEX IF NOT EXISTS idx_hl7_patient ON hl7_messages(patient_id, tenant_id);
                CREATE INDEX IF NOT EXISTS idx_hl7_status ON hl7_messages(processing_status, tenant_id);
                CREATE INDEX IF NOT EXISTS idx_hl7_datetime ON hl7_messages(message_datetime, tenant_id);

                -- E3: AI Clinical Decision Support Log
                CREATE TABLE IF NOT EXISTS ai_cds_log (
                    id SERIAL PRIMARY KEY,
                    patient_id INTEGER REFERENCES patients(id),
                    user_id INTEGER,
                    user_name TEXT DEFAULT '',
                    context_type VARCHAR(50) DEFAULT '',   -- Differential/DoseCheck/LabInterpretation/RiskScore
                    input_data JSONB,                      -- clinical context sent to AI
                    ai_model TEXT DEFAULT '',              -- gemini-pro / gpt-4 / claude
                    ai_response JSONB,                     -- structured AI response
                    recommendations TEXT DEFAULT '',
                    accepted_by_clinician BOOLEAN,
                    override_reason TEXT DEFAULT '',
                    processing_time_ms INTEGER DEFAULT 0,
                    tokens_used INTEGER DEFAULT 0,
                    tenant_id INTEGER NOT NULL DEFAULT 1,
                    facility_id INTEGER,
                    created_at TIMESTAMPTZ DEFAULT NOW()
                );
                CREATE INDEX IF NOT EXISTS idx_ai_patient ON ai_cds_log(patient_id, tenant_id);
                CREATE INDEX IF NOT EXISTS idx_ai_context ON ai_cds_log(context_type, tenant_id);
                CREATE INDEX IF NOT EXISTS idx_ai_date ON ai_cds_log(created_at, tenant_id);

                -- E3b: AI Voice Dictation sessions
                CREATE TABLE IF NOT EXISTS ai_voice_sessions (
                    id SERIAL PRIMARY KEY,
                    user_id INTEGER NOT NULL,
                    user_name TEXT DEFAULT '',
                    patient_id INTEGER REFERENCES patients(id),
                    session_type VARCHAR(30) DEFAULT 'Clinical Note'
                        CHECK (session_type IN ('Clinical Note','Discharge Summary','Referral Letter','Prescription','Radiology Report','Operative Note')),
                    audio_duration_sec INTEGER DEFAULT 0,
                    transcript_raw TEXT DEFAULT '',
                    transcript_structured JSONB,           -- SOAP / structured output
                    ai_model TEXT DEFAULT '',
                    confidence_score NUMERIC(5,4) DEFAULT 0,
                    draft_text TEXT DEFAULT '',
                    final_text TEXT DEFAULT '',
                    is_finalized BOOLEAN DEFAULT FALSE,
                    finalized_at TIMESTAMPTZ,
                    tenant_id INTEGER NOT NULL DEFAULT 1,
                    facility_id INTEGER,
                    created_at TIMESTAMPTZ DEFAULT NOW()
                );
                CREATE INDEX IF NOT EXISTS idx_voice_user ON ai_voice_sessions(user_id, tenant_id);
                CREATE INDEX IF NOT EXISTS idx_voice_patient ON ai_voice_sessions(patient_id, tenant_id);
            `);
            console.log('  ✅ Phase E tables created (fhir_resources, hl7_messages, ai_cds_log, ai_voice_sessions)');
        } catch (e) { console.error('Phase E tables migration error:', e.message); }

        // ===== PHASE F — WORLD-CLASS CLINICAL QUALITY TABLES (F1-F3) =====
        try {
            await client.query(`
                -- F1: Nursing Risk Assessments (Braden Scale & Morse Fall Risk)
                CREATE TABLE IF NOT EXISTS nursing_risk_assessments (
                    id SERIAL PRIMARY KEY,
                    patient_id INTEGER REFERENCES patients(id),
                    admission_id INTEGER,
                    assessment_type VARCHAR(30) NOT NULL, -- 'Braden Scale' / 'Morse Fall Risk'
                    total_score INTEGER NOT NULL,
                    risk_level VARCHAR(20) NOT NULL,      -- Low / Moderate / High
                    details JSONB NOT NULL DEFAULT '{}',  -- breakdown of parameters
                    assessed_by TEXT DEFAULT '',
                    tenant_id INTEGER NOT NULL DEFAULT 1,
                    facility_id INTEGER,
                    created_at TIMESTAMPTZ DEFAULT NOW()
                );
                CREATE INDEX IF NOT EXISTS idx_nurs_risk_pat ON nursing_risk_assessments(patient_id, tenant_id);

                -- F2: Surgery Count Sheets (Sponge/Needle/Instrument counts)
                CREATE TABLE IF NOT EXISTS surgery_count_sheets (
                    id SERIAL PRIMARY KEY,
                    surgery_id INTEGER,
                    sponge_count_initial INTEGER DEFAULT 0,
                    sponge_count_final INTEGER DEFAULT 0,
                    needle_count_initial INTEGER DEFAULT 0,
                    needle_count_final INTEGER DEFAULT 0,
                    instrument_count_initial INTEGER DEFAULT 0,
                    instrument_count_final INTEGER DEFAULT 0,
                    counts_match BOOLEAN DEFAULT FALSE,
                    witness1_name TEXT DEFAULT '',
                    witness2_name TEXT DEFAULT '',
                    notes TEXT DEFAULT '',
                    tenant_id INTEGER NOT NULL DEFAULT 1,
                    facility_id INTEGER,
                    created_at TIMESTAMPTZ DEFAULT NOW()
                );
                CREATE INDEX IF NOT EXISTS idx_surg_count ON surgery_count_sheets(surgery_id, tenant_id);

                -- F3: Neonatal Apgar Scores (Apgar scoring for newborns)
                CREATE TABLE IF NOT EXISTS neonatal_apgar_scores (
                    id SERIAL PRIMARY KEY,
                    patient_id INTEGER REFERENCES patients(id),
                    mother_id INTEGER REFERENCES patients(id),
                    apgar_1min INTEGER DEFAULT 0,
                    apgar_5min INTEGER DEFAULT 0,
                    apgar_10min INTEGER DEFAULT 0,
                    details JSONB NOT NULL DEFAULT '{}', -- details of individual scores
                    assessed_by TEXT DEFAULT '',
                    notes TEXT DEFAULT '',
                    tenant_id INTEGER NOT NULL DEFAULT 1,
                    facility_id INTEGER,
                    created_at TIMESTAMPTZ DEFAULT NOW()
                );
                CREATE INDEX IF NOT EXISTS idx_neo_apgar_pat ON neonatal_apgar_scores(patient_id, tenant_id);

                -- F: Notifications table (needed for low-stock and clinical alerts)
                CREATE TABLE IF NOT EXISTS notifications (
                    id SERIAL PRIMARY KEY,
                    user_id INTEGER,
                    target_role VARCHAR(50) DEFAULT '',
                    title TEXT DEFAULT '',
                    title_ar TEXT DEFAULT '',
                    message TEXT DEFAULT '',
                    body TEXT DEFAULT '',
                    body_ar TEXT DEFAULT '',
                    type VARCHAR(50) DEFAULT '',
                    module VARCHAR(50) DEFAULT '',
                    record_id INTEGER,
                    is_read INTEGER DEFAULT 0,
                    tenant_id INTEGER NOT NULL DEFAULT 1,
                    created_at TIMESTAMPTZ DEFAULT NOW()
                );
                CREATE INDEX IF NOT EXISTS idx_notifications_tenant ON notifications(tenant_id);

                -- Enable RLS and create policy for all four tables
                ALTER TABLE nursing_risk_assessments ENABLE ROW LEVEL SECURITY;
                ALTER TABLE nursing_risk_assessments FORCE ROW LEVEL SECURITY;
                
                ALTER TABLE surgery_count_sheets ENABLE ROW LEVEL SECURITY;
                ALTER TABLE surgery_count_sheets FORCE ROW LEVEL SECURITY;
                
                ALTER TABLE neonatal_apgar_scores ENABLE ROW LEVEL SECURITY;
                ALTER TABLE neonatal_apgar_scores FORCE ROW LEVEL SECURITY;

                ALTER TABLE notifications ENABLE ROW LEVEL SECURITY;
                ALTER TABLE notifications FORCE ROW LEVEL SECURITY;
            `);

            // Creating policies separately to prevent failure if they already exist
            try { await client.query("CREATE POLICY tenant_sec_nurs_risk ON nursing_risk_assessments FOR ALL USING (tenant_id = current_setting('app.tenant_id')::integer)"); } catch (e) { /* already exists */ }
            try { await client.query("CREATE POLICY tenant_sec_surg_count ON surgery_count_sheets FOR ALL USING (tenant_id = current_setting('app.tenant_id')::integer)"); } catch (e) { /* already exists */ }
            try { await client.query("CREATE POLICY tenant_sec_neo_apgar ON neonatal_apgar_scores FOR ALL USING (tenant_id = current_setting('app.tenant_id')::integer)"); } catch (e) { /* already exists */ }
            try { await client.query("CREATE POLICY tenant_sec_notifications ON notifications FOR ALL USING (tenant_id = current_setting('app.tenant_id')::integer)"); } catch (e) { /* already exists */ }

            console.log('  ✅ Phase F tables created (nursing_risk_assessments, surgery_count_sheets, neonatal_apgar_scores, notifications) with FORCE RLS enabled.');
        } catch (e) { console.error('Phase F tables migration error:', e.message); }

        // ===== Phase 3: Calibrations & Medical Waste =====
        try {
            await client.query(`
                CREATE TABLE IF NOT EXISTS device_calibrations (
                    id SERIAL PRIMARY KEY,
                    device_name TEXT DEFAULT '',
                    serial_number TEXT DEFAULT '',
                    calibration_date TEXT DEFAULT '',
                    next_calibration_date TEXT DEFAULT '',
                    calibrated_by TEXT DEFAULT '',
                    status TEXT DEFAULT 'Calibrated',
                    notes TEXT DEFAULT '',
                    tenant_id INTEGER NOT NULL DEFAULT 1,
                    facility_id INTEGER,
                    created_at TIMESTAMPTZ DEFAULT NOW()
                );
                CREATE INDEX IF NOT EXISTS idx_calibrations_tenant ON device_calibrations(tenant_id);

                CREATE TABLE IF NOT EXISTS medical_waste_logs (
                    id SERIAL PRIMARY KEY,
                    waste_type TEXT DEFAULT '',
                    weight_kg REAL DEFAULT 0,
                    disposal_company TEXT DEFAULT '',
                    truck_number TEXT DEFAULT '',
                    logged_by TEXT DEFAULT '',
                    logged_at TIMESTAMPTZ DEFAULT NOW(),
                    notes TEXT DEFAULT '',
                    tenant_id INTEGER NOT NULL DEFAULT 1,
                    facility_id INTEGER
                );
                CREATE INDEX IF NOT EXISTS idx_waste_tenant ON medical_waste_logs(tenant_id);

                ALTER TABLE device_calibrations ENABLE ROW LEVEL SECURITY;
                ALTER TABLE device_calibrations FORCE ROW LEVEL SECURITY;

                ALTER TABLE medical_waste_logs ENABLE ROW LEVEL SECURITY;
                ALTER TABLE medical_waste_logs FORCE ROW LEVEL SECURITY;
            `);

            try { await client.query("CREATE POLICY tenant_sec_calibrations ON device_calibrations FOR ALL USING (tenant_id = current_setting('app.tenant_id')::integer)"); } catch (e) {}
            try { await client.query("CREATE POLICY tenant_sec_waste ON medical_waste_logs FOR ALL USING (tenant_id = current_setting('app.tenant_id')::integer)"); } catch (e) {}

            console.log('  ✅ Phase 3 tables created (device_calibrations, medical_waste_logs) with FORCE RLS.');
        } catch (e) { console.error('Phase 3 tables migration error:', e.message); }

        console.log('  ✅ PostgreSQL tables created');
    } finally {
        client.release();
    }
}

module.exports = { pool, query, getPool, initDatabase, tenantStore, runWithTenant, getCurrentTenantId };
