// Migration script - add new patient columns
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
    const columns = [
        'blood_type VARCHAR(10)',
        'allergies TEXT',
        'chronic_diseases TEXT',
        'emergency_contact_name VARCHAR(100)',
        'emergency_contact_phone VARCHAR(20)',
        'address TEXT',
        'insurance_company VARCHAR(100)',
        'insurance_policy_number VARCHAR(50)',
        'insurance_class VARCHAR(20)',
        'mrn VARCHAR(20)'
    ];

    for (const col of columns) {
        try {
            await pool.query('ALTER TABLE patients ADD COLUMN ' + col);
            console.log('Added:', col);
        } catch (e) {
            if (e.message.includes('already exists')) console.log('Exists:', col);
            else console.log('Error:', col, e.message);
        }
    }

    // Auto-generate MRN for existing patients
    try {
        const patients = (await pool.query('SELECT id FROM patients WHERE mrn IS NULL ORDER BY id')).rows;
        for (const p of patients) {
            const mrn = 'MRN-' + String(p.id).padStart(6, '0');
            await pool.query('UPDATE patients SET mrn=$1 WHERE id=$2', [mrn, p.id]);
        }
        console.log('Generated MRN for', patients.length, 'existing patients');
    } catch (e) {
        console.log('MRN generation error:', e.message);
    }

    // Add database indexes for performance
    const indexes = [
        'CREATE INDEX IF NOT EXISTS idx_patients_mrn ON patients(mrn)',
        'CREATE INDEX IF NOT EXISTS idx_patients_national_id ON patients(national_id)',
        'CREATE INDEX IF NOT EXISTS idx_patients_phone ON patients(phone)',
        'CREATE INDEX IF NOT EXISTS idx_patients_name_ar ON patients(name_ar)',
        'CREATE INDEX IF NOT EXISTS idx_invoices_patient_id ON invoices(patient_id)',
        'CREATE INDEX IF NOT EXISTS idx_lab_orders_patient_id ON lab_radiology_orders(patient_id)',
        'CREATE INDEX IF NOT EXISTS idx_prescriptions_patient_id ON prescriptions(patient_id)',
        'CREATE INDEX IF NOT EXISTS idx_medical_records_patient_id ON medical_records(patient_id)',
        'CREATE INDEX IF NOT EXISTS idx_appointments_patient_id ON appointments(patient_id)'
    ];

    for (const idx of indexes) {
        try {
            await pool.query(idx);
            console.log('Index OK:', idx.split(' ON ')[0].replace('CREATE INDEX IF NOT EXISTS ', ''));
        } catch (e) {
            console.log('Index error:', e.message);
        }
    }

    await pool.end();
    console.log('\nMigration complete!');
}

migrate();
