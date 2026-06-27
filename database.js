const Database = require('better-sqlite3');
const path = require('path');

const DB_PATH = path.join(__dirname, 'nama_medical_web.db');
let db;

function getDb() {
  if (!db) {
    db = new Database(DB_PATH);
    db.pragma('journal_mode = WAL');
    db.pragma('foreign_keys = ON');
    createTables();
    insertSampleData();
  }
  return db;
}

function createTables() {
  const d = getDbRaw();

  d.exec(`CREATE TABLE IF NOT EXISTS patients (
    id INTEGER PRIMARY KEY AUTOINCREMENT,
    file_number INTEGER DEFAULT 0,
    name_ar TEXT DEFAULT '',
    name_en TEXT DEFAULT '',
    national_id TEXT DEFAULT '',
    phone TEXT DEFAULT '',
    department TEXT DEFAULT '',
    notes TEXT DEFAULT '',
    amount REAL DEFAULT 0,
    payment_method TEXT DEFAULT '',
    status TEXT DEFAULT 'Waiting',
    created_at DATETIME DEFAULT CURRENT_TIMESTAMP
  )`);

  d.exec(`CREATE TABLE IF NOT EXISTS appointments (
    id INTEGER PRIMARY KEY AUTOINCREMENT,
    patient_id INTEGER,
    patient_name TEXT DEFAULT '',
    doctor_name TEXT DEFAULT '',
    department TEXT DEFAULT '',
    appt_date TEXT DEFAULT '',
    appt_time TEXT DEFAULT '',
    notes TEXT DEFAULT '',
    status TEXT DEFAULT 'Confirmed',
    created_at DATETIME DEFAULT CURRENT_TIMESTAMP
  )`);

  d.exec(`CREATE TABLE IF NOT EXISTS employees (
    id INTEGER PRIMARY KEY AUTOINCREMENT,
    name TEXT DEFAULT '',
    name_ar TEXT DEFAULT '',
    name_en TEXT DEFAULT '',
    role TEXT DEFAULT 'Staff',
    department_ar TEXT DEFAULT '',
    department_en TEXT DEFAULT '',
    status TEXT DEFAULT 'Active',
    salary REAL DEFAULT 0,
    created_at DATETIME DEFAULT CURRENT_TIMESTAMP
  )`);

  d.exec(`CREATE TABLE IF NOT EXISTS invoices (
    id INTEGER PRIMARY KEY AUTOINCREMENT,
    patient_name TEXT DEFAULT '',
    total REAL DEFAULT 0,
    paid INTEGER DEFAULT 0,
    order_id INTEGER DEFAULT 0,
    service_type TEXT DEFAULT '',
    invoice_number TEXT DEFAULT '',
    description TEXT DEFAULT '',
    amount REAL DEFAULT 0,
    vat_amount REAL DEFAULT 0,
    patient_id INTEGER DEFAULT 0,
    payment_method TEXT DEFAULT '',
    created_at DATETIME DEFAULT CURRENT_TIMESTAMP
  )`);

  d.exec(`CREATE TABLE IF NOT EXISTS insurance_companies (
    id INTEGER PRIMARY KEY AUTOINCREMENT,
    name_ar TEXT DEFAULT '',
    name_en TEXT DEFAULT '',
    tpa_id INTEGER DEFAULT 0,
    contact_info TEXT DEFAULT '',
    created_at DATETIME DEFAULT CURRENT_TIMESTAMP
  )`);

  d.exec(`CREATE TABLE IF NOT EXISTS insurance_contracts (
    id INTEGER PRIMARY KEY AUTOINCREMENT,
    company_id INTEGER,
    contract_name TEXT DEFAULT '',
    valid_from TEXT DEFAULT '',
    valid_to TEXT DEFAULT '',
    discount_percentage REAL DEFAULT 0,
    file_path TEXT DEFAULT '',
    created_at DATETIME DEFAULT CURRENT_TIMESTAMP
  )`);

  d.exec(`CREATE TABLE IF NOT EXISTS insurance_policies (
    id INTEGER PRIMARY KEY AUTOINCREMENT,
    name TEXT DEFAULT '',
    class_type TEXT DEFAULT '',
    max_limit REAL DEFAULT 0,
    co_pay_percent REAL DEFAULT 0,
    co_pay_max REAL DEFAULT 0,
    dental_included INTEGER DEFAULT 0,
    optical_included INTEGER DEFAULT 0,
    maternity_included INTEGER DEFAULT 0
  )`);

  d.exec(`CREATE TABLE IF NOT EXISTS icd10_codes (
    code TEXT PRIMARY KEY,
    description_en TEXT DEFAULT '',
    description_ar TEXT DEFAULT ''
  )`);

  d.exec(`CREATE TABLE IF NOT EXISTS approvals (
    id INTEGER PRIMARY KEY AUTOINCREMENT,
    patient_id INTEGER,
    service_id INTEGER,
    request_date TEXT DEFAULT '',
    status TEXT DEFAULT 'Pending',
    approval_number TEXT DEFAULT '',
    response_date TEXT DEFAULT ''
  )`);

  d.exec(`CREATE TABLE IF NOT EXISTS insurance_claims (
    id INTEGER PRIMARY KEY AUTOINCREMENT,
    patient_name TEXT DEFAULT '',
    insurance_company TEXT DEFAULT '',
    claim_amount REAL DEFAULT 0,
    status TEXT DEFAULT 'Pending',
    contract_id INTEGER DEFAULT 0,
    policy_id INTEGER DEFAULT 0,
    ucaf_dcaf_data TEXT DEFAULT '',
    waseel_status TEXT DEFAULT 'Unsent',
    created_at DATETIME DEFAULT CURRENT_TIMESTAMP
  )`);

  d.exec(`CREATE TABLE IF NOT EXISTS medical_records (
    id INTEGER PRIMARY KEY AUTOINCREMENT,
    patient_id INTEGER,
    doctor_id INTEGER,
    diagnosis TEXT DEFAULT '',
    symptoms TEXT DEFAULT '',
    icd10_codes TEXT DEFAULT '',
    notes TEXT DEFAULT '',
    visit_date DATETIME DEFAULT CURRENT_TIMESTAMP
  )`);

  d.exec(`CREATE TABLE IF NOT EXISTS prescriptions (
    id INTEGER PRIMARY KEY AUTOINCREMENT,
    patient_id INTEGER,
    doctor_id INTEGER,
    medication_id INTEGER,
    dosage TEXT DEFAULT '',
    duration TEXT DEFAULT '',
    status TEXT DEFAULT 'Pending',
    created_at DATETIME DEFAULT CURRENT_TIMESTAMP
  )`);

  d.exec(`CREATE TABLE IF NOT EXISTS medications (
    id INTEGER PRIMARY KEY AUTOINCREMENT,
    name TEXT DEFAULT '',
    active_ingredient TEXT DEFAULT '',
    stock_quantity INTEGER DEFAULT 0,
    price REAL DEFAULT 0
  )`);

  d.exec(`CREATE TABLE IF NOT EXISTS lab_radiology_orders (
    id INTEGER PRIMARY KEY AUTOINCREMENT,
    patient_id INTEGER,
    doctor_id INTEGER,
    order_type TEXT DEFAULT '',
    description TEXT DEFAULT '',
    status TEXT DEFAULT 'Requested',
    sample_serial TEXT DEFAULT '',
    result_date TEXT DEFAULT '',
    sms_sent INTEGER DEFAULT 0,
    results TEXT DEFAULT '',
    radiology_images_paths TEXT DEFAULT '',
    structured_report TEXT DEFAULT '',
    is_radiology INTEGER DEFAULT 0,
    price REAL DEFAULT 0,
    approval_status TEXT DEFAULT 'Pending Approval',
    approved_by TEXT DEFAULT '',
    created_at DATETIME DEFAULT CURRENT_TIMESTAMP
  )`);

  d.exec(`CREATE TABLE IF NOT EXISTS dental_records (
    id INTEGER PRIMARY KEY AUTOINCREMENT,
    patient_id INTEGER,
    tooth_number INTEGER,
    condition TEXT DEFAULT '',
    treatment_done TEXT DEFAULT '',
    visit_date DATETIME DEFAULT CURRENT_TIMESTAMP
  )`);

  d.exec(`CREATE TABLE IF NOT EXISTS lab_tests_catalog (
    id INTEGER PRIMARY KEY AUTOINCREMENT,
    test_name TEXT DEFAULT '',
    category TEXT DEFAULT '',
    normal_range TEXT DEFAULT '',
    price REAL DEFAULT 0
  )`);

  d.exec(`CREATE TABLE IF NOT EXISTS lab_results (
    id INTEGER PRIMARY KEY AUTOINCREMENT,
    order_id INTEGER,
    test_id INTEGER,
    result_value TEXT DEFAULT '',
    is_abnormal INTEGER DEFAULT 0,
    notes TEXT DEFAULT ''
  )`);

  d.exec(`CREATE TABLE IF NOT EXISTS radiology_catalog (
    id INTEGER PRIMARY KEY AUTOINCREMENT,
    modality TEXT DEFAULT '',
    exact_name TEXT DEFAULT '',
    default_template TEXT DEFAULT '',
    price REAL DEFAULT 0
  )`);

  // Pharmacy tables
  d.exec(`CREATE TABLE IF NOT EXISTS pharmacy_prescriptions_queue (
    id INTEGER PRIMARY KEY AUTOINCREMENT,
    patient_id INTEGER,
    doctor_id INTEGER,
    clinic_name TEXT DEFAULT '',
    prescription_text TEXT DEFAULT '',
    status TEXT DEFAULT 'Pending',
    dispensed_by TEXT DEFAULT '',
    dispensed_at DATETIME,
    created_at DATETIME DEFAULT CURRENT_TIMESTAMP
  )`);

  d.exec(`CREATE TABLE IF NOT EXISTS pharmacy_drug_catalog (
    id INTEGER PRIMARY KEY AUTOINCREMENT,
    drug_name TEXT DEFAULT '',
    active_ingredient TEXT DEFAULT '',
    barcode TEXT DEFAULT '',
    category TEXT DEFAULT '',
    unit TEXT DEFAULT '',
    selling_price REAL DEFAULT 0,
    cost_price REAL DEFAULT 0,
    stock_qty INTEGER DEFAULT 0,
    min_qty INTEGER DEFAULT 5,
    expiry_date TEXT DEFAULT '',
    is_active INTEGER DEFAULT 1
  )`);

  d.exec(`CREATE TABLE IF NOT EXISTS pharmacy_suppliers (
    id INTEGER PRIMARY KEY AUTOINCREMENT,
    company_name TEXT DEFAULT '',
    contact_person TEXT DEFAULT '',
    phone TEXT DEFAULT '',
    email TEXT DEFAULT '',
    address TEXT DEFAULT '',
    tax_number TEXT DEFAULT '',
    notes TEXT DEFAULT ''
  )`);

  d.exec(`CREATE TABLE IF NOT EXISTS pharmacy_sales (
    id INTEGER PRIMARY KEY AUTOINCREMENT,
    patient_id INTEGER,
    sale_type TEXT DEFAULT '',
    total_amount REAL DEFAULT 0,
    discount REAL DEFAULT 0,
    insurance_coverage REAL DEFAULT 0,
    patient_share REAL DEFAULT 0,
    payment_method TEXT DEFAULT '',
    cashier TEXT DEFAULT '',
    invoice_number TEXT DEFAULT '',
    created_at DATETIME DEFAULT CURRENT_TIMESTAMP
  )`);

  d.exec(`CREATE TABLE IF NOT EXISTS pharmacy_sale_items (
    id INTEGER PRIMARY KEY AUTOINCREMENT,
    sale_id INTEGER,
    drug_id INTEGER,
    qty INTEGER DEFAULT 0,
    unit_price REAL DEFAULT 0,
    total_price REAL DEFAULT 0,
    bonus_qty INTEGER DEFAULT 0,
    discount REAL DEFAULT 0
  )`);

  d.exec(`CREATE TABLE IF NOT EXISTS pharmacy_purchase_orders (
    id INTEGER PRIMARY KEY AUTOINCREMENT,
    supplier_id INTEGER,
    order_date TEXT DEFAULT '',
    total_amount REAL DEFAULT 0,
    discount REAL DEFAULT 0,
    bonus_value REAL DEFAULT 0,
    status TEXT DEFAULT 'Draft',
    notes TEXT DEFAULT '',
    created_at DATETIME DEFAULT CURRENT_TIMESTAMP
  )`);

  d.exec(`CREATE TABLE IF NOT EXISTS pharmacy_purchase_items (
    id INTEGER PRIMARY KEY AUTOINCREMENT,
    purchase_id INTEGER,
    drug_id INTEGER,
    qty INTEGER DEFAULT 0,
    unit_cost REAL DEFAULT 0,
    bonus_qty INTEGER DEFAULT 0,
    discount REAL DEFAULT 0,
    expiry_date TEXT DEFAULT '',
    batch_number TEXT DEFAULT ''
  )`);

  d.exec(`CREATE TABLE IF NOT EXISTS pharmacy_opening_balances (
    id INTEGER PRIMARY KEY AUTOINCREMENT,
    drug_id INTEGER,
    qty INTEGER DEFAULT 0,
    unit_cost REAL DEFAULT 0,
    expiry_date TEXT DEFAULT '',
    batch_number TEXT DEFAULT '',
    entry_date DATETIME DEFAULT CURRENT_TIMESTAMP
  )`);

  // Finance tables
  d.exec(`CREATE TABLE IF NOT EXISTS finance_chart_of_accounts (
    id INTEGER PRIMARY KEY AUTOINCREMENT,
    account_code TEXT DEFAULT '',
    account_name_ar TEXT DEFAULT '',
    account_name_en TEXT DEFAULT '',
    parent_id INTEGER DEFAULT 0,
    account_level INTEGER DEFAULT 1,
    account_type TEXT DEFAULT '',
    is_active INTEGER DEFAULT 1
  )`);

  d.exec(`CREATE TABLE IF NOT EXISTS finance_journal_entries (
    id INTEGER PRIMARY KEY AUTOINCREMENT,
    entry_number TEXT DEFAULT '',
    entry_date TEXT DEFAULT '',
    description TEXT DEFAULT '',
    reference TEXT DEFAULT '',
    is_auto INTEGER DEFAULT 0,
    fiscal_year_id INTEGER,
    is_posted INTEGER DEFAULT 0,
    created_by TEXT DEFAULT '',
    created_at DATETIME DEFAULT CURRENT_TIMESTAMP
  )`);

  d.exec(`CREATE TABLE IF NOT EXISTS finance_journal_lines (
    id INTEGER PRIMARY KEY AUTOINCREMENT,
    entry_id INTEGER,
    account_id INTEGER,
    debit REAL DEFAULT 0,
    credit REAL DEFAULT 0,
    cost_center_id INTEGER DEFAULT 0,
    notes TEXT DEFAULT ''
  )`);

  d.exec(`CREATE TABLE IF NOT EXISTS finance_fiscal_years (
    id INTEGER PRIMARY KEY AUTOINCREMENT,
    year_name TEXT DEFAULT '',
    start_date TEXT DEFAULT '',
    end_date TEXT DEFAULT '',
    is_closed INTEGER DEFAULT 0,
    closed_at TEXT DEFAULT ''
  )`);

  d.exec(`CREATE TABLE IF NOT EXISTS finance_cost_centers (
    id INTEGER PRIMARY KEY AUTOINCREMENT,
    center_name TEXT DEFAULT '',
    center_code TEXT DEFAULT '',
    clinic_id INTEGER DEFAULT 0,
    is_active INTEGER DEFAULT 1
  )`);

  d.exec(`CREATE TABLE IF NOT EXISTS finance_tax_declarations (
    id INTEGER PRIMARY KEY AUTOINCREMENT,
    period_start TEXT DEFAULT '',
    period_end TEXT DEFAULT '',
    total_sales REAL DEFAULT 0,
    total_vat REAL DEFAULT 0,
    status TEXT DEFAULT 'Draft',
    submitted_at TEXT DEFAULT ''
  )`);

  d.exec(`CREATE TABLE IF NOT EXISTS finance_doctor_commissions (
    id INTEGER PRIMARY KEY AUTOINCREMENT,
    doctor_id INTEGER,
    period TEXT DEFAULT '',
    total_revenue REAL DEFAULT 0,
    commission_rate REAL DEFAULT 0,
    commission_amount REAL DEFAULT 0,
    status TEXT DEFAULT 'Pending'
  )`);

  // HR tables
  d.exec(`CREATE TABLE IF NOT EXISTS hr_employees (
    id INTEGER PRIMARY KEY AUTOINCREMENT,
    emp_number TEXT DEFAULT '',
    name_ar TEXT DEFAULT '',
    name_en TEXT DEFAULT '',
    national_id TEXT DEFAULT '',
    phone TEXT DEFAULT '',
    email TEXT DEFAULT '',
    department TEXT DEFAULT '',
    job_title TEXT DEFAULT '',
    hire_date TEXT DEFAULT '',
    contract_end TEXT DEFAULT '',
    basic_salary REAL DEFAULT 0,
    housing_allowance REAL DEFAULT 0,
    transport_allowance REAL DEFAULT 0,
    is_active INTEGER DEFAULT 1
  )`);

  d.exec(`CREATE TABLE IF NOT EXISTS hr_salaries (
    id INTEGER PRIMARY KEY AUTOINCREMENT,
    employee_id INTEGER,
    month TEXT DEFAULT '',
    basic REAL DEFAULT 0,
    allowances REAL DEFAULT 0,
    deductions REAL DEFAULT 0,
    advances_deducted REAL DEFAULT 0,
    net_salary REAL DEFAULT 0,
    payment_date TEXT DEFAULT '',
    status TEXT DEFAULT 'Pending'
  )`);

  d.exec(`CREATE TABLE IF NOT EXISTS hr_leaves (
    id INTEGER PRIMARY KEY AUTOINCREMENT,
    employee_id INTEGER,
    leave_type TEXT DEFAULT '',
    start_date TEXT DEFAULT '',
    end_date TEXT DEFAULT '',
    days INTEGER DEFAULT 0,
    status TEXT DEFAULT 'Pending',
    approved_by TEXT DEFAULT '',
    notes TEXT DEFAULT ''
  )`);

  d.exec(`CREATE TABLE IF NOT EXISTS hr_advances (
    id INTEGER PRIMARY KEY AUTOINCREMENT,
    employee_id INTEGER,
    amount REAL DEFAULT 0,
    request_date TEXT DEFAULT '',
    installments INTEGER DEFAULT 1,
    remaining REAL DEFAULT 0,
    status TEXT DEFAULT 'Pending',
    notes TEXT DEFAULT ''
  )`);

  d.exec(`CREATE TABLE IF NOT EXISTS hr_employee_documents (
    id INTEGER PRIMARY KEY AUTOINCREMENT,
    employee_id INTEGER,
    doc_type TEXT DEFAULT '',
    doc_number TEXT DEFAULT '',
    issue_date TEXT DEFAULT '',
    expiry_date TEXT DEFAULT '',
    file_path TEXT DEFAULT '',
    alert_days INTEGER DEFAULT 30
  )`);

  d.exec(`CREATE TABLE IF NOT EXISTS hr_attendance (
    id INTEGER PRIMARY KEY AUTOINCREMENT,
    employee_id INTEGER,
    attendance_date TEXT DEFAULT '',
    check_in TEXT DEFAULT '',
    check_out TEXT DEFAULT '',
    total_hours REAL DEFAULT 0,
    status TEXT DEFAULT 'Present',
    source TEXT DEFAULT 'Manual'
  )`);

  d.exec(`CREATE TABLE IF NOT EXISTS hr_employee_custody (
    id INTEGER PRIMARY KEY AUTOINCREMENT,
    employee_id INTEGER,
    item_name TEXT DEFAULT '',
    handed_date TEXT DEFAULT '',
    returned_date TEXT DEFAULT '',
    status TEXT DEFAULT 'Active',
    notes TEXT DEFAULT ''
  )`);

  // Inventory tables
  d.exec(`CREATE TABLE IF NOT EXISTS inventory_items (
    id INTEGER PRIMARY KEY AUTOINCREMENT,
    item_name TEXT DEFAULT '',
    item_code TEXT DEFAULT '',
    barcode TEXT DEFAULT '',
    category TEXT DEFAULT '',
    unit TEXT DEFAULT '',
    cost_price REAL DEFAULT 0,
    stock_qty INTEGER DEFAULT 0,
    min_qty INTEGER DEFAULT 5,
    is_active INTEGER DEFAULT 1
  )`);

  d.exec(`CREATE TABLE IF NOT EXISTS inventory_opening_balances (
    id INTEGER PRIMARY KEY AUTOINCREMENT,
    item_id INTEGER,
    qty INTEGER DEFAULT 0,
    unit_cost REAL DEFAULT 0,
    balance_date TEXT DEFAULT '',
    notes TEXT DEFAULT ''
  )`);

  d.exec(`CREATE TABLE IF NOT EXISTS inventory_purchases (
    id INTEGER PRIMARY KEY AUTOINCREMENT,
    supplier_id INTEGER,
    purchase_date TEXT DEFAULT '',
    total_amount REAL DEFAULT 0,
    status TEXT DEFAULT 'Received',
    notes TEXT DEFAULT '',
    created_at DATETIME DEFAULT CURRENT_TIMESTAMP
  )`);

  d.exec(`CREATE TABLE IF NOT EXISTS inventory_purchase_items (
    id INTEGER PRIMARY KEY AUTOINCREMENT,
    purchase_id INTEGER,
    item_id INTEGER,
    qty INTEGER DEFAULT 0,
    unit_cost REAL DEFAULT 0,
    total_cost REAL DEFAULT 0
  )`);

  d.exec(`CREATE TABLE IF NOT EXISTS inventory_issue_to_dept (
    id INTEGER PRIMARY KEY AUTOINCREMENT,
    department TEXT DEFAULT '',
    issued_by TEXT DEFAULT '',
    issue_date TEXT DEFAULT '',
    status TEXT DEFAULT 'Issued',
    notes TEXT DEFAULT '',
    created_at DATETIME DEFAULT CURRENT_TIMESTAMP
  )`);

  d.exec(`CREATE TABLE IF NOT EXISTS inventory_issue_items (
    id INTEGER PRIMARY KEY AUTOINCREMENT,
    issue_id INTEGER,
    item_id INTEGER,
    qty INTEGER DEFAULT 0,
    notes TEXT DEFAULT ''
  )`);

  d.exec(`CREATE TABLE IF NOT EXISTS inventory_dept_requests (
    id INTEGER PRIMARY KEY AUTOINCREMENT,
    department TEXT DEFAULT '',
    requested_by TEXT DEFAULT '',
    request_date TEXT DEFAULT '',
    status TEXT DEFAULT 'Pending',
    approved_by TEXT DEFAULT '',
    notes TEXT DEFAULT ''
  )`);

  d.exec(`CREATE TABLE IF NOT EXISTS inventory_dept_request_items (
    id INTEGER PRIMARY KEY AUTOINCREMENT,
    request_id INTEGER,
    item_id INTEGER,
    qty_requested INTEGER DEFAULT 0,
    qty_approved INTEGER DEFAULT 0
  )`);

  d.exec(`CREATE TABLE IF NOT EXISTS inventory_stock_count (
    id INTEGER PRIMARY KEY AUTOINCREMENT,
    item_id INTEGER,
    counted_qty INTEGER DEFAULT 0,
    system_qty INTEGER DEFAULT 0,
    difference INTEGER DEFAULT 0,
    count_date TEXT DEFAULT '',
    counted_by TEXT DEFAULT ''
  )`);

  // Other tables
  d.exec(`CREATE TABLE IF NOT EXISTS form_templates (
    id INTEGER PRIMARY KEY AUTOINCREMENT,
    template_name TEXT DEFAULT '',
    department TEXT DEFAULT '',
    form_fields TEXT DEFAULT '',
    is_active INTEGER DEFAULT 1,
    created_by TEXT DEFAULT '',
    created_at DATETIME DEFAULT CURRENT_TIMESTAMP
  )`);

  d.exec(`CREATE TABLE IF NOT EXISTS internal_messages (
    id INTEGER PRIMARY KEY AUTOINCREMENT,
    sender_id INTEGER,
    receiver_id INTEGER,
    subject TEXT DEFAULT '',
    body TEXT DEFAULT '',
    is_read INTEGER DEFAULT 0,
    priority TEXT DEFAULT 'Normal',
    created_at DATETIME DEFAULT CURRENT_TIMESTAMP
  )`);

  d.exec(`CREATE TABLE IF NOT EXISTS packages (
    id INTEGER PRIMARY KEY AUTOINCREMENT,
    package_name_ar TEXT DEFAULT '',
    package_name_en TEXT DEFAULT '',
    department TEXT DEFAULT '',
    total_sessions INTEGER DEFAULT 1,
    price REAL DEFAULT 0,
    is_active INTEGER DEFAULT 1,
    created_at DATETIME DEFAULT CURRENT_TIMESTAMP
  )`);

  d.exec(`CREATE TABLE IF NOT EXISTS package_sessions (
    id INTEGER PRIMARY KEY AUTOINCREMENT,
    package_id INTEGER,
    patient_id INTEGER,
    session_number INTEGER DEFAULT 0,
    session_date TEXT DEFAULT '',
    status TEXT DEFAULT 'Pending',
    notes TEXT DEFAULT '',
    performed_by TEXT DEFAULT ''
  )`);

  d.exec(`CREATE TABLE IF NOT EXISTS discount_rules (
    id INTEGER PRIMARY KEY AUTOINCREMENT,
    rule_name TEXT DEFAULT '',
    discount_type TEXT DEFAULT 'Percentage',
    discount_value REAL DEFAULT 0,
    applies_to TEXT DEFAULT 'All',
    min_amount REAL DEFAULT 0,
    max_discount REAL DEFAULT 0,
    start_date TEXT DEFAULT '',
    end_date TEXT DEFAULT '',
    is_active INTEGER DEFAULT 1
  )`);

  d.exec(`CREATE TABLE IF NOT EXISTS online_bookings (
    id INTEGER PRIMARY KEY AUTOINCREMENT,
    patient_name TEXT DEFAULT '',
    phone TEXT DEFAULT '',
    email TEXT DEFAULT '',
    department TEXT DEFAULT '',
    doctor_name TEXT DEFAULT '',
    preferred_date TEXT DEFAULT '',
    preferred_time TEXT DEFAULT '',
    status TEXT DEFAULT 'Pending',
    source TEXT DEFAULT 'Online',
    notes TEXT DEFAULT '',
    created_at DATETIME DEFAULT CURRENT_TIMESTAMP
  )`);

  d.exec(`CREATE TABLE IF NOT EXISTS finance_vouchers (
    id INTEGER PRIMARY KEY AUTOINCREMENT,
    voucher_number TEXT DEFAULT '',
    voucher_type TEXT DEFAULT '',
    amount REAL DEFAULT 0,
    account_id INTEGER,
    description TEXT DEFAULT '',
    payment_method TEXT DEFAULT '',
    reference TEXT DEFAULT '',
    voucher_date TEXT DEFAULT '',
    created_by TEXT DEFAULT '',
    created_at DATETIME DEFAULT CURRENT_TIMESTAMP
  )`);

  d.exec(`CREATE TABLE IF NOT EXISTS lab_samples (
    id INTEGER PRIMARY KEY AUTOINCREMENT,
    order_id INTEGER,
    sample_type TEXT DEFAULT '',
    barcode TEXT DEFAULT '',
    collection_date TEXT DEFAULT '',
    collected_by TEXT DEFAULT '',
    status TEXT DEFAULT 'Collected',
    storage_location TEXT DEFAULT '',
    notes TEXT DEFAULT ''
  )`);

  d.exec(`CREATE TABLE IF NOT EXISTS user_permissions (
    id INTEGER PRIMARY KEY AUTOINCREMENT,
    user_id INTEGER,
    module_name TEXT DEFAULT '',
    can_view INTEGER DEFAULT 0,
    can_add INTEGER DEFAULT 0,
    can_edit INTEGER DEFAULT 0,
    can_delete INTEGER DEFAULT 0,
    can_print INTEGER DEFAULT 0
  )`);

  d.exec(`CREATE TABLE IF NOT EXISTS doctor_inventory_requests (
    id INTEGER PRIMARY KEY AUTOINCREMENT,
    doctor_id INTEGER,
    department TEXT DEFAULT '',
    request_date TEXT DEFAULT '',
    status TEXT DEFAULT 'Pending',
    approved_by TEXT DEFAULT '',
    notes TEXT DEFAULT '',
    created_at DATETIME DEFAULT CURRENT_TIMESTAMP
  )`);

  d.exec(`CREATE TABLE IF NOT EXISTS doctor_inventory_request_items (
    id INTEGER PRIMARY KEY AUTOINCREMENT,
    request_id INTEGER,
    item_id INTEGER,
    qty_requested INTEGER DEFAULT 0,
    qty_approved INTEGER DEFAULT 0,
    notes TEXT DEFAULT ''
  )`);

  d.exec(`CREATE TABLE IF NOT EXISTS queue_advertisements (
    id INTEGER PRIMARY KEY AUTOINCREMENT,
    title TEXT DEFAULT '',
    image_path TEXT DEFAULT '',
    display_order INTEGER DEFAULT 0,
    duration_seconds INTEGER DEFAULT 10,
    is_active INTEGER DEFAULT 1,
    created_at DATETIME DEFAULT CURRENT_TIMESTAMP
  )`);

  d.exec(`CREATE TABLE IF NOT EXISTS integration_settings (
    id INTEGER PRIMARY KEY AUTOINCREMENT,
    integration_name TEXT DEFAULT '',
    provider TEXT DEFAULT '',
    api_key TEXT DEFAULT '',
    api_secret TEXT DEFAULT '',
    endpoint_url TEXT DEFAULT '',
    is_enabled INTEGER DEFAULT 0,
    config_json TEXT DEFAULT '',
    last_sync TEXT DEFAULT ''
  )`);

  d.exec(`CREATE TABLE IF NOT EXISTS company_settings (
    setting_key TEXT PRIMARY KEY,
    setting_value TEXT DEFAULT ''
  )`);

  // Insert default company settings
  const defaults = ['company_name_ar', 'company_name_en', 'tax_number', 'address', 'phone', 'logo_path', 'sample_data_inserted', 'theme'];
  const insertSetting = d.prepare('INSERT OR IGNORE INTO company_settings (setting_key, setting_value) VALUES (?, ?)');
  for (const key of defaults) {
    insertSetting.run(key, '');
  }

  d.exec(`CREATE TABLE IF NOT EXISTS system_users (
    id INTEGER PRIMARY KEY AUTOINCREMENT,
    username TEXT DEFAULT '',
    password_hash TEXT DEFAULT '',
    display_name TEXT DEFAULT '',
    role TEXT DEFAULT 'Reception',
    is_active INTEGER DEFAULT 1,
    created_at DATETIME DEFAULT CURRENT_TIMESTAMP
  )`);

  // Insert default admin
  const userCount = d.prepare('SELECT COUNT(*) as cnt FROM system_users').get();
  if (userCount.cnt === 0) {
    d.prepare('INSERT INTO system_users (username, password_hash, display_name, role) VALUES (?, ?, ?, ?)')
      .run('admin', '$2b$12$G36aRwyn13/eICGIdRF4leQfi/g6xYROPVNvQ1cMrh95PDK9fbs0q', 'المدير العام', 'Admin');
  }

  try { d.exec(`ALTER TABLE patients ADD COLUMN dob TEXT DEFAULT ''`); } catch (e) { }
  try { d.exec(`ALTER TABLE patients ADD COLUMN dob_hijri TEXT DEFAULT ''`); } catch (e) { }
  try { d.exec(`ALTER TABLE patients ADD COLUMN age INTEGER DEFAULT 0`); } catch (e) { }
  try { d.exec(`ALTER TABLE company_settings ADD COLUMN cr_number TEXT DEFAULT ''`); } catch (e) { }
  try { d.exec(`ALTER TABLE system_users ADD COLUMN speciality TEXT DEFAULT ''`); } catch (e) { }
  try { d.exec(`ALTER TABLE system_users ADD COLUMN permissions TEXT DEFAULT ''`); } catch (e) { }

  d.exec(`CREATE TABLE IF NOT EXISTS nursing_vitals (
    id INTEGER PRIMARY KEY AUTOINCREMENT,
    patient_id INTEGER,
    patient_name TEXT DEFAULT '',
    bp TEXT DEFAULT '',
    temp REAL DEFAULT 0,
    weight REAL DEFAULT 0,
    pulse INTEGER DEFAULT 0,
    o2_sat INTEGER DEFAULT 0,
    notes TEXT DEFAULT '',
    created_at DATETIME DEFAULT CURRENT_TIMESTAMP
  )`);
}

