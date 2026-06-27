// Deep Audit Migration - FK, Visit Tracking, Invoice Serial, Stock Deduction
require('dotenv').config();
const { Pool } = require('pg');
const pool = new Pool({
    host: process.env.DB_HOST || 'localhost',
    port: parseInt(process.env.DB_PORT) || 5432,
    database: process.env.DB_NAME || 'nama_medical_web',
    user: process.env.DB_USER || 'postgres',
    password: process.env.DB_PASSWORD || 'postgres'
});

async function migrate() {
    console.log('=== Deep Audit Migration ===\n');

    // 1. Visit/Encounter tracking table
    try {
        await pool.query(`CREATE TABLE IF NOT EXISTS patient_visits (
            id SERIAL PRIMARY KEY,
            patient_id INTEGER NOT NULL,
            visit_number VARCHAR(20),
            visit_type VARCHAR(50) DEFAULT 'Walk-in',
            department VARCHAR(100) DEFAULT '',
            doctor VARCHAR(200) DEFAULT '',
            status VARCHAR(50) DEFAULT 'Registered',
            chief_complaint TEXT DEFAULT '',
            created_by VARCHAR(200) DEFAULT '',
            created_at TIMESTAMP DEFAULT CURRENT_TIMESTAMP,
            checkout_at TIMESTAMP,
            notes TEXT DEFAULT ''
        )`);
        console.log('[OK] patient_visits table created');
    } catch (e) { console.log('patient_visits:', e.message); }

    // 2. Add columns to invoices
    const invCols = [
        "invoice_number VARCHAR(30) DEFAULT ''",
        "created_by VARCHAR(200) DEFAULT ''",
        "visit_id INTEGER",
        "cancelled INTEGER DEFAULT 0",
        "cancel_reason TEXT DEFAULT ''",
        "cancelled_by VARCHAR(200) DEFAULT ''",
        "cancelled_at TIMESTAMP",
        "original_amount DECIMAL(10,2) DEFAULT 0",
        "vat_amount DECIMAL(10,2) DEFAULT 0"
    ];
    for (const col of invCols) {
        try {
            await pool.query(`ALTER TABLE invoices ADD COLUMN ${col}`);
            console.log(`[OK] invoices: added ${col.split(' ')[0]}`);
        } catch (e) { if (e.message.includes('already exists')) console.log(`[SKIP] invoices.${col.split(' ')[0]}`); else console.log('Error:', e.message); }
    }

    // 3. Generate invoice serial numbers for existing invoices
    try {
        const invoices = (await pool.query("SELECT id FROM invoices WHERE invoice_number IS NULL OR invoice_number='' ORDER BY id")).rows;
        const year = new Date().getFullYear();
        for (let i = 0; i < invoices.length; i++) {
            const num = `INV-${year}-${String(i + 1).padStart(5, '0')}`;
            await pool.query('UPDATE invoices SET invoice_number=$1 WHERE id=$2', [num, invoices[i].id]);
        }
        console.log(`[OK] Generated ${invoices.length} invoice serial numbers`);
    } catch (e) { console.log('Invoice nums:', e.message); }

    // 4. Add audit columns to patients
    const patCols = [
        "is_deleted INTEGER DEFAULT 0",
        "deleted_at TIMESTAMP",
        "deleted_by VARCHAR(200) DEFAULT ''",
        "last_visit_at TIMESTAMP",
        "total_visits INTEGER DEFAULT 0"
    ];
    for (const col of patCols) {
        try {
            await pool.query(`ALTER TABLE patients ADD COLUMN ${col}`);
            console.log(`[OK] patients: added ${col.split(' ')[0]}`);
        } catch (e) { if (e.message.includes('already exists')) console.log(`[SKIP] patients.${col.split(' ')[0]}`); }
    }

    // 5. Add batch/expiry tracking to pharmacy
    const pharmCols = [
        "batch_number VARCHAR(50) DEFAULT ''",
        "supplier VARCHAR(200) DEFAULT ''",
        "reorder_level INTEGER DEFAULT 5",
        "last_restocked_at TIMESTAMP"
    ];
    for (const col of pharmCols) {
        try {
            await pool.query(`ALTER TABLE pharmacy_drug_catalog ADD COLUMN ${col}`);
            console.log(`[OK] pharmacy: added ${col.split(' ')[0]}`);
        } catch (e) { if (e.message.includes('already exists')) console.log(`[SKIP] pharmacy.${col.split(' ')[0]}`); }
    }

    // 6. Stock movement log table  
    try {
        await pool.query(`CREATE TABLE IF NOT EXISTS pharmacy_stock_log (
            id SERIAL PRIMARY KEY,
            drug_id INTEGER NOT NULL,
            drug_name VARCHAR(200) DEFAULT '',
            movement_type VARCHAR(20) DEFAULT 'OUT',
            quantity INTEGER DEFAULT 0,
            previous_qty INTEGER DEFAULT 0,
            new_qty INTEGER DEFAULT 0,
            reason TEXT DEFAULT '',
            patient_id INTEGER,
            prescription_id INTEGER,
            performed_by VARCHAR(200) DEFAULT '',
            created_at TIMESTAMP DEFAULT CURRENT_TIMESTAMP
        )`);
        console.log('[OK] pharmacy_stock_log table created');
    } catch (e) { console.log('stock_log:', e.message); }

    // 7. Audit trail table enhancement
    try {
        await pool.query(`CREATE TABLE IF NOT EXISTS audit_trail (
            id SERIAL PRIMARY KEY,
            user_id INTEGER,
            user_name VARCHAR(200) DEFAULT '',
            action VARCHAR(50) DEFAULT '',
            module VARCHAR(100) DEFAULT '',
            record_type VARCHAR(50) DEFAULT '',
            record_id INTEGER,
            details TEXT DEFAULT '',
            old_values TEXT DEFAULT '',
            new_values TEXT DEFAULT '',
            ip_address VARCHAR(50) DEFAULT '',
            created_at TIMESTAMP DEFAULT CURRENT_TIMESTAMP
        )`);
        console.log('[OK] audit_trail table created');
    } catch (e) { console.log('audit_trail:', e.message); }

    // 8. Notifications table
    try {
        await pool.query(`CREATE TABLE IF NOT EXISTS notifications (
            id SERIAL PRIMARY KEY,
            user_id INTEGER,
            target_role VARCHAR(50) DEFAULT '',
            title VARCHAR(200) DEFAULT '',
            message TEXT DEFAULT '',
            type VARCHAR(50) DEFAULT 'info',
            module VARCHAR(100) DEFAULT '',
            record_id INTEGER,
            is_read INTEGER DEFAULT 0,
            created_at TIMESTAMP DEFAULT CURRENT_TIMESTAMP
        )`);
        console.log('[OK] notifications table created');
    } catch (e) { console.log('notifications:', e.message); }

    // 9. Add force_password_change to system_users
    try {
        await pool.query("ALTER TABLE system_users ADD COLUMN force_password_change INTEGER DEFAULT 0");
        console.log('[OK] system_users: added force_password_change');
    } catch (e) { if (e.message.includes('already exists')) console.log('[SKIP] force_password_change'); }

    // 10. Add time_slot to appointments
    try {
        await pool.query("ALTER TABLE appointments ADD COLUMN time_slot VARCHAR(20) DEFAULT ''");
        await pool.query("ALTER TABLE appointments ADD COLUMN duration_minutes INTEGER DEFAULT 15");
        console.log('[OK] appointments: added time_slot, duration_minutes');
    } catch (e) { if (e.message.includes('already exists')) console.log('[SKIP] appointment columns'); }

    // 11. Performance indexes
    const indexes = [
        "CREATE INDEX IF NOT EXISTS idx_visits_patient ON patient_visits(patient_id)",
        "CREATE INDEX IF NOT EXISTS idx_visits_date ON patient_visits(created_at)",
        "CREATE INDEX IF NOT EXISTS idx_inv_number ON invoices(invoice_number)",
        "CREATE INDEX IF NOT EXISTS idx_inv_visit ON invoices(visit_id)",
        "CREATE INDEX IF NOT EXISTS idx_audit_user ON audit_trail(user_id)",
        "CREATE INDEX IF NOT EXISTS idx_audit_module ON audit_trail(module)",
        "CREATE INDEX IF NOT EXISTS idx_notif_user ON notifications(user_id)",
        "CREATE INDEX IF NOT EXISTS idx_notif_role ON notifications(target_role)",
        "CREATE INDEX IF NOT EXISTS idx_stock_drug ON pharmacy_stock_log(drug_id)",
        "CREATE INDEX IF NOT EXISTS idx_appt_conflict ON appointments(doctor, appointment_date, time_slot)"
    ];
    for (const idx of indexes) {
        try { await pool.query(idx); } catch (e) { }
    }
    console.log('[OK] 10 new indexes created');

    await pool.end();
    console.log('\n=== Migration Complete ===');
}

migrate();
