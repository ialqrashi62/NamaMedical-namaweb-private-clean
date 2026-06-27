const { Pool } = require('pg');
const p = new Pool({ host: 'localhost', port: 5432, database: 'nama_medical_web', user: 'postgres', password: 'postgres' });
(async () => {
    try {
        // Check RX-7 data
        const r1 = await p.query("SELECT id, prescription_text, medication_name, dosage, quantity_per_day, frequency, duration FROM pharmacy_prescriptions_queue WHERE id >= 6 ORDER BY id DESC");
        console.log('=== RX DATA ===');
        r1.rows.forEach(r => {
            console.log('RX-' + r.id + ':');
            console.log('  prescription_text:', JSON.stringify(r.prescription_text));
            console.log('  medication_name:', JSON.stringify(r.medication_name));
            console.log('  dosage:', JSON.stringify(r.dosage));
            console.log('  quantity_per_day:', JSON.stringify(r.quantity_per_day));
            console.log('  frequency:', JSON.stringify(r.frequency));
            console.log('  duration:', JSON.stringify(r.duration));
        });

        // Check patient data
        const r2 = await p.query("SELECT q.id, q.patient_id, p.name_ar, p.age, p.department, p.dob FROM pharmacy_prescriptions_queue q LEFT JOIN patients p ON q.patient_id = p.id WHERE q.id >= 6");
        console.log('\n=== PATIENT DATA ===');
        r2.rows.forEach(r => {
            console.log('RX-' + r.id + ': patient_id=' + r.patient_id + ' name=' + r.name_ar + ' age=' + JSON.stringify(r.age) + ' dept=' + JSON.stringify(r.department) + ' dob=' + JSON.stringify(r.dob));
        });
    } catch (e) { console.error('ERROR:', e.message); }
    p.end();
})();