function getDbRaw() {
  if (!db) {
    db = new Database(DB_PATH);
    db.pragma('journal_mode = WAL');
    db.pragma('foreign_keys = ON');
  }
  return db;
}

function insertSampleData() {
  const d = getDbRaw();

  // Check if already inserted
  const flag = d.prepare("SELECT setting_value FROM company_settings WHERE setting_key='sample_data_inserted'").get();
  if (flag && flag.setting_value === '1') return;

  const patCount = d.prepare('SELECT COUNT(*) as cnt FROM patients').get();
  if (patCount.cnt > 0) {
    d.prepare("UPDATE company_settings SET setting_value='1' WHERE setting_key='sample_data_inserted'").run();
    return;
  }

  // Patients
  d.prepare('INSERT INTO patients (file_number, name_ar, name_en, national_id, phone, status) VALUES (?,?,?,?,?,?)')
    .run(1001, 'أحمد محمد', 'Ahmed Mohammed', '1012345678', '0551234567', 'With Doctor');
  d.prepare('INSERT INTO patients (file_number, name_ar, name_en, national_id, phone, status) VALUES (?,?,?,?,?,?)')
    .run(1002, 'سارة عبدالرحمن', 'Sarah Abdulrahman', '1098765432', '0559876543', 'Waiting');
  d.prepare('INSERT INTO patients (file_number, name_ar, name_en, national_id, phone, status) VALUES (?,?,?,?,?,?)')
    .run(1003, 'فيصل العتيبي', 'Faisal Al-Otaibi', '1054321098', '0553456789', 'Waiting');

  // Employees
  d.prepare('INSERT INTO employees (name, name_ar, name_en, role, department_ar, department_en, status, salary) VALUES (?,?,?,?,?,?,?,?)')
    .run('Dr. Khaled Marwan', 'د. خالد مروان', 'Dr. Khaled Marwan', 'Doctor', 'القسم الطبي', 'Medical Dept.', 'Active', 25000);
  d.prepare('INSERT INTO employees (name, name_ar, name_en, role, department_ar, department_en, status, salary) VALUES (?,?,?,?,?,?,?,?)')
    .run('Sarah Al-Ahmad', 'سارة الأحمد', 'Sarah Al-Ahmad', 'Nurse', 'التمريض', 'Nursing', 'Active', 12000);
  d.prepare('INSERT INTO employees (name, name_ar, name_en, role, department_ar, department_en, status, salary) VALUES (?,?,?,?,?,?,?,?)')
    .run('Omar Saleh', 'عمر صالح', 'Omar Saleh', 'Admin', 'تقنية المعلومات', 'IT Dept.', 'On Leave', 9500);

  // Invoices
  d.prepare('INSERT INTO invoices (patient_name, total, paid) VALUES (?,?,?)').run('Ahmed Mohammed', 575.00, 1);
  d.prepare('INSERT INTO invoices (patient_name, total, paid) VALUES (?,?,?)').run('Yasser Khaled', 1240.00, 0);
  d.prepare('INSERT INTO invoices (patient_name, total, paid) VALUES (?,?,?)').run('Sarah Ali', 890.50, 1);

  // Insurance claims
  d.prepare('INSERT INTO insurance_claims (patient_name, insurance_company, claim_amount, status) VALUES (?,?,?,?)')
    .run('Ahmed Mohammed', 'Bupa Arabia', 2500.00, 'Approved');
  d.prepare('INSERT INTO insurance_claims (patient_name, insurance_company, claim_amount, status) VALUES (?,?,?,?)')
    .run('Yasser Khaled', 'Tawuniya', 4200.00, 'Pending');
  d.prepare('INSERT INTO insurance_claims (patient_name, insurance_company, claim_amount, status) VALUES (?,?,?,?)')
    .run('Sarah Ali', 'MedGulf', 1800.00, 'Rejected');

  d.prepare("UPDATE company_settings SET setting_value='1' WHERE setting_key='sample_data_inserted'").run();
}

