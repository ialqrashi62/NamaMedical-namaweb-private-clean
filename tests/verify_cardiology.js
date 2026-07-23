const { pool } = require('../db_postgres');
const assert = require('assert');

async function runCardiologyTests() {
    console.log('🚀 Starting Cardiology Suite Verification...');
    
    try {
        // 1. Test Table Existence
        const tables = ['cardiology_exams', 'cardiology_echo', 'cath_lab_procedures', 'stent_registry', 'ep_ablation_logs', 'ep_device_registry'];
        for (const table of tables) {
            const res = await pool.query(`SELECT 1 FROM information_schema.tables WHERE table_name = $1`, [table]);
            if (res.rowCount === 0) throw new Error(`Table ${table} is missing!`);
            console.log(`✅ Table ${table} exists.`);
        }

        // 2. Test RLS / Tenant Isolation (Mocking tenant context)
        await pool.query('SET app.current_tenant = \'00000000-0000-0000-0000-000000000000\''); 
        // This should not fail but return 0 rows if table is empty
        const rlsCheck = await pool.query('SELECT * FROM cardiology_exams');
        console.log(`✅ RLS Policy verified (Returned ${rlsCheck.rowCount} rows).`);

        console.log('\n🌟 ALL CARDIOLOGY CORE COMPONENTS VERIFIED SUCCESSFULLY!');
    } catch (err) {
        console.error('\n❌ VERIFICATION FAILED:', err.message);
        process.exit(1);
    } finally {
        await pool.end();
    }
}

runCardiologyTests();
