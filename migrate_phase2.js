// Phase 2 migration - invoice discount + pharmacy alerts
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
    // Add discount to invoices
    const cols = [
        { table: 'invoices', col: 'discount DECIMAL(10,2) DEFAULT 0' },
        { table: 'invoices', col: 'discount_reason TEXT' },
        { table: 'pharmacy_drug_catalog', col: 'expiry_date DATE' },
        { table: 'pharmacy_drug_catalog', col: 'min_stock_level INTEGER DEFAULT 10' },
        { table: 'pharmacy_drug_catalog', col: 'barcode VARCHAR(50)' }
    ];

    for (const { table, col } of cols) {
        try {
            await pool.query(`ALTER TABLE ${table} ADD COLUMN ${col}`);
            console.log(`Added ${col} to ${table}`);
        } catch (e) {
            if (e.message.includes('already exists')) console.log(`Exists: ${col} in ${table}`);
            else console.log(`Error: ${col}`, e.message);
        }
    }

    await pool.end();
    console.log('\nPhase 2 migration complete!');
}

migrate();