function populateLabCatalog() {
  const d = getDbRaw();
  const labCount = d.prepare('SELECT COUNT(*) as cnt FROM lab_tests_catalog').get();
  if (labCount.cnt === 0) {

    const insert = d.prepare('INSERT INTO lab_tests_catalog (test_name, category, normal_range, price) VALUES (?,?,?,?)');

    const tests = [
      // HEMATOLOGY
      ['CBC - Complete Blood Count', 'Hematology', 'See components', 100],
      ['WBC - White Blood Cell Count', 'Hematology', '4.5-11.0 x10^9/L', 50],
      ['RBC - Red Blood Cell Count', 'Hematology', 'M:4.7-6.1 F:4.2-5.4 x10^12/L', 50],
      ['Hemoglobin (Hgb)', 'Hematology', 'M:13.5-17.5 F:12.0-16.0 g/dL', 50],
      ['Hematocrit (Hct)', 'Hematology', 'M:38.3-48.6% F:35.5-44.9%', 50],
      ['MCV - Mean Corpuscular Volume', 'Hematology', '80-100 fL', 40],
      ['MCH - Mean Corpuscular Hemoglobin', 'Hematology', '27-33 pg', 40],
      ['MCHC', 'Hematology', '31.5-35.7 g/dL', 40],
      ['RDW - Red Cell Distribution Width', 'Hematology', '11.5-14.5%', 40],
      ['Platelet Count', 'Hematology', '150-400 x10^9/L', 50],
      ['MPV - Mean Platelet Volume', 'Hematology', '7.5-11.5 fL', 40],
      ['ESR - Erythrocyte Sedimentation Rate', 'Hematology', 'M:0-15 F:0-20 mm/hr', 60],
      ['Reticulocyte Count', 'Hematology', '0.5-2.5%', 80],
      ['Peripheral Blood Smear', 'Hematology', 'Normal morphology', 120],
      ['Hemoglobin Electrophoresis', 'Hematology', 'HbA >95%', 200],
      ['G6PD', 'Hematology', '4.6-13.5 U/g Hb', 150],
      ['Sickle Cell Screen', 'Hematology', 'Negative', 100],
      ['Direct Coombs Test (DAT)', 'Hematology', 'Negative', 100],
      ['Indirect Coombs Test (IAT)', 'Hematology', 'Negative', 100],
      ['Haptoglobin', 'Hematology', '30-200 mg/dL', 120],
      ['CD4 Count (Flow Cytometry)', 'Hematology', '500-1500 cells/uL', 250],
      ['CD8 Count (Flow Cytometry)', 'Hematology', '150-1000 cells/uL', 250],
      // COAGULATION
      ['PT - Prothrombin Time', 'Coagulation', '11.0-13.5 seconds', 80],
      ['INR', 'Coagulation', '0.8-1.1', 80],
      ['aPTT', 'Coagulation', '25-35 seconds', 80],
      ['D-Dimer', 'Coagulation', '<0.50 mg/L FEU', 120],
      ['Fibrinogen', 'Coagulation', '200-400 mg/dL', 100],
      ['Thrombin Time', 'Coagulation', '14-19 seconds', 100],
      ['Bleeding Time', 'Coagulation', '2-7 minutes', 60],
      ['Factor V Leiden Mutation', 'Coagulation', 'Not detected', 300],
      ['Protein C Activity', 'Coagulation', '70-140%', 250],
      ['Protein S Activity', 'Coagulation', '60-140%', 250],
      ['Antithrombin III', 'Coagulation', '80-120%', 200],
      ['Lupus Anticoagulant', 'Coagulation', 'Negative', 200],
      ['von Willebrand Factor Antigen', 'Coagulation', '50-150%', 250],
      // CHEMISTRY
      ['Glucose, Fasting', 'Chemistry', '70-100 mg/dL', 50],
      ['Glucose, Random', 'Chemistry', '70-140 mg/dL', 50],
      ['Glucose, 2-Hour Postprandial', 'Chemistry', '<140 mg/dL', 60],
      ['Oral Glucose Tolerance Test (OGTT)', 'Chemistry', '<140 mg/dL at 2hr', 120],
      ['BUN - Blood Urea Nitrogen', 'Chemistry', '7-20 mg/dL', 50],
      ['Creatinine, Serum', 'Chemistry', 'M:0.7-1.3 F:0.6-1.1 mg/dL', 50],
      ['eGFR', 'Chemistry', '>60 mL/min/1.73m2', 50],
      ['Uric Acid', 'Chemistry', 'M:3.4-7.0 F:2.4-6.0 mg/dL', 60],
      ['Total Protein, Serum', 'Chemistry', '6.0-8.3 g/dL', 50],
      ['Albumin, Serum', 'Chemistry', '3.5-5.5 g/dL', 50],
      ['Globulin', 'Chemistry', '2.0-3.5 g/dL', 50],
      ['BMP - Basic Metabolic Panel', 'Chemistry', 'See components', 150],
      ['CMP - Comprehensive Metabolic Panel', 'Chemistry', 'See components', 200],
      ['Ammonia Level', 'Chemistry', '15-45 mcg/dL', 100],
      ['Lactate (Lactic Acid)', 'Chemistry', '0.5-2.2 mmol/L', 80],
      ['LDH - Lactate Dehydrogenase', 'Chemistry', '140-280 U/L', 70],
      ['CPK - Creatine Phosphokinase', 'Chemistry', 'M:39-308 F:26-192 U/L', 80],
      ['Amylase', 'Chemistry', '28-100 U/L', 80],
      ['Lipase', 'Chemistry', '0-160 U/L', 80],
      // LIVER FUNCTION
      ['ALT (SGPT)', 'Liver Function', '7-56 U/L', 60],
      ['AST (SGOT)', 'Liver Function', '10-40 U/L', 60],
      ['ALP - Alkaline Phosphatase', 'Liver Function', '44-147 U/L', 60],
      ['GGT', 'Liver Function', 'M:9-48 F:9-36 U/L', 60],
      ['Total Bilirubin', 'Liver Function', '0.1-1.2 mg/dL', 60],
      ['Direct Bilirubin', 'Liver Function', '0.0-0.3 mg/dL', 60],
      ['Indirect Bilirubin', 'Liver Function', '0.1-0.9 mg/dL', 50],
      ['LFT - Liver Function Panel', 'Liver Function', 'See components', 150],
      ['Alpha-Fetoprotein (Liver)', 'Liver Function', '<10 ng/mL', 150],
      // LIPID PANEL
      ['Total Cholesterol', 'Lipid Panel', '<200 mg/dL', 60],
      ['LDL Cholesterol', 'Lipid Panel', '<100 mg/dL optimal', 60],
      ['HDL Cholesterol', 'Lipid Panel', 'M:>40 F:>50 mg/dL', 60],
      ['Triglycerides', 'Lipid Panel', '<150 mg/dL', 60],
      ['VLDL Cholesterol', 'Lipid Panel', '5-40 mg/dL', 60],
      ['Lipid Panel (Complete)', 'Lipid Panel', 'See components', 120],
      ['Apolipoprotein B', 'Lipid Panel', '<90 mg/dL', 150],
      ['Lipoprotein(a)', 'Lipid Panel', '<30 mg/dL', 180],
      // ELECTROLYTES
      ['Sodium (Na)', 'Electrolytes', '136-145 mEq/L', 50],
      ['Potassium (K)', 'Electrolytes', '3.5-5.0 mEq/L', 50],
      ['Chloride (Cl)', 'Electrolytes', '98-106 mEq/L', 50],
      ['CO2 (Bicarbonate)', 'Electrolytes', '22-29 mEq/L', 50],
      ['Calcium, Total', 'Electrolytes', '8.6-10.2 mg/dL', 50],
      ['Calcium, Ionized', 'Electrolytes', '4.5-5.6 mg/dL', 80],
      ['Phosphorus', 'Electrolytes', '2.5-4.5 mg/dL', 50],
      ['Magnesium', 'Electrolytes', '1.7-2.2 mg/dL', 60],
      ['Zinc, Serum', 'Electrolytes', '60-120 mcg/dL', 100],
      ['Copper, Serum', 'Electrolytes', '70-140 mcg/dL', 100],
      // ENDOCRINOLOGY
      ['TSH', 'Endocrinology', '0.27-4.20 mIU/L', 100],
      ['Free T4', 'Endocrinology', '0.93-1.70 ng/dL', 100],
      ['Free T3', 'Endocrinology', '2.0-4.4 pg/mL', 100],
      ['Total T4', 'Endocrinology', '4.5-12.0 mcg/dL', 80],
      ['Total T3', 'Endocrinology', '80-200 ng/dL', 80],
      ['Anti-TPO', 'Endocrinology', '<35 IU/mL', 120],
      ['Anti-Thyroglobulin Antibody', 'Endocrinology', '<40 IU/mL', 120],
      ['HbA1c', 'Endocrinology', '4.0-5.6%', 100],
      ['Fasting Insulin', 'Endocrinology', '2.6-24.9 mIU/L', 120],
      ['C-Peptide', 'Endocrinology', '1.1-4.4 ng/mL', 150],
      ['Cortisol, Morning', 'Endocrinology', '6.2-19.4 mcg/dL', 120],
      ['ACTH', 'Endocrinology', '7.2-63.3 pg/mL', 180],
      ['Aldosterone', 'Endocrinology', '<21 ng/dL upright', 180],
      ['PTH - Parathyroid Hormone', 'Endocrinology', '15-65 pg/mL', 150],
      ['Growth Hormone', 'Endocrinology', 'M:<5 F:<10 ng/mL', 180],
      ['IGF-1', 'Endocrinology', 'Age-dependent', 180],
      ['Prolactin', 'Endocrinology', 'M:4-15 F:4-23 ng/mL', 120],
      ['DHEA-S', 'Endocrinology', 'Age/sex-dependent', 120],
      ['Metanephrines, Plasma', 'Endocrinology', '<0.90 nmol/L', 250],
      // IMMUNOLOGY
      ['CRP', 'Immunology', '<3.0 mg/L', 80],
      ['hs-CRP', 'Immunology', '<1.0 mg/L low risk', 100],
      ['RF - Rheumatoid Factor', 'Immunology', '<14 IU/mL', 80],
      ['Anti-CCP Antibodies', 'Immunology', '<20 U/mL', 150],
      ['ANA - Antinuclear Antibody', 'Immunology', 'Negative (<1:40)', 120],
      ['Anti-dsDNA', 'Immunology', '<30 IU/mL', 150],
      ['ENA Panel', 'Immunology', 'Negative', 250],
      ['Complement C3', 'Immunology', '90-180 mg/dL', 100],
      ['Complement C4', 'Immunology', '10-40 mg/dL', 100],
      ['IgG', 'Immunology', '700-1600 mg/dL', 100],
      ['IgA', 'Immunology', '70-400 mg/dL', 100],
      ['IgM', 'Immunology', '40-230 mg/dL', 100],
      ['IgE, Total', 'Immunology', '<100 IU/mL', 120],
      ['ANCA', 'Immunology', 'Negative', 200],
      ['ASO', 'Immunology', '<200 IU/mL', 80],
      ['SPEP', 'Immunology', 'See pattern', 200],
      // MICROBIOLOGY
      ['Blood Culture, Aerobic', 'Microbiology', 'No growth', 150],
      ['Blood Culture, Anaerobic', 'Microbiology', 'No growth', 150],
      ['Urine Culture & Sensitivity', 'Microbiology', '<10,000 CFU/mL', 120],
      ['Wound Culture & Sensitivity', 'Microbiology', 'See report', 120],
      ['Throat Culture', 'Microbiology', 'Normal flora', 100],
      ['Sputum Culture', 'Microbiology', 'See report', 120],
      ['Stool Culture', 'Microbiology', 'No pathogen', 120],
      ['CSF Culture', 'Microbiology', 'No growth', 150],
      ['Fungal Culture', 'Microbiology', 'No growth', 150],
      ['AFB Culture (TB)', 'Microbiology', 'No growth', 200],
      ['AFB Smear', 'Microbiology', 'Negative', 80],
      ['Gram Stain', 'Microbiology', 'See report', 60],
      ['H. pylori Antigen, Stool', 'Microbiology', 'Negative', 120],
      ['H. pylori Antibody', 'Microbiology', 'Negative', 100],
      ['H. pylori Breath Test', 'Microbiology', 'Negative', 150],
      ['C. difficile Toxin', 'Microbiology', 'Negative', 150],
      ['MRSA Screen', 'Microbiology', 'Not detected', 150],
      // URINALYSIS
      ['Urinalysis, Complete', 'Urinalysis', 'See components', 60],
      ['Urine Dipstick', 'Urinalysis', 'See components', 40],
      ['Urine Microscopy', 'Urinalysis', 'See report', 50],
      ['Urine Albumin/Creatinine Ratio', 'Urinalysis', '<30 mg/g', 100],
      ['24-Hour Urine Protein', 'Urinalysis', '<150 mg/24hr', 100],
      ['24-Hour Creatinine Clearance', 'Urinalysis', 'M:97-137 F:88-128 mL/min', 120],
      ['Urine Drug Screen', 'Urinalysis', 'Negative', 150],
      // TOXICOLOGY
      ['Urine Drug Screen Panel', 'Toxicology', 'Negative', 200],
      ['Acetaminophen Level', 'Toxicology', '10-30 mcg/mL', 100],
      ['Ethanol Level', 'Toxicology', '0 mg/dL', 80],
      ['Digoxin Level', 'Toxicology', '0.8-2.0 ng/mL', 120],
      ['Lithium Level', 'Toxicology', '0.6-1.2 mEq/L', 100],
      ['Vancomycin Trough', 'Toxicology', '15-20 mcg/mL', 150],
      ['Tacrolimus Level', 'Toxicology', '5-15 ng/mL', 200],
      ['Lead Level, Blood', 'Toxicology', '<5 mcg/dL', 150],
      // TUMOR MARKERS
      ['PSA', 'Tumor Markers', '<4.0 ng/mL', 120],
      ['AFP - Alpha-Fetoprotein', 'Tumor Markers', '<10 ng/mL', 150],
      ['CEA', 'Tumor Markers', '<3.0 ng/mL', 150],
      ['CA-125', 'Tumor Markers', '<35 U/mL', 150],
      ['CA 19-9', 'Tumor Markers', '<37 U/mL', 150],
      ['CA 15-3', 'Tumor Markers', '<30 U/mL', 150],
      ['Beta-hCG (Tumor Marker)', 'Tumor Markers', '<5 mIU/mL', 120],
      ['NSE', 'Tumor Markers', '<16.3 ng/mL', 180],
      ['Chromogranin A', 'Tumor Markers', '<93 ng/mL', 200],
      ['Calcitonin', 'Tumor Markers', 'M:<8.4 F:<5.0 pg/mL', 200],
      // BLOOD BANK
      ['Blood Group & Rh Type', 'Blood Bank', 'A/B/AB/O, Rh+/-', 50],
      ['Antibody Screen', 'Blood Bank', 'Negative', 80],
      ['Crossmatch', 'Blood Bank', 'Compatible', 100],
      ['Direct Antiglobulin Test', 'Blood Bank', 'Negative', 80],
      ['Cold Agglutinins', 'Blood Bank', '<1:64', 120],
      // VITAMINS
      ['Vitamin D, 25-Hydroxy', 'Vitamins', '30-100 ng/mL', 120],
      ['Vitamin B12', 'Vitamins', '200-900 pg/mL', 100],
      ['Folate, Serum', 'Vitamins', '>3.0 ng/mL', 80],
      ['Iron, Serum', 'Vitamins', 'M:60-170 F:40-150 mcg/dL', 60],
      ['TIBC', 'Vitamins', '250-400 mcg/dL', 60],
      ['Transferrin Saturation', 'Vitamins', '20-50%', 60],
      ['Ferritin', 'Vitamins', 'M:12-300 F:12-150 ng/mL', 80],
      ['Vitamin A', 'Vitamins', '30-65 mcg/dL', 150],
      ['Vitamin C', 'Vitamins', '0.2-2.0 mg/dL', 120],
      ['Vitamin E', 'Vitamins', '5.5-17.0 mg/L', 150],
      ['Vitamin B1 (Thiamine)', 'Vitamins', '70-180 nmol/L', 150],
      ['Vitamin B6', 'Vitamins', '5-50 mcg/L', 150],
      // CARDIAC MARKERS
      ['Troponin I', 'Cardiac Markers', '<0.04 ng/mL', 120],
      ['Troponin T, High Sensitivity', 'Cardiac Markers', '<14 ng/L', 150],
      ['BNP', 'Cardiac Markers', '<100 pg/mL', 150],
      ['NT-proBNP', 'Cardiac Markers', '<125 pg/mL', 180],
      ['CK-MB', 'Cardiac Markers', '<5.0 ng/mL', 100],
      ['Myoglobin', 'Cardiac Markers', '<90 ng/mL', 100],
      ['Homocysteine', 'Cardiac Markers', '5-15 umol/L', 120],
      // ALLERGY
      ['Total IgE', 'Allergy', '<100 IU/mL', 100],
      ['Specific IgE - Dust Mite', 'Allergy', '<0.35 kU/L', 120],
      ['Specific IgE - Cat Dander', 'Allergy', '<0.35 kU/L', 120],
      ['Specific IgE - Grass Pollen', 'Allergy', '<0.35 kU/L', 120],
      ['Specific IgE - Milk', 'Allergy', '<0.35 kU/L', 120],
      ['Specific IgE - Egg White', 'Allergy', '<0.35 kU/L', 120],
      ['Specific IgE - Peanut', 'Allergy', '<0.35 kU/L', 120],
      ['Specific IgE - Wheat', 'Allergy', '<0.35 kU/L', 120],
      ['Food Allergy Panel (Top 8)', 'Allergy', 'See components', 400],
      ['Inhalant Allergy Panel', 'Allergy', 'See components', 400],
      // STOOL ANALYSIS
      ['Stool Analysis, Complete', 'Stool Analysis', 'See components', 80],
      ['Stool Occult Blood (FOBT)', 'Stool Analysis', 'Negative', 50],
      ['FIT - Fecal Immunochemical', 'Stool Analysis', 'Negative', 80],
      ['Stool Ova & Parasites', 'Stool Analysis', 'No parasites', 80],
      ['Fecal Calprotectin', 'Stool Analysis', '<50 mcg/g', 200],
      ['Fecal Elastase', 'Stool Analysis', '>200 mcg/g', 180],
      // MOLECULAR
      ['COVID-19 PCR', 'Molecular', 'Not detected', 200],
      ['COVID-19 Rapid Antigen', 'Molecular', 'Negative', 100],
      ['Influenza A/B PCR', 'Molecular', 'Not detected', 200],
      ['RSV PCR', 'Molecular', 'Not detected', 200],
      ['Respiratory Pathogen Panel', 'Molecular', 'See components', 500],
      ['TB QuantiFERON (IGRA)', 'Molecular', 'Negative', 250],
      ['Hepatitis B PCR (HBV DNA)', 'Molecular', 'Not detected', 300],
      ['Hepatitis C PCR (HCV RNA)', 'Molecular', 'Not detected', 300],
      ['HIV-1 RNA Viral Load', 'Molecular', 'Not detected', 350],
      ['CMV PCR', 'Molecular', 'Not detected', 250],
      ['EBV PCR', 'Molecular', 'Not detected', 250],
      ['HPV DNA Test', 'Molecular', 'Not detected', 200],
      // BODY FLUIDS
      ['CSF Analysis', 'Body Fluids', 'See components', 200],
      ['CSF Protein', 'Body Fluids', '15-45 mg/dL', 80],
      ['CSF Glucose', 'Body Fluids', '40-70 mg/dL', 60],
      ['CSF Cell Count', 'Body Fluids', '0-5 WBC/uL', 80],
      ['Pleural Fluid Analysis', 'Body Fluids', 'See components', 200],
      ['Synovial Fluid Analysis', 'Body Fluids', 'See components', 200],
      ['Ascitic Fluid Analysis', 'Body Fluids', 'See components', 200],
      // REPRODUCTIVE HORMONES
      ['Estradiol (E2)', 'Reproductive Hormones', 'Phase-dependent', 120],
      ['Progesterone', 'Reproductive Hormones', 'Phase-dependent', 120],
      ['Testosterone, Total', 'Reproductive Hormones', 'M:264-916 ng/dL', 120],
      ['Testosterone, Free', 'Reproductive Hormones', 'M:8.7-25.1 pg/mL', 150],
      ['FSH', 'Reproductive Hormones', 'Phase/sex-dependent', 120],
      ['LH', 'Reproductive Hormones', 'Phase/sex-dependent', 120],
      ['AMH', 'Reproductive Hormones', 'Age-dependent', 200],
      ['Beta-hCG (Pregnancy)', 'Reproductive Hormones', '<5 mIU/mL non-pregnant', 100],
      ['SHBG', 'Reproductive Hormones', 'M:10-57 F:18-114 nmol/L', 150],
      // INFECTIOUS DISEASE
      ['HBsAg', 'Infectious Disease', 'Negative', 80],
      ['HBsAb', 'Infectious Disease', '>10 mIU/mL immune', 80],
      ['HBcAb', 'Infectious Disease', 'Negative', 80],
      ['HCV Ab', 'Infectious Disease', 'Negative', 80],
      ['HIV 1/2 Ag/Ab Combo', 'Infectious Disease', 'Non-reactive', 100],
      ['RPR/VDRL (Syphilis)', 'Infectious Disease', 'Non-reactive', 60],
      ['FTA-ABS', 'Infectious Disease', 'Non-reactive', 100],
      ['Rubella IgG', 'Infectious Disease', '>10 IU/mL immune', 80],
      ['Rubella IgM', 'Infectious Disease', 'Negative', 80],
      ['CMV IgG', 'Infectious Disease', 'See interpretation', 80],
      ['CMV IgM', 'Infectious Disease', 'Negative', 80],
      ['Toxoplasma IgG', 'Infectious Disease', 'See interpretation', 80],
      ['Toxoplasma IgM', 'Infectious Disease', 'Negative', 80],
      ['EBV Panel', 'Infectious Disease', 'See interpretation', 200],
      ['Brucella Agglutination', 'Infectious Disease', '<1:80', 80],
      ['Widal Test (Typhoid)', 'Infectious Disease', '<1:80', 60],
      ['Dengue NS1 Antigen', 'Infectious Disease', 'Negative', 120],
      ['Malaria Smear', 'Infectious Disease', 'No parasites seen', 80],
      ['Malaria Rapid Test', 'Infectious Disease', 'Negative', 80],
      ['Mono Spot Test', 'Infectious Disease', 'Negative', 60],
      ['Varicella-Zoster IgG', 'Infectious Disease', 'See interpretation', 80],
      ['Measles IgG', 'Infectious Disease', 'See interpretation', 80],
      // AUTOIMMUNE
      ['Anti-tTG IgA (Celiac)', 'Autoimmune', '<20 U/mL', 150],
      ['Anti-Endomysial Ab', 'Autoimmune', 'Negative', 200],
      ['Anti-GBM Antibodies', 'Autoimmune', '<20 U/mL', 200],
      ['Anti-Smooth Muscle Ab', 'Autoimmune', '<1:40', 150],
      ['Anti-Mitochondrial Ab', 'Autoimmune', 'Negative', 150],
      ['HLA-B27', 'Autoimmune', 'Negative/Positive', 200],
      ['Anti-Jo-1 Antibodies', 'Autoimmune', 'Negative', 150],
      ['Anti-Scl-70 Antibodies', 'Autoimmune', 'Negative', 150],
      // BLOOD GAS
      ['ABG - Arterial Blood Gas', 'Blood Gas', 'See components', 100],
      ['pH, Arterial', 'Blood Gas', '7.35-7.45', 50],
      ['pCO2, Arterial', 'Blood Gas', '35-45 mmHg', 50],
      ['pO2, Arterial', 'Blood Gas', '80-100 mmHg', 50],
      ['HCO3, Arterial', 'Blood Gas', '22-26 mEq/L', 50],
      ['O2 Saturation, Arterial', 'Blood Gas', '95-100%', 40],
      ['VBG - Venous Blood Gas', 'Blood Gas', 'See components', 80],
    ];

    const insertMany = d.transaction((items) => {
      for (const [name, cat, range, price] of items) {
        insert.run(name, cat, range, price);
      }
    });
    insertMany(tests);
  } // end lab catalog if

  const radCount = d.prepare('SELECT COUNT(*) as cnt FROM radiology_catalog').get();
  if (radCount.cnt === 0) {
    const insertRad = d.prepare('INSERT INTO radiology_catalog (modality, exact_name, default_template, price) VALUES (?,?,?,?)');
    const radTests = [
      // ===== X-RAY (Plain Radiography) =====
      ['X-Ray', 'X-Ray Chest (PA)', '', 100], ['X-Ray', 'X-Ray Chest (Lateral)', '', 100],
      ['X-Ray', 'X-Ray Abdomen (KUB)', '', 100], ['X-Ray', 'X-Ray Abdomen (Erect)', '', 100],
      ['X-Ray', 'X-Ray Cervical Spine (AP/Lat)', '', 120], ['X-Ray', 'X-Ray Thoracic Spine', '', 120],
      ['X-Ray', 'X-Ray Lumbar Spine (AP/Lat)', '', 120], ['X-Ray', 'X-Ray Lumbosacral Spine', '', 120],
      ['X-Ray', 'X-Ray Pelvis (AP)', '', 100], ['X-Ray', 'X-Ray Hip (AP/Lat)', '', 100],
      ['X-Ray', 'X-Ray Shoulder', '', 100], ['X-Ray', 'X-Ray Elbow', '', 100],
      ['X-Ray', 'X-Ray Wrist', '', 100], ['X-Ray', 'X-Ray Hand', '', 100],
      ['X-Ray', 'X-Ray Fingers', '', 80], ['X-Ray', 'X-Ray Knee (AP/Lat)', '', 100],
      ['X-Ray', 'X-Ray Ankle', '', 100], ['X-Ray', 'X-Ray Foot', '', 100],
      ['X-Ray', 'X-Ray Toes', '', 80], ['X-Ray', 'X-Ray Skull (AP/Lat)', '', 120],
      ['X-Ray', 'X-Ray Facial Bones', '', 120], ['X-Ray', 'X-Ray Nasal Bones', '', 100],
      ['X-Ray', 'X-Ray Sinuses (Waters View)', '', 100], ['X-Ray', 'X-Ray Mandible', '', 100],
      ['X-Ray', 'X-Ray Panoramic (OPG)', '', 150], ['X-Ray', 'X-Ray Clavicle', '', 100],
      ['X-Ray', 'X-Ray Ribs', '', 100], ['X-Ray', 'X-Ray Sacrum/Coccyx', '', 100],
      ['X-Ray', 'X-Ray Both Knees (Standing)', '', 150], ['X-Ray', 'X-Ray Scapula', '', 100],
      ['X-Ray', 'X-Ray Forearm', '', 100], ['X-Ray', 'X-Ray Humerus', '', 100],
      ['X-Ray', 'X-Ray Femur', '', 100], ['X-Ray', 'X-Ray Tibia/Fibula', '', 100],
      // ===== CT SCAN =====
      ['CT', 'CT Brain (Non-contrast)', '', 500], ['CT', 'CT Brain (With Contrast)', '', 700],
      ['CT', 'CT Brain (With & Without Contrast)', '', 800],
      ['CT', 'CT Orbits', '', 500], ['CT', 'CT Sinuses', '', 400],
      ['CT', 'CT Temporal Bones', '', 500], ['CT', 'CT Neck', '', 500],
      ['CT', 'CT Chest (Non-contrast)', '', 500], ['CT', 'CT Chest (With Contrast)', '', 700],
      ['CT', 'CT Chest High Resolution (HRCT)', '', 600],
      ['CT', 'CT Abdomen (Non-contrast)', '', 500], ['CT', 'CT Abdomen (With Contrast)', '', 700],
      ['CT', 'CT Pelvis', '', 500], ['CT', 'CT Abdomen & Pelvis (With Contrast)', '', 800],
      ['CT', 'CT KUB (Renal Stone Protocol)', '', 500],
      ['CT', 'CT Cervical Spine', '', 500], ['CT', 'CT Thoracic Spine', '', 500],
      ['CT', 'CT Lumbar Spine', '', 500],
      ['CT', 'CT Angiography - Brain (CTA)', '', 900], ['CT', 'CT Angiography - Neck', '', 900],
      ['CT', 'CT Angiography - Chest (PE Protocol)', '', 900],
      ['CT', 'CT Angiography - Abdominal Aorta', '', 900],
      ['CT', 'CT Angiography - Lower Limbs', '', 900],
      ['CT', 'CT Angiography - Coronary (CCTA)', '', 1200],
      ['CT', 'CT Angiography - Renal', '', 900],
      ['CT', 'CT Enterography', '', 800], ['CT', 'CT Colonography (Virtual Colonoscopy)', '', 800],
      ['CT', 'CT Urography', '', 700], ['CT', 'CT Guided Biopsy', '', 1000],
      ['CT', 'CT 3D Reconstruction', '', 400],
      // ===== MRI =====
      ['MRI', 'MRI Brain (Non-contrast)', '', 800], ['MRI', 'MRI Brain (With Contrast)', '', 1000],
      ['MRI', 'MRI Brain & MRA (Angiography)', '', 1200],
      ['MRI', 'MRI Orbits', '', 800], ['MRI', 'MRI Internal Auditory Canal (IAC)', '', 800],
      ['MRI', 'MRI Pituitary', '', 800], ['MRI', 'MRI Temporomandibular Joint (TMJ)', '', 800],
      ['MRI', 'MRI Neck', '', 800], ['MRI', 'MRI Cervical Spine', '', 800],
      ['MRI', 'MRI Thoracic Spine', '', 800], ['MRI', 'MRI Lumbar Spine', '', 800],
      ['MRI', 'MRI Whole Spine', '', 1500], ['MRI', 'MRI Sacroiliac Joints', '', 800],
      ['MRI', 'MRI Shoulder', '', 800], ['MRI', 'MRI Elbow', '', 800],
      ['MRI', 'MRI Wrist', '', 800], ['MRI', 'MRI Hand', '', 800],
      ['MRI', 'MRI Hip', '', 800], ['MRI', 'MRI Knee', '', 800],
      ['MRI', 'MRI Ankle', '', 800], ['MRI', 'MRI Foot', '', 800],
      ['MRI', 'MRI Abdomen', '', 900], ['MRI', 'MRI Pelvis', '', 900],
      ['MRI', 'MRI Liver (Hepatocyte-specific)', '', 1000],
      ['MRI', 'MRI MRCP (Biliary)', '', 1000], ['MRI', 'MRI Prostate (Multiparametric)', '', 1200],
      ['MRI', 'MRI Breast (Bilateral)', '', 1200], ['MRI', 'MRI Cardiac (CMR)', '', 1500],
      ['MRI', 'MRI Enterography', '', 1000], ['MRI', 'MRI Fetal', '', 1000],
      ['MRI', 'MRI Brachial Plexus', '', 800],
      ['MRI', 'MRA - Head (Intracranial)', '', 1000], ['MRI', 'MRA - Neck (Carotid)', '', 1000],
      ['MRI', 'MRA - Abdominal', '', 1000], ['MRI', 'MRA - Lower Limbs', '', 1000],
      ['MRI', 'MRV - Brain (Venography)', '', 1000],
      // ===== ULTRASOUND =====
      ['Ultrasound', 'US Abdomen (Complete)', '', 200], ['Ultrasound', 'US Abdomen (Limited)', '', 150],
      ['Ultrasound', 'US Pelvis (Transabdominal)', '', 200], ['Ultrasound', 'US Pelvis (Transvaginal)', '', 250],
      ['Ultrasound', 'US Thyroid', '', 200], ['Ultrasound', 'US Breast (Bilateral)', '', 250],
      ['Ultrasound', 'US Breast (Unilateral)', '', 200],
      ['Ultrasound', 'US Obstetric (1st Trimester)', '', 200],
      ['Ultrasound', 'US Obstetric (2nd/3rd Trimester)', '', 250],
      ['Ultrasound', 'US Obstetric (Growth Scan)', '', 300],
      ['Ultrasound', 'US Obstetric (Anomaly Scan - Level II)', '', 400],
      ['Ultrasound', 'US Renal', '', 200], ['Ultrasound', 'US Bladder (Pre/Post Void)', '', 200],
      ['Ultrasound', 'US Scrotal', '', 200], ['Ultrasound', 'US Soft Tissue', '', 150],
      ['Ultrasound', 'US Musculoskeletal', '', 200], ['Ultrasound', 'US Joint', '', 200],
      ['Ultrasound', 'US Neonatal Brain (Cranial)', '', 250], ['Ultrasound', 'US Hip (Infant)', '', 200],
      ['Ultrasound', 'US Guided Biopsy', '', 500], ['Ultrasound', 'US Guided Aspiration', '', 400],
      ['Ultrasound', 'Doppler - Carotid', '', 300], ['Ultrasound', 'Doppler - Lower Limb Arterial', '', 300],
      ['Ultrasound', 'Doppler - Lower Limb Venous (DVT)', '', 300], ['Ultrasound', 'Doppler - Upper Limb', '', 300],
      ['Ultrasound', 'Doppler - Renal', '', 300], ['Ultrasound', 'Doppler - Portal Vein/Hepatic', '', 300],
      ['Ultrasound', 'Doppler - Testicular', '', 250], ['Ultrasound', 'Doppler - Fetal', '', 300],
      ['Ultrasound', 'US Elastography (Liver)', '', 350],
      // ===== MAMMOGRAPHY =====
      ['Mammography', 'Mammography (Screening - Bilateral)', '', 400],
      ['Mammography', 'Mammography (Diagnostic)', '', 450],
      ['Mammography', 'Tomosynthesis (3D Mammography)', '', 500],
      ['Mammography', 'Mammography with Spot Compression', '', 450],
      ['Mammography', 'Stereotactic Breast Biopsy', '', 1000],
      // ===== DEXA =====
      ['DEXA', 'DEXA Bone Densitometry (Spine & Hip)', '', 350],
      ['DEXA', 'DEXA Forearm', '', 250], ['DEXA', 'DEXA Whole Body Composition', '', 400],
      // ===== ECHOCARDIOGRAPHY =====
      ['Echo', 'Echocardiography (TTE - Transthoracic)', '', 400],
      ['Echo', 'Echocardiography (TEE - Transesophageal)', '', 800],
      ['Echo', 'Stress Echocardiography', '', 600], ['Echo', 'Fetal Echocardiography', '', 500],
      // ===== FLUOROSCOPY =====
      ['Fluoroscopy', 'Barium Swallow', '', 300], ['Fluoroscopy', 'Barium Meal', '', 350],
      ['Fluoroscopy', 'Barium Enema', '', 400], ['Fluoroscopy', 'Small Bowel Follow Through', '', 350],
      ['Fluoroscopy', 'Voiding Cystourethrogram (VCUG)', '', 350],
      ['Fluoroscopy', 'Hysterosalpingography (HSG)', '', 500],
      ['Fluoroscopy', 'IVP/IVU (Intravenous Pyelogram)', '', 400],
      ['Fluoroscopy', 'Fistulography', '', 400], ['Fluoroscopy', 'Arthrography', '', 500],
      // ===== NUCLEAR MEDICINE =====
      ['Nuclear Medicine', 'Bone Scan (Whole Body)', '', 600],
      ['Nuclear Medicine', 'Thyroid Scan & Uptake', '', 500],
      ['Nuclear Medicine', 'Renal Scan (DTPA/MAG3)', '', 500],
      ['Nuclear Medicine', 'DMSA Renal Scan', '', 500],
      ['Nuclear Medicine', 'Cardiac Perfusion Scan (SPECT)', '', 1000],
      ['Nuclear Medicine', 'Lung Perfusion/Ventilation Scan (V/Q)', '', 600],
      ['Nuclear Medicine', 'Hepatobiliary Scan (HIDA)', '', 600],
      ['Nuclear Medicine', 'GI Bleeding Scan', '', 600],
      ['Nuclear Medicine', 'Gastric Emptying Study', '', 500],
      ['Nuclear Medicine', 'Parathyroid Scan (Sestamibi)', '', 600],
      ['Nuclear Medicine', 'Sentinel Lymph Node Scan', '', 600],
      ['Nuclear Medicine', 'Gallium Scan', '', 700],
      // ===== PET/CT =====
      ['PET/CT', 'PET/CT (FDG - Whole Body)', '', 3000],
      ['PET/CT', 'PET/CT (Brain)', '', 2500], ['PET/CT', 'PET/CT (Cardiac)', '', 2500],
      // ===== INTERVENTIONAL RADIOLOGY =====
      ['Interventional', 'Angiography (Diagnostic)', '', 2000],
      ['Interventional', 'Angioplasty', '', 5000],
      ['Interventional', 'Image-Guided Drainage', '', 1500],
      ['Interventional', 'Embolization', '', 5000],
      ['Interventional', 'Port-a-Cath Insertion', '', 3000],
      ['Interventional', 'PICC Line Insertion', '', 1500],
      ['Interventional', 'Nephrostomy', '', 2000],
      ['Interventional', 'Biliary Drainage (PTBD)', '', 3000],
      ['Interventional', 'Vertebroplasty', '', 5000],
      ['Interventional', 'Radiofrequency Ablation (RFA)', '', 5000],
      ['Interventional', 'TIPS Procedure', '', 8000],
      ['Interventional', 'Uterine Fibroid Embolization', '', 6000],
    ];
    const insertRadMany = d.transaction((items) => {
      for (const [mod, name, tmpl, price] of items) {
        insertRad.run(mod, name, tmpl, price);
      }
    });
    insertRadMany(radTests);
  }

  // Populate medical services
  d.exec(`CREATE TABLE IF NOT EXISTS medical_services (
    id INTEGER PRIMARY KEY AUTOINCREMENT,
    name_en TEXT DEFAULT '',
    name_ar TEXT DEFAULT '',
    specialty TEXT DEFAULT '',
    category TEXT DEFAULT '',
    price REAL DEFAULT 0,
    is_active INTEGER DEFAULT 1
  )`);

  const svcCount = d.prepare('SELECT COUNT(*) as cnt FROM medical_services').get();
  if (svcCount.cnt === 0) {
    const insertSvc = d.prepare('INSERT INTO medical_services (name_en, name_ar, specialty, category, price) VALUES (?,?,?,?,?)');
    const services = [
      // ===== GENERAL PRACTICE / FAMILY MEDICINE =====
      ['General Consultation', 'استشارة عامة', 'General Practice', 'Consultation', 150],
      ['Follow-up Visit', 'زيارة متابعة', 'General Practice', 'Consultation', 100],
      ['Comprehensive Checkup', 'فحص شامل', 'General Practice', 'Consultation', 300],
      ['Pre-employment Medical', 'فحص ما قبل التوظيف', 'General Practice', 'Consultation', 250],
      ['Wound Dressing', 'تغيير ضماد', 'General Practice', 'Procedure', 80],
      ['Wound Suturing', 'خياطة جرح', 'General Practice', 'Procedure', 200],
      ['Abscess Drainage', 'تصريف خراج', 'General Practice', 'Procedure', 300],
      ['Foreign Body Removal', 'إزالة جسم غريب', 'General Practice', 'Procedure', 250],
      ['Cauterization', 'كي', 'General Practice', 'Procedure', 200],
      ['IV Fluid Administration', 'إعطاء محاليل وريدية', 'General Practice', 'Procedure', 150],
      ['IM/SC Injection', 'حقن عضلي / تحت الجلد', 'General Practice', 'Procedure', 50],
      ['Nebulization', 'جلسة تبخير', 'General Practice', 'Procedure', 80],
      ['ECG', 'تخطيط قلب', 'General Practice', 'Diagnostic', 100],
      ['Blood Pressure Monitoring', 'متابعة ضغط الدم', 'General Practice', 'Diagnostic', 50],
      ['Blood Sugar Test (POCT)', 'فحص سكر سريع', 'General Practice', 'Diagnostic', 30],
      ['Medical Report', 'تقرير طبي', 'General Practice', 'Service', 100],
      ['Sick Leave Certificate', 'إجازة مرضية', 'General Practice', 'Service', 50],
      ['Fitness Certificate', 'شهادة لياقة', 'General Practice', 'Service', 100],
      ['Vaccination - Adult', 'تطعيم بالغين', 'General Practice', 'Procedure', 150],
      ['Allergy Test (Skin Prick)', 'فحص حساسية جلدي', 'General Practice', 'Diagnostic', 200],

      // ===== DENTISTRY =====
      ['Dental Consultation', 'استشارة أسنان', 'Dentistry', 'Consultation', 150],
      ['Dental Follow-up', 'متابعة أسنان', 'Dentistry', 'Consultation', 80],
      ['Dental X-Ray (Periapical)', 'أشعة سن', 'Dentistry', 'Diagnostic', 80],
      ['Panoramic X-Ray (OPG)', 'أشعة بانوراما', 'Dentistry', 'Diagnostic', 150],
      ['Dental Cleaning (Scaling)', 'تنظيف أسنان', 'Dentistry', 'Procedure', 200],
      ['Dental Polishing', 'تلميع أسنان', 'Dentistry', 'Procedure', 100],
      ['Simple Tooth Extraction', 'خلع سن بسيط', 'Dentistry', 'Procedure', 200],
      ['Surgical Tooth Extraction', 'خلع سن جراحي', 'Dentistry', 'Procedure', 500],
      ['Wisdom Tooth Extraction', 'خلع ضرس عقل', 'Dentistry', 'Procedure', 600],
      ['Composite Filling (1 surface)', 'حشوة ضوئية سطح واحد', 'Dentistry', 'Procedure', 200],
      ['Composite Filling (2 surfaces)', 'حشوة ضوئية سطحين', 'Dentistry', 'Procedure', 300],
      ['Composite Filling (3 surfaces)', 'حشوة ضوئية ثلاث أسطح', 'Dentistry', 'Procedure', 400],
      ['Amalgam Filling', 'حشوة أملغم', 'Dentistry', 'Procedure', 150],
      ['Temporary Filling', 'حشوة مؤقتة', 'Dentistry', 'Procedure', 100],
      ['Root Canal - Anterior', 'علاج عصب أمامي', 'Dentistry', 'Procedure', 800],
      ['Root Canal - Premolar', 'علاج عصب ضاحك', 'Dentistry', 'Procedure', 1000],
      ['Root Canal - Molar', 'علاج عصب ضرس', 'Dentistry', 'Procedure', 1200],
      ['Root Canal Re-treatment', 'إعادة علاج عصب', 'Dentistry', 'Procedure', 1500],
      ['Post & Core', 'دعامة ولب', 'Dentistry', 'Procedure', 500],
      ['PFM Crown', 'تاج خزف معدني', 'Dentistry', 'Procedure', 800],
      ['Zirconia Crown', 'تاج زركونيا', 'Dentistry', 'Procedure', 1200],
      ['E-Max Crown', 'تاج إيماكس', 'Dentistry', 'Procedure', 1400],
      ['Temporary Crown', 'تاج مؤقت', 'Dentistry', 'Procedure', 200],
      ['Dental Bridge (per unit)', 'جسر أسنان (للوحدة)', 'Dentistry', 'Procedure', 800],
      ['Porcelain Veneer', 'قشرة خزفية', 'Dentistry', 'Procedure', 1500],
      ['Composite Veneer', 'قشرة ضوئية', 'Dentistry', 'Procedure', 600],
      ['Complete Denture (Upper)', 'طقم أسنان كامل علوي', 'Dentistry', 'Procedure', 2000],
      ['Complete Denture (Lower)', 'طقم أسنان كامل سفلي', 'Dentistry', 'Procedure', 2000],
      ['Partial Denture (Acrylic)', 'طقم جزئي أكريليك', 'Dentistry', 'Procedure', 1200],
      ['Partial Denture (Metal Frame)', 'طقم جزئي معدني', 'Dentistry', 'Procedure', 2500],
      ['Dental Implant (Single)', 'زراعة سن واحد', 'Dentistry', 'Procedure', 4000],
      ['Implant Abutment', 'دعامة زرعة', 'Dentistry', 'Procedure', 1500],
      ['Implant Crown', 'تاج على زرعة', 'Dentistry', 'Procedure', 1500],
      ['Gingivectomy', 'قص لثة', 'Dentistry', 'Procedure', 400],
      ['Gum Treatment (Curettage)', 'علاج لثة (كحت)', 'Dentistry', 'Procedure', 300],
      ['Frenectomy', 'قطع لجام', 'Dentistry', 'Procedure', 400],
      ['Teeth Whitening (Office)', 'تبييض أسنان عيادي', 'Dentistry', 'Procedure', 1000],
      ['Teeth Whitening (Home Kit)', 'تبييض أسنان منزلي', 'Dentistry', 'Procedure', 500],
      ['Fluoride Application', 'تطبيق فلورايد', 'Dentistry', 'Procedure', 100],
      ['Sealant (per tooth)', 'مانع تسوس (للسن)', 'Dentistry', 'Procedure', 100],
      ['Orthodontic Consultation', 'استشارة تقويم', 'Dentistry', 'Consultation', 200],
      ['Metal Braces (Full)', 'تقويم معدني كامل', 'Dentistry', 'Procedure', 8000],
      ['Ceramic Braces (Full)', 'تقويم خزفي كامل', 'Dentistry', 'Procedure', 10000],
      ['Clear Aligners (Invisalign)', 'تقويم شفاف', 'Dentistry', 'Procedure', 15000],
      ['Retainer', 'مثبت تقويم', 'Dentistry', 'Procedure', 500],
      ['Space Maintainer', 'حافظ مسافة', 'Dentistry', 'Procedure', 400],
      ['Pulpotomy (Pediatric)', 'بتر لب (أطفال)', 'Dentistry', 'Procedure', 300],
      ['Stainless Steel Crown (Pediatric)', 'تاج معدني أطفال', 'Dentistry', 'Procedure', 400],
      ['Night Guard', 'واقي ليلي', 'Dentistry', 'Procedure', 600],
      ['Sport Guard', 'واقي رياضي', 'Dentistry', 'Procedure', 400],
      ['TMJ Treatment', 'علاج مفصل الفك', 'Dentistry', 'Procedure', 500],
      ['Incision & Drainage (Dental)', 'شق وتصريف سني', 'Dentistry', 'Procedure', 300],

      // ===== INTERNAL MEDICINE =====
      ['Internal Medicine Consultation', 'استشارة باطنية', 'Internal Medicine', 'Consultation', 200],
      ['Follow-up Visit', 'زيارة متابعة باطنية', 'Internal Medicine', 'Consultation', 150],
      ['Diabetes Management', 'إدارة السكري', 'Internal Medicine', 'Consultation', 200],
      ['Hypertension Management', 'إدارة ضغط الدم', 'Internal Medicine', 'Consultation', 200],
      ['Thyroid Assessment', 'تقييم الغدة الدرقية', 'Internal Medicine', 'Consultation', 200],
      ['Liver Disease Management', 'إدارة أمراض الكبد', 'Internal Medicine', 'Consultation', 250],
      ['Kidney Disease Management', 'إدارة أمراض الكلى', 'Internal Medicine', 'Consultation', 250],
      ['Rheumatology Consultation', 'استشارة روماتيزم', 'Internal Medicine', 'Consultation', 250],
      ['Holter Monitor Setup', 'تركيب هولتر', 'Internal Medicine', 'Diagnostic', 300],
      ['Spirometry', 'فحص وظائف الرئة', 'Internal Medicine', 'Diagnostic', 200],
      ['Pleural Tap (Thoracentesis)', 'بزل صدري', 'Internal Medicine', 'Procedure', 500],
      ['Ascitic Tap (Paracentesis)', 'بزل بطني', 'Internal Medicine', 'Procedure', 500],
      ['Joint Aspiration', 'بزل مفصل', 'Internal Medicine', 'Procedure', 400],
      ['Bone Marrow Biopsy', 'خزعة نخاع عظم', 'Internal Medicine', 'Procedure', 800],

      // ===== CARDIOLOGY =====
      ['Cardiology Consultation', 'استشارة قلب', 'Cardiology', 'Consultation', 300],
      ['Cardiology Follow-up', 'متابعة قلب', 'Cardiology', 'Consultation', 200],
      ['ECG (12-Lead)', 'تخطيط قلب كهربائي', 'Cardiology', 'Diagnostic', 100],
      ['Echocardiography', 'إيكو قلب', 'Cardiology', 'Diagnostic', 500],
      ['Stress ECG (Treadmill)', 'تخطيط قلب بالمجهود', 'Cardiology', 'Diagnostic', 400],
      ['Holter Monitor (24h)', 'هولتر 24 ساعة', 'Cardiology', 'Diagnostic', 400],
      ['Ambulatory BP Monitor (24h)', 'مراقبة ضغط متنقل', 'Cardiology', 'Diagnostic', 300],
      ['Cardiac Catheterization', 'قسطرة قلبية', 'Cardiology', 'Procedure', 5000],
      ['Pacemaker Check', 'فحص منظم ضربات', 'Cardiology', 'Diagnostic', 300],

      // ===== DERMATOLOGY =====
      ['Dermatology Consultation', 'استشارة جلدية', 'Dermatology', 'Consultation', 200],
      ['Dermatology Follow-up', 'متابعة جلدية', 'Dermatology', 'Consultation', 150],
      ['Skin Biopsy', 'خزعة جلد', 'Dermatology', 'Procedure', 400],
      ['Cryotherapy', 'علاج بالتبريد', 'Dermatology', 'Procedure', 300],
      ['Electrocautery', 'كي كهربائي', 'Dermatology', 'Procedure', 300],
      ['Mole Removal', 'إزالة شامة', 'Dermatology', 'Procedure', 500],
      ['Wart Removal', 'إزالة ثؤلول', 'Dermatology', 'Procedure', 300],
      ['Skin Tag Removal', 'إزالة زوائد جلدية', 'Dermatology', 'Procedure', 200],
      ['Acne Treatment', 'علاج حب الشباب', 'Dermatology', 'Procedure', 300],
      ['Chemical Peeling', 'تقشير كيميائي', 'Dermatology', 'Procedure', 500],
      ['Laser Treatment', 'علاج بالليزر', 'Dermatology', 'Procedure', 800],
      ['Laser Hair Removal (Session)', 'إزالة شعر بالليزر', 'Dermatology', 'Procedure', 500],
      ['PRP Injection (Skin/Hair)', 'حقن بلازما', 'Dermatology', 'Procedure', 800],
      ['Botox Injection', 'حقن بوتوكس', 'Dermatology', 'Procedure', 1200],
      ['Filler Injection', 'حقن فيلر', 'Dermatology', 'Procedure', 1500],
      ['Mesotherapy', 'ميزوثيرابي', 'Dermatology', 'Procedure', 600],
      ['Vitiligo Treatment', 'علاج بهاق', 'Dermatology', 'Procedure', 400],
      ['Psoriasis Treatment', 'علاج صدفية', 'Dermatology', 'Procedure', 400],
      ['Eczema Treatment', 'علاج إكزيما', 'Dermatology', 'Procedure', 300],
      ['Fungal Infection Treatment', 'علاج فطريات', 'Dermatology', 'Procedure', 200],
      ['Patch Test (Allergy)', 'فحص رقعة حساسية', 'Dermatology', 'Diagnostic', 300],
      ['Wood Lamp Examination', 'فحص مصباح وود', 'Dermatology', 'Diagnostic', 100],
      ['Dermoscopy', 'فحص ديرموسكوبي', 'Dermatology', 'Diagnostic', 150],

      // ===== OPHTHALMOLOGY =====
      ['Ophthalmology Consultation', 'استشارة عيون', 'Ophthalmology', 'Consultation', 200],
      ['Ophthalmology Follow-up', 'متابعة عيون', 'Ophthalmology', 'Consultation', 150],
      ['Comprehensive Eye Exam', 'فحص عيون شامل', 'Ophthalmology', 'Diagnostic', 300],
      ['Refraction Test', 'فحص نظر', 'Ophthalmology', 'Diagnostic', 100],
      ['Tonometry (IOP)', 'قياس ضغط العين', 'Ophthalmology', 'Diagnostic', 100],
      ['Visual Field Test', 'فحص مجال الرؤية', 'Ophthalmology', 'Diagnostic', 200],
      ['Fundoscopy', 'فحص قاع العين', 'Ophthalmology', 'Diagnostic', 150],
      ['OCT Scan', 'تصوير مقطعي للعين', 'Ophthalmology', 'Diagnostic', 300],
      ['Fluorescein Angiography', 'تصوير أوعية العين', 'Ophthalmology', 'Diagnostic', 400],
      ['Slit Lamp Examination', 'فحص المصباح الشقي', 'Ophthalmology', 'Diagnostic', 100],
      ['Contact Lens Fitting', 'تركيب عدسات لاصقة', 'Ophthalmology', 'Service', 200],
      ['Foreign Body Removal (Eye)', 'إزالة جسم غريب من العين', 'Ophthalmology', 'Procedure', 200],
      ['Chalazion Excision', 'استئصال كالزيون', 'Ophthalmology', 'Procedure', 500],
      ['Pterygium Surgery', 'جراحة ظفرة', 'Ophthalmology', 'Procedure', 2000],
      ['Cataract Surgery (Phaco)', 'عملية ساد (فاكو)', 'Ophthalmology', 'Procedure', 5000],
      ['LASIK Consultation', 'استشارة ليزك', 'Ophthalmology', 'Consultation', 300],
      ['LASIK Surgery', 'عملية ليزك', 'Ophthalmology', 'Procedure', 8000],
      ['Intravitreal Injection', 'حقن داخل العين', 'Ophthalmology', 'Procedure', 2000],
      ['Glaucoma Screening', 'فحص الجلوكوما', 'Ophthalmology', 'Diagnostic', 200],
      ['Diabetic Eye Screening', 'فحص عيون لمرضى السكري', 'Ophthalmology', 'Diagnostic', 250],
      ['Lacrimal Duct Probing', 'تسليك قناة دمعية', 'Ophthalmology', 'Procedure', 800],
      ['Eyelid Surgery', 'جراحة جفن', 'Ophthalmology', 'Procedure', 3000],

      // ===== ENT (EAR, NOSE & THROAT) =====
      ['ENT Consultation', 'استشارة أنف وأذن وحنجرة', 'ENT', 'Consultation', 200],
      ['ENT Follow-up', 'متابعة أنف وأذن', 'ENT', 'Consultation', 150],
      ['Audiometry', 'فحص سمع', 'ENT', 'Diagnostic', 200],
      ['Tympanometry', 'قياس طبلة الأذن', 'ENT', 'Diagnostic', 150],
      ['Nasal Endoscopy', 'منظار أنف', 'ENT', 'Diagnostic', 300],
      ['Laryngoscopy', 'منظار حنجرة', 'ENT', 'Diagnostic', 400],
      ['Ear Wax Removal (Irrigation)', 'تنظيف شمع الأذن', 'ENT', 'Procedure', 150],
      ['Ear Wax Removal (Micro-suction)', 'إزالة شمع بالشفط', 'ENT', 'Procedure', 200],
      ['Foreign Body Removal (Ear)', 'إزالة جسم غريب من الأذن', 'ENT', 'Procedure', 200],
      ['Foreign Body Removal (Nose)', 'إزالة جسم غريب من الأنف', 'ENT', 'Procedure', 200],
      ['Nasal Cauterization', 'كي أنفي', 'ENT', 'Procedure', 250],
      ['Anterior Nasal Packing', 'حشو أنفي أمامي', 'ENT', 'Procedure', 200],
      ['Tonsillectomy', 'استئصال اللوزتين', 'ENT', 'Procedure', 3000],
      ['Adenoidectomy', 'استئصال اللحمية', 'ENT', 'Procedure', 2500],
      ['Septoplasty', 'تعديل الحاجز الأنفي', 'ENT', 'Procedure', 5000],
      ['Turbinate Reduction', 'تصغير القرنيات', 'ENT', 'Procedure', 3000],
      ['Myringotomy with Tube', 'أنبوب طبلة', 'ENT', 'Procedure', 2000],
      ['Tympanoplasty', 'ترقيع طبلة', 'ENT', 'Procedure', 5000],
      ['Hearing Aid Fitting', 'تركيب سماعة', 'ENT', 'Service', 500],
      ['Speech Therapy Session', 'جلسة علاج نطق', 'ENT', 'Therapy', 200],
      ['Vertigo Assessment', 'تقييم الدوار', 'ENT', 'Diagnostic', 250],
      ['Sleep Study Referral', 'إحالة دراسة نوم', 'ENT', 'Service', 200],

      // ===== ORTHOPEDICS =====
      ['Orthopedics Consultation', 'استشارة عظام', 'Orthopedics', 'Consultation', 200],
      ['Orthopedics Follow-up', 'متابعة عظام', 'Orthopedics', 'Consultation', 150],
      ['Cast Application', 'تجبير', 'Orthopedics', 'Procedure', 300],
      ['Cast Removal', 'إزالة جبس', 'Orthopedics', 'Procedure', 100],
      ['Splint Application', 'تجبير مؤقت', 'Orthopedics', 'Procedure', 200],
      ['Fracture Reduction (Closed)', 'رد كسر مغلق', 'Orthopedics', 'Procedure', 800],
      ['Joint Injection', 'حقن مفصل', 'Orthopedics', 'Procedure', 400],
      ['Trigger Point Injection', 'حقن نقطة الزناد', 'Orthopedics', 'Procedure', 300],
      ['PRP Injection (Joint)', 'حقن بلازما للمفاصل', 'Orthopedics', 'Procedure', 1000],
      ['Knee Aspiration', 'بزل ركبة', 'Orthopedics', 'Procedure', 400],
      ['Carpal Tunnel Release', 'تحرير نفق الرسغ', 'Orthopedics', 'Procedure', 3000],
      ['Trigger Finger Release', 'تحرير إصبع زنادي', 'Orthopedics', 'Procedure', 2000],
      ['ACL Reconstruction', 'إعادة بناء رباط صليبي', 'Orthopedics', 'Procedure', 15000],
      ['Meniscus Surgery', 'جراحة غضروف', 'Orthopedics', 'Procedure', 8000],
      ['Hip Replacement', 'استبدال مفصل ورك', 'Orthopedics', 'Procedure', 30000],
      ['Knee Replacement', 'استبدال مفصل ركبة', 'Orthopedics', 'Procedure', 25000],
      ['Arthroscopy', 'منظار مفصل', 'Orthopedics', 'Procedure', 5000],
      ['Physical Therapy Session', 'جلسة علاج طبيعي', 'Orthopedics', 'Therapy', 200],
      ['TENS Therapy', 'علاج كهربائي', 'Orthopedics', 'Therapy', 150],
      ['Ultrasound Therapy', 'علاج بالموجات', 'Orthopedics', 'Therapy', 150],
      ['Spinal Injection', 'حقن العمود الفقري', 'Orthopedics', 'Procedure', 1500],
      ['Bone Density Test (Referral)', 'إحالة فحص كثافة عظم', 'Orthopedics', 'Service', 100],

      // ===== OB/GYN (OBSTETRICS & GYNECOLOGY) =====
      ['OB/GYN Consultation', 'استشارة نساء وولادة', 'Obstetrics', 'Consultation', 200],
      ['OB/GYN Follow-up', 'متابعة نساء', 'Obstetrics', 'Consultation', 150],
      ['Prenatal Visit', 'زيارة حمل', 'Obstetrics', 'Consultation', 200],
      ['Postpartum Visit', 'زيارة ما بعد الولادة', 'Obstetrics', 'Consultation', 200],
      ['Pap Smear', 'مسحة عنق الرحم', 'Obstetrics', 'Diagnostic', 150],
      ['Obstetric Ultrasound', 'سونار حمل', 'Obstetrics', 'Diagnostic', 250],
      ['Fetal Heart Monitoring (NST)', 'مراقبة نبض الجنين', 'Obstetrics', 'Diagnostic', 200],
      ['Colposcopy', 'منظار عنق الرحم', 'Obstetrics', 'Diagnostic', 400],
      ['IUD Insertion', 'تركيب لولب', 'Obstetrics', 'Procedure', 500],
      ['IUD Removal', 'إزالة لولب', 'Obstetrics', 'Procedure', 300],
      ['Contraceptive Implant', 'غرسة منع حمل', 'Obstetrics', 'Procedure', 800],
      ['Hormonal Injection (Contraceptive)', 'حقنة منع حمل', 'Obstetrics', 'Procedure', 150],
      ['Cervical Biopsy', 'خزعة عنق الرحم', 'Obstetrics', 'Procedure', 500],
      ['Endometrial Biopsy', 'خزعة بطانة الرحم', 'Obstetrics', 'Procedure', 600],
      ['Hysteroscopy', 'منظار رحمي', 'Obstetrics', 'Procedure', 3000],
      ['D&C (Dilation & Curettage)', 'كحت رحم', 'Obstetrics', 'Procedure', 2000],
      ['Cesarean Section', 'عملية قيصرية', 'Obstetrics', 'Procedure', 8000],
      ['Normal Delivery', 'ولادة طبيعية', 'Obstetrics', 'Procedure', 5000],
      ['Episiotomy Repair', 'خياطة شق عجاني', 'Obstetrics', 'Procedure', 500],
      ['Breast Examination', 'فحص ثدي', 'Obstetrics', 'Diagnostic', 150],
      ['Fertility Consultation', 'استشارة خصوبة', 'Obstetrics', 'Consultation', 300],
      ['Ovulation Induction', 'تحفيز تبويض', 'Obstetrics', 'Procedure', 500],
      ['Polycystic Ovary Treatment', 'علاج تكيس المبايض', 'Obstetrics', 'Consultation', 250],

      // ===== PEDIATRICS =====
      ['Pediatric Consultation', 'استشارة أطفال', 'Pediatrics', 'Consultation', 150],
      ['Pediatric Follow-up', 'متابعة أطفال', 'Pediatrics', 'Consultation', 100],
      ['Well-Baby Visit', 'زيارة طفل سليم', 'Pediatrics', 'Consultation', 150],
      ['Newborn Examination', 'فحص حديث ولادة', 'Pediatrics', 'Consultation', 200],
      ['Vaccination (Standard)', 'تطعيم أساسي', 'Pediatrics', 'Procedure', 100],
      ['Vaccination (Optional)', 'تطعيم اختياري', 'Pediatrics', 'Procedure', 150],
      ['Growth Assessment', 'تقييم نمو', 'Pediatrics', 'Diagnostic', 100],
      ['Developmental Screening', 'فحص تطور', 'Pediatrics', 'Diagnostic', 150],
      ['Pediatric Nebulization', 'تبخير أطفال', 'Pediatrics', 'Procedure', 80],
      ['Pediatric IV Fluid', 'محاليل وريدية أطفال', 'Pediatrics', 'Procedure', 150],
      ['Circumcision', 'ختان', 'Pediatrics', 'Procedure', 1000],
      ['Tongue Tie Release', 'قطع لجام اللسان', 'Pediatrics', 'Procedure', 500],
      ['Allergy Testing (Pediatric)', 'فحص حساسية أطفال', 'Pediatrics', 'Diagnostic', 300],
      ['Hearing Screening (Newborn)', 'فحص سمع حديثي الولادة', 'Pediatrics', 'Diagnostic', 200],
      ['Jaundice Screening', 'فحص يرقان', 'Pediatrics', 'Diagnostic', 100],

      // ===== NEUROLOGY =====
      ['Neurology Consultation', 'استشارة أعصاب', 'Neurology', 'Consultation', 300],
      ['Neurology Follow-up', 'متابعة أعصاب', 'Neurology', 'Consultation', 200],
      ['EEG (Electroencephalogram)', 'تخطيط دماغ', 'Neurology', 'Diagnostic', 400],
      ['EMG / NCS', 'تخطيط عضلات وأعصاب', 'Neurology', 'Diagnostic', 500],
      ['Lumbar Puncture', 'بزل قطني', 'Neurology', 'Procedure', 800],
      ['Botox for Migraine', 'بوتوكس للصداع النصفي', 'Neurology', 'Procedure', 1500],
      ['Nerve Block', 'حصار عصبي', 'Neurology', 'Procedure', 600],
      ['Epilepsy Management', 'إدارة الصرع', 'Neurology', 'Consultation', 250],
      ['Stroke Assessment', 'تقييم سكتة دماغية', 'Neurology', 'Diagnostic', 400],
      ['Memory Assessment', 'تقييم ذاكرة', 'Neurology', 'Diagnostic', 300],
      ['Headache Clinic', 'عيادة صداع', 'Neurology', 'Consultation', 250],

      // ===== PSYCHIATRY =====
      ['Psychiatry Consultation', 'استشارة نفسية', 'Psychiatry', 'Consultation', 300],
      ['Psychiatry Follow-up', 'متابعة نفسية', 'Psychiatry', 'Consultation', 200],
      ['Psychological Assessment', 'تقييم نفسي', 'Psychiatry', 'Diagnostic', 500],
      ['Cognitive Behavioral Therapy', 'علاج سلوكي معرفي', 'Psychiatry', 'Therapy', 300],
      ['Psychotherapy Session', 'جلسة علاج نفسي', 'Psychiatry', 'Therapy', 300],
      ['Couple/Family Therapy', 'علاج أسري', 'Psychiatry', 'Therapy', 400],
      ['ADHD Assessment', 'تقييم فرط الحركة', 'Psychiatry', 'Diagnostic', 400],
      ['Addiction Counseling', 'استشارة إدمان', 'Psychiatry', 'Therapy', 300],
      ['Psychiatric Report', 'تقرير نفسي', 'Psychiatry', 'Service', 200],

      // ===== UROLOGY =====
      ['Urology Consultation', 'استشارة مسالك بولية', 'Urology', 'Consultation', 200],
      ['Urology Follow-up', 'متابعة مسالك', 'Urology', 'Consultation', 150],
      ['Cystoscopy', 'منظار مثانة', 'Urology', 'Diagnostic', 1500],
      ['Urodynamic Study', 'دراسة ديناميكية بولية', 'Urology', 'Diagnostic', 800],
      ['Prostate Exam (DRE)', 'فحص بروستاتا', 'Urology', 'Diagnostic', 150],
      ['Urethral Dilation', 'توسيع إحليل', 'Urology', 'Procedure', 500],
      ['Catheter Insertion/Removal', 'تركيب/إزالة قسطرة', 'Urology', 'Procedure', 200],
      ['Circumcision (Adult)', 'ختان بالغين', 'Urology', 'Procedure', 1500],
      ['Vasectomy', 'ربط قنوات منوية', 'Urology', 'Procedure', 3000],
      ['ESWL (Kidney Stone)', 'تفتيت حصوات', 'Urology', 'Procedure', 3000],
      ['Kidney Stone Management', 'إدارة حصوات الكلى', 'Urology', 'Consultation', 250],

      // ===== ENDOCRINOLOGY =====
      ['Endocrinology Consultation', 'استشارة غدد صماء', 'Endocrinology', 'Consultation', 250],
      ['Endocrinology Follow-up', 'متابعة غدد', 'Endocrinology', 'Consultation', 200],
      ['Diabetes Education', 'تثقيف سكري', 'Endocrinology', 'Service', 150],
      ['Insulin Pump Assessment', 'تقييم مضخة أنسولين', 'Endocrinology', 'Diagnostic', 400],
      ['Thyroid Nodule FNA', 'خزعة عقدة درقية', 'Endocrinology', 'Procedure', 800],
      ['Continuous Glucose Monitor', 'جهاز سكر مستمر', 'Endocrinology', 'Service', 500],
      ['Growth Hormone Assessment', 'تقييم هرمون نمو', 'Endocrinology', 'Diagnostic', 300],
      ['Osteoporosis Management', 'إدارة هشاشة العظام', 'Endocrinology', 'Consultation', 200],
      ['Adrenal Assessment', 'تقييم غدة كظرية', 'Endocrinology', 'Diagnostic', 300],
      ['Pituitary Assessment', 'تقييم غدة نخامية', 'Endocrinology', 'Diagnostic', 300],

      // ===== GASTROENTEROLOGY =====
      ['GI Consultation', 'استشارة جهاز هضمي', 'Gastroenterology', 'Consultation', 250],
      ['GI Follow-up', 'متابعة جهاز هضمي', 'Gastroenterology', 'Consultation', 180],
      ['Upper GI Endoscopy (OGD)', 'منظار معدة علوي', 'Gastroenterology', 'Procedure', 2000],
      ['Colonoscopy', 'منظار قولون', 'Gastroenterology', 'Procedure', 2500],
      ['Liver Biopsy', 'خزعة كبد', 'Gastroenterology', 'Procedure', 1500],
      ['H. Pylori Breath Test', 'فحص نفس جرثومة المعدة', 'Gastroenterology', 'Diagnostic', 200],
      ['FibroScan', 'فايبروسكان كبد', 'Gastroenterology', 'Diagnostic', 500],
      ['Hemorrhoid Treatment', 'علاج بواسير', 'Gastroenterology', 'Procedure', 1000],
      ['Polypectomy', 'استئصال سليلة', 'Gastroenterology', 'Procedure', 1500],
      ['PEG Tube Insertion', 'تركيب أنبوب تغذية', 'Gastroenterology', 'Procedure', 3000],
      ['IBS Management', 'إدارة القولون العصبي', 'Gastroenterology', 'Consultation', 200],
      ['Celiac Disease Screening', 'فحص حساسية القمح', 'Gastroenterology', 'Diagnostic', 250],

      // ===== PULMONOLOGY =====
      ['Pulmonology Consultation', 'استشارة صدرية', 'Pulmonology', 'Consultation', 250],
      ['Pulmonology Follow-up', 'متابعة صدرية', 'Pulmonology', 'Consultation', 180],
      ['Spirometry (PFT)', 'فحص وظائف رئة', 'Pulmonology', 'Diagnostic', 200],
      ['Bronchoscopy', 'منظار قصبي', 'Pulmonology', 'Procedure', 2500],
      ['Chest Tube Insertion', 'تركيب أنبوب صدري', 'Pulmonology', 'Procedure', 1500],
      ['Pleural Biopsy', 'خزعة جنبية', 'Pulmonology', 'Procedure', 1000],
      ['Asthma Management', 'إدارة ربو', 'Pulmonology', 'Consultation', 200],
      ['COPD Management', 'إدارة انسداد رئوي', 'Pulmonology', 'Consultation', 200],
      ['Sleep Study Interpretation', 'تفسير دراسة نوم', 'Pulmonology', 'Diagnostic', 400],
      ['Oxygen Therapy Assessment', 'تقييم علاج أكسجين', 'Pulmonology', 'Diagnostic', 200],

      // ===== NEPHROLOGY =====
      ['Nephrology Consultation', 'استشارة كلى', 'Nephrology', 'Consultation', 250],
      ['Nephrology Follow-up', 'متابعة كلى', 'Nephrology', 'Consultation', 180],
      ['Dialysis Access Assessment', 'تقييم وصول غسيل', 'Nephrology', 'Diagnostic', 300],
      ['Kidney Biopsy', 'خزعة كلى', 'Nephrology', 'Procedure', 2000],
      ['Dialysis Session', 'جلسة غسيل كلى', 'Nephrology', 'Procedure', 1000],
      ['Peritoneal Dialysis Setup', 'إعداد غسيل بريتوني', 'Nephrology', 'Procedure', 1500],
      ['Electrolyte Management', 'إدارة الأملاح', 'Nephrology', 'Consultation', 200],

      // ===== GENERAL SURGERY =====
      ['Surgery Consultation', 'استشارة جراحة', 'Surgery', 'Consultation', 200],
      ['Surgery Follow-up', 'متابعة جراحة', 'Surgery', 'Consultation', 150],
      ['Minor Surgery', 'جراحة صغرى', 'Surgery', 'Procedure', 1000],
      ['Lipoma Excision', 'استئصال ورم دهني', 'Surgery', 'Procedure', 1500],
      ['Sebaceous Cyst Excision', 'استئصال كيس دهني', 'Surgery', 'Procedure', 1000],
      ['Hernia Repair', 'إصلاح فتق', 'Surgery', 'Procedure', 5000],
      ['Appendectomy', 'استئصال زائدة', 'Surgery', 'Procedure', 5000],
      ['Cholecystectomy (Lap)', 'استئصال مرارة بالمنظار', 'Surgery', 'Procedure', 8000],
      ['Hemorrhoidectomy', 'استئصال بواسير', 'Surgery', 'Procedure', 3000],
      ['Anal Fissure Surgery', 'جراحة شرخ شرجي', 'Surgery', 'Procedure', 2000],
      ['Pilonidal Sinus Surgery', 'جراحة كيس شعري', 'Surgery', 'Procedure', 3000],
      ['Breast Lump Excision', 'استئصال كتلة ثدي', 'Surgery', 'Procedure', 3000],
      ['Thyroidectomy', 'استئصال غدة درقية', 'Surgery', 'Procedure', 8000],
      ['Wound Debridement', 'تنظيف جرح جراحي', 'Surgery', 'Procedure', 500],
      ['Drain Insertion/Removal', 'تركيب/إزالة درنقة', 'Surgery', 'Procedure', 300],
      ['Skin Graft', 'ترقيع جلد', 'Surgery', 'Procedure', 4000],
      ['Varicose Vein Surgery', 'جراحة دوالي', 'Surgery', 'Procedure', 5000],

      // ===== ONCOLOGY =====
      ['Oncology Consultation', 'استشارة أورام', 'Oncology', 'Consultation', 400],
      ['Oncology Follow-up', 'متابعة أورام', 'Oncology', 'Consultation', 300],
      ['Chemotherapy Session', 'جلسة كيماوي', 'Oncology', 'Procedure', 3000],
      ['Tumor Marker Review', 'مراجعة دلالات أورام', 'Oncology', 'Diagnostic', 200],
      ['Port-a-Cath Care', 'رعاية منفذ وريدي', 'Oncology', 'Procedure', 300],
      ['Bone Marrow Aspirate', 'شفط نخاع عظم', 'Oncology', 'Procedure', 1000],
      ['Cancer Screening Package', 'حزمة فحص سرطان', 'Oncology', 'Diagnostic', 500],

      // ===== PHYSICAL THERAPY =====
      ['Physiotherapy Assessment', 'تقييم علاج طبيعي', 'Physiotherapy', 'Consultation', 200],
      ['Physiotherapy Session', 'جلسة علاج طبيعي', 'Physiotherapy', 'Therapy', 200],
      ['Manual Therapy', 'علاج يدوي', 'Physiotherapy', 'Therapy', 200],
      ['Hydrotherapy', 'علاج مائي', 'Physiotherapy', 'Therapy', 250],
      ['Post-Surgical Rehab', 'تأهيل بعد جراحة', 'Physiotherapy', 'Therapy', 250],
      ['Sports Injury Rehab', 'تأهيل إصابات رياضية', 'Physiotherapy', 'Therapy', 250],
      ['Back Pain Program', 'برنامج آلام الظهر', 'Physiotherapy', 'Therapy', 200],
      ['Neck Pain Program', 'برنامج آلام الرقبة', 'Physiotherapy', 'Therapy', 200],
      ['Stroke Rehabilitation', 'تأهيل سكتة دماغية', 'Physiotherapy', 'Therapy', 300],

      // ===== NUTRITION / DIETETICS =====
      ['Nutrition Consultation', 'استشارة تغذية', 'Nutrition', 'Consultation', 200],
      ['Nutrition Follow-up', 'متابعة تغذية', 'Nutrition', 'Consultation', 150],
      ['Weight Management Program', 'برنامج إدارة وزن', 'Nutrition', 'Service', 300],
      ['Diabetes Diet Program', 'برنامج غذائي للسكري', 'Nutrition', 'Service', 250],
      ['Sports Nutrition Plan', 'تغذية رياضية', 'Nutrition', 'Service', 250],
      ['Body Composition Analysis', 'تحليل تركيب الجسم', 'Nutrition', 'Diagnostic', 100],

      // ===== EMERGENCY MEDICINE =====
      ['Emergency Consultation', 'استشارة طوارئ', 'Emergency', 'Consultation', 300],
      ['Resuscitation', 'إنعاش', 'Emergency', 'Procedure', 1000],
      ['Fracture Splinting', 'تجبير كسور طوارئ', 'Emergency', 'Procedure', 300],
      ['Laceration Repair', 'خياطة جرح طوارئ', 'Emergency', 'Procedure', 300],
      ['Burn Dressing', 'ضماد حروق', 'Emergency', 'Procedure', 200],
      ['Poisoning Management', 'إدارة تسمم', 'Emergency', 'Procedure', 500],
      ['Snake/Insect Bite Treatment', 'علاج لدغات', 'Emergency', 'Procedure', 300],
    ];
    const insertSvcMany = d.transaction((items) => {
      for (const [en, ar, spec, cat, price] of items) {
        insertSvc.run(en, ar, spec, cat, price);
      }
    });
    insertSvcMany(services);
  }

  // ===== PHARMACY DRUG CATALOG =====
  const drugCount = d.prepare('SELECT COUNT(*) as cnt FROM pharmacy_drug_catalog').get();
  if (drugCount.cnt === 0) {
    const insertDrug = d.prepare('INSERT INTO pharmacy_drug_catalog (drug_name, category, selling_price, stock_qty) VALUES (?,?,?,?)');
    const drugs = [
      // Analgesics & NSAIDs
      ['Panadol 500mg (Paracetamol)', 'Analgesic', 8, 200],
      ['Fevadol 500mg (Paracetamol)', 'Analgesic', 6, 200],
      ['Brufen 400mg (Ibuprofen)', 'NSAID', 14, 150],
      ['Brufen 600mg (Ibuprofen)', 'NSAID', 20, 100],
      ['Profenal 400mg (Ibuprofen)', 'NSAID', 15, 120],
      ['Voltaren 50mg (Diclofenac)', 'NSAID', 19, 130],
      ['Voltaren Emulgel 1% 100gm', 'NSAID', 26, 80],
      ['Cataflam 50mg (Diclofenac Potassium)', 'NSAID', 18, 100],
      ['Catafast 50mg Sachet 9pcs', 'NSAID', 18, 90],
      ['Rapidus 50mg (Diclofenac Potassium)', 'NSAID', 29, 80],
      ['Ponstan-Forte 500mg (Mefenamic Acid)', 'NSAID', 15, 90],
      ['Aspirin Protect 100mg', 'Blood Thinner', 10, 200],
      ['Jusprin 81mg (Aspirin)', 'Blood Thinner', 8, 250],
      ['Roxonin 60mg', 'NSAID', 30, 60],
      ['Advil Liquid Caps 200mg', 'NSAID', 27, 70],
      // Panadol Variants
      ['Panadol Extra Tablet 24pcs', 'Pain Relief', 8, 150],
      ['Panadol Night 20 Caplets', 'Pain Relief', 12, 100],
      ['Panadol Advance 24 Tablets', 'Pain Relief', 6, 200],
      ['Panadol Actifast 20 Tablets', 'Pain Relief', 9, 120],
      ['Panadol Extend 24 Tablets', 'Pain Relief', 16, 100],
      ['Panadol Cold & Flu Night 24 Caplets', 'Cough & Cold', 12, 100],
      ['Panadol Cold & Flu Sinus 24 Caplets', 'Cough & Cold', 14, 100],
      ['Panadol Cold & Flu All In One 24s', 'Cough & Cold', 27, 80],
      // Other Pain Relief
      ['Solpadeine Soluble Tablet 20pcs', 'Pain Relief', 13, 80],
      ['Solpadeine Capsule 20pcs', 'Pain Relief', 13, 80],
      ['Adol Paracetamol 500mg 24 Caplets', 'Pain Relief', 5, 200],
      ['Adol-Extra Caplet 24pcs', 'Pain Relief', 6, 150],
      ['Fevadol-Extra Tablet 20pcs', 'Pain Relief', 6, 150],
      ['Fevadol-Plus Tablet 20pcs', 'Pain Relief', 10, 120],
      ['Salonpas Patches Small 20pcs', 'Pain Relief', 13, 100],
      ['Salonpas Patches Large 2pcs', 'Pain Relief', 11, 100],
      ['Relaxon Capsule 30pcs', 'Pain Relief', 28, 60],
      ['Reparil 20mg Tablet 40pcs', 'Pain Relief', 21, 70],
      // PPI / Antacids
      ['Nexium 40mg (Esomeprazole)', 'PPI / Antacid', 65, 80],
      ['Pariet 20mg (Rabeprazole)', 'PPI / Antacid', 55, 70],
      ['Gaviscon Advance (Sodium Alginate)', 'Antacid', 22, 100],
      ['Ezora 40mg Esomeprazole 28 Caps', 'PPI / Antacid', 66, 60],
      // Antibiotics
      ['Augmentin 1g (Amoxicillin/Clavulanate)', 'Antibiotic', 45, 100],
      ['Klavox 1g (Amoxicillin/Clavulanate)', 'Antibiotic', 40, 100],
      ['Amoxil 500mg (Amoxicillin)', 'Antibiotic', 15, 200],
      ['Suprax 400mg (Cefixime)', 'Antibiotic', 55, 80],
      ['Zinnat 500mg (Cefuroxime)', 'Antibiotic', 50, 80],
      ['Zithromax 500mg (Azithromycin)', 'Antibiotic', 35, 100],
      ['Ciprofloxacin 500mg', 'Antibiotic', 20, 120],
      ['Tavanic 500mg (Levofloxacin)', 'Antibiotic', 65, 60],
      ['Flagyl 500mg (Metronidazole)', 'Antiprotozoal', 12, 150],
      // Cholesterol
      ['Lipitor 20mg (Atorvastatin)', 'Cholesterol', 45, 80],
      ['Crestor 10mg (Rosuvastatin)', 'Cholesterol', 55, 80],
      // Diabetes
      ['Glucophage 500mg (Metformin)', 'Diabetes', 15, 200],
      ['Diamicron MR 60mg (Gliclazide)', 'Diabetes', 35, 100],
      ['Januvia 100mg (Sitagliptin)', 'Diabetes', 95, 60],
      ['Amaryl 2mg (Glimepiride)', 'Diabetes', 25, 100],
      // Blood Pressure
      ['Concor 5mg (Bisoprolol)', 'Blood Pressure', 30, 100],
      ['Diovan 160mg (Valsartan)', 'Blood Pressure', 55, 80],
      ['Exforge 5/160mg (Amlodipine/Valsartan)', 'Blood Pressure', 65, 60],
      ['Micardis 80mg (Telmisartan)', 'Blood Pressure', 55, 80],
      ['Amlor 5mg (Amlodipine)', 'Blood Pressure', 20, 120],
      ['Lasix 40mg (Furosemide)', 'Diuretic', 8, 200],
      // Antihistamines
      ['Zyrtec 10mg (Cetirizine)', 'Antihistamine', 15, 150],
      ['Clarinex 5mg (Desloratadine)', 'Antihistamine', 20, 120],
      ['Aerius 5mg (Desloratadine)', 'Antihistamine', 25, 100],
      ['Telfast 120mg (Fexofenadine)', 'Antihistamine', 22, 120],
      // Asthma / Respiratory
      ['Singulair 10mg (Montelukast)', 'Asthma', 40, 80],
      ['Symbicort 160/4.5 (Budesonide/Formoterol)', 'Asthma Inhaler', 95, 50],
      ['Ventolin Evohaler 100mcg (Salbutamol)', 'Asthma Inhaler', 18, 150],
      // Thyroid
      ['Eltroxin 50mcg (Thyroxine)', 'Thyroid', 12, 200],
      // Corticosteroids
      ['Cortiment 9mg (Budesonide)', 'Corticosteroid', 60, 50],
      ['Predo 5mg (Prednisolone)', 'Corticosteroid', 10, 150],
      // Cold & Flu
      ['Rinza (Paracetamol/Pseudoephedrine)', 'Cold & Flu', 15, 100],
      ['Fludrex Tablet 24pcs', 'Cold & Flu', 12, 120],
      ['Prof Cold & Flu Caplet 20pcs', 'Cold & Flu', 12, 100],
      ['Flutab Tablet 30pcs', 'Cold & Flu', 15, 100],
      ['Flutab-Sinus Tablet 20pcs', 'Cold & Flu', 9, 100],
      // Digestive Care
      ['Beatswell Probiotic 60 Capsules', 'Digestive Care', 29, 50],
      ['Bio Gaia Protectis Baby Drops 5ml', 'Digestive Care', 64, 40],
      // Vitamins & Supplements
      ['Beatswell Multivitamins for Adults 60 Gummies', 'Vitamins & Supplements', 49, 60],
      ['Beatswell Kids Multivitamins 60 Gummies', 'Vitamins & Supplements', 37, 70],
      ['Sanotact Multivitamin 20 Effervescent', 'Vitamins & Supplements', 25, 80],
      // Suppositories
      ['Voltaren 100mg Suppository 5pcs', 'NSAID', 18, 60],
      ['Voltaren 50mg Suppository 10pcs', 'NSAID', 20, 60],
      ['Procto Glyvenol Cream 30gm', 'Hemorrhoids', 35, 50],
      // Other
      ['Disprin 81mg Tablet 100pcs', 'Blood Thinner', 25, 80],
      ['Panadrex Paracetamol 500mg 48 Tablets', 'Pain Relief', 9, 100],
      ['Divido 75mg Capsule 20pcs', 'NSAID', 31, 60],
      ['Rofenac 50mg Tablet 20pcs', 'NSAID', 20, 80],
      ['Rofenac-D 50mg Dispersable 20pcs', 'NSAID', 30, 70],
      ['Emifenac 50mg Tablet 20pcs', 'NSAID', 23, 80],
      ['Sapofen 400mg Tablet 30pcs', 'NSAID', 14, 90],
      ['Sapofen 600mg Tablet 30pcs', 'NSAID', 17, 80],
      ['Fast Flam 50mg Tablet 20pcs', 'NSAID', 27, 70],
    ];
    const insertDrugMany = d.transaction((items) => {
      for (const [name, cat, price, stock] of items) {
        insertDrug.run(name, cat, price, stock);
      }
    });
    insertDrugMany(drugs);
  }
}

module.exports = { getDb, populateLabCatalog };

