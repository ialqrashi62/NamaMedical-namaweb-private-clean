// Quick fix script - diagnose and fix PostgreSQL connection
const { Pool } = require('pg');

async function fix() {
    console.log('=== Nama Medical - Quick Fix ===\n');

    // Step 1: Try connecting to default 'postgres' database
    console.log('1. Testing PostgreSQL connection...');
    const pool = new Pool({
        host: 'localhost', port: 5432,
        database: 'postgres', user: 'postgres', password: 'postgres'
    });

    try {
        const res = await pool.query('SELECT version()');
        console.log('   ✅ PostgreSQL connected!');
        console.log('   Version:', res.rows[0].version.split(',')[0]);
    } catch (e) {
        console.log('   ❌ Connection failed:', e.message);
        if (e.message.includes('password')) {
            console.log('\n   🔑 Password issue. Trying without password...');
            const pool2 = new Pool({ host: 'localhost', port: 5432, database: 'postgres', user: 'postgres', password: '' });
            try {
                await pool2.query('SELECT 1');
                console.log('   ✅ Connected with empty password! Update your .env: DB_PASSWORD=');
            } catch (e2) {
                console.log('   ❌ Also failed. You may need to reset PostgreSQL password.');
                console.log('   Fix: Edit pg_hba.conf to use "trust" auth, restart service, then set password.');
            }
            await pool2.end();
        }
        await pool.end();
        process.exit(1);
    }

    // Step 2: Check if database exists, create if not
    console.log('\n2. Checking database "nama_medical_web"...');
    try {
        const dbCheck = await pool.query("SELECT 1 FROM pg_database WHERE datname='nama_medical_web'");
        if (dbCheck.rows.length === 0) {
            console.log('   ⚠️  Database not found. Creating...');
            await pool.query('CREATE DATABASE nama_medical_web');
            console.log('   ✅ Database created!');
        } else {
            console.log('   ✅ Database exists!');
        }
    } catch (e) {
        console.log('   ❌ Error:', e.message);
    }

    await pool.end();

    // Step 3: Test the actual app connection
    console.log('\n3. Testing app database connection...');
    const appPool = new Pool({
        host: 'localhost', port: 5432,
        database: 'nama_medical_web', user: 'postgres', password: 'postgres'
    });
    try {
        await appPool.query('SELECT 1');
        console.log('   ✅ App database connection works!\n');
        console.log('=== Everything is ready! Run: node server.js ===');
    } catch (e) {
        console.log('   ❌ App connection failed:', e.message);
    }
    await appPool.end();
}

fix().catch(e => { console.error('Fatal:', e.message); process.exit(1); });
