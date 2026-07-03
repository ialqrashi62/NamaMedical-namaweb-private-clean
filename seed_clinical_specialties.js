/**
 * seed_clinical_specialties.js
 * Database seeder for the 100+ clinical subspecialties and EMR templates.
 */

const { pool } = require('./db_postgres');

const DEPARTMENTS = [
    // I. Internal Medicine & Subspecialties
    { code: 'CARDIOLOGY', name_en: 'General Cardiology', name_ar: 'طب القلب العام' },
    { code: 'INTERVENTIONAL_CARDIOLOGY', name_en: 'Interventional Cardiology', name_ar: 'طب القلب التداخلي' },
    { code: 'ELECTROPHYSIOLOGY', name_en: 'Electrophysiology', name_ar: 'طب القلب الإلكتروفيزيولوجي' },
    { code: 'PREVENTIVE_CARDIOLOGY', name_en: 'Preventive Cardiology', name_ar: 'طب القلب الوقائي' },
    { code: 'CARDIAC_CATH', name_en: 'Cardiac Catheterization Lab', name_ar: 'قسطرة القلب' },
    { code: 'PULMONOLOGY', name_en: 'Pulmonology', name_ar: 'طب الصدر والجهاز التنفسي' },
    { code: 'SLEEP_MEDICINE', name_en: 'Sleep Medicine', name_ar: 'طب النوم واضطرابات التنفس' },
    { code: 'GASTROENTEROLOGY', name_en: 'Gastroenterology', name_ar: 'طب الجهاز الهضمي' },
    { code: 'HEPATOLOGY', name_en: 'Hepatology', name_ar: 'أمراض الكبد' },
    { code: 'NEPHROLOGY', name_en: 'General Nephrology', name_ar: 'طب الكلى العام' },
    { code: 'RENAL_DIALYSIS', name_en: 'Dialysis Unit', name_ar: 'وحدة غسيل الكلى' },
    { code: 'ONCOLOGY', name_en: 'Medical Oncology', name_ar: 'طب الأورام العام' },
    { code: 'HEMATOLOGY', name_en: 'Clinical Hematology', name_ar: 'أمراض الدم' },
    { code: 'ENDOCRINOLOGY', name_en: 'Endocrinology & Diabetology', name_ar: 'الغدد الصماء والسكري' },
    { code: 'RHEUMATOLOGY', name_en: 'Rheumatology', name_ar: 'الأمراض الروماتيزمية' },
    { code: 'INFECTIOUS_DISEASES', name_en: 'Infectious Diseases', name_ar: 'الأمراض المعدية' },
    { code: 'DERMATOLOGY', name_en: 'Dermatology', name_ar: 'الأمراض الجلدية' },

    // II. Surgical Departments
    { code: 'GENERAL_SURGERY', name_en: 'General Surgery', name_ar: 'الجراحة العامة' },
    { code: 'SURGICAL_ONCOLOGY', name_en: 'Surgical Oncology', name_ar: 'جراحة الأورام العامة' },
    { code: 'BARIATRIC_SURGERY', name_en: 'Bariatric Surgery', name_ar: 'جراحة السمنة المفرطة' },
    { code: 'CARDIOTHORACIC_SURGERY', name_en: 'Cardiothoracic Surgery', name_ar: 'جراحة القلب والصدر' },
    { code: 'VASCULAR_SURGERY', name_en: 'Vascular Surgery', name_ar: 'جراحة الأوعية الدموية' },
    { code: 'NEUROSURGERY', name_en: 'Neurosurgery', name_ar: 'جراحة المخ والأعصاب' },
    { code: 'SPINE_SURGERY', name_en: 'Spine Surgery', name_ar: 'جراحة العمود الفقري' },
    { code: 'ORTHOPEDIC_SURGERY', name_en: 'Orthopedic Surgery', name_ar: 'جراحة العظام العامة' },
    { code: 'OPHTHALMOLOGY', name_en: 'Ophthalmology', name_ar: 'طب وجراحة العيون' },
    { code: 'ENT', name_en: 'Otolaryngology (ENT)', name_ar: 'الأنف والأذن والحنجرة' },
    { code: 'UROLOGY', name_en: 'Urology', name_ar: 'جراحة المسالك البولية' },
    { code: 'PLASTIC_SURGERY', name_en: 'Plastic & Reconstructive Surgery', name_ar: 'جراحة التجميل والترميم' },

    // III. Obstetrics, Gynecology & Pediatrics
    { code: 'OBGYN', name_en: 'Obstetrics & Gynecology', name_ar: 'النساء والولادة العام' },
    { code: 'FETAL_MEDICINE', name_en: 'Maternal-Fetal Medicine', name_ar: 'طب الأم والجنين' },
    { code: 'IVF_LAB', name_en: 'Reproductive Endocrinology & IVF', name_ar: 'الإخصاب وأطفال الأنابيب' },
    { code: 'PEDIATRICS', name_en: 'General Pediatrics', name_ar: 'طب الأطفال العام' },
    { code: 'NEONATOLOGY_NICU', name_en: 'Neonatal ICU (NICU)', name_ar: 'العناية المركزة لحديثي الولادة' },
    { code: 'PEDIATRIC_CARDIOLOGY', name_en: 'Pediatric Cardiology', name_ar: 'قلب الأطفال' },

    // IV. Advanced Diagnostics
    { code: 'RADIOLOGY', name_en: 'Diagnostic Radiology', name_ar: 'الأشعة التشغيلية والتصوير' },
    { code: 'INTERVENTIONAL_RAD', name_en: 'Interventional Radiology', name_ar: 'الأشعة التداخلية' },
    { code: 'PATHOLOGY', name_en: 'Clinical Pathology & Histopathology', name_ar: 'المختبرات والباثولوجيا' },
    { code: 'GENETICS', name_en: 'Medical Genetics', name_ar: 'علم الوراثة الطبية' }
];

// Sample Form Structures for dynamic rendering
const CARDIOLOGY_TEMPLATE = {
    fields: [
        { name: 'chest_pain', type: 'select', label_en: 'Chest Pain Type', label_ar: 'نوع ألم الصدر', options: ['Typical Angina', 'Atypical Angina', 'Non-anginal', 'None'] },
        { name: 'bp_systolic', type: 'number', label_en: 'BP Systolic (mmHg)', label_ar: 'الضغط الانقباضي' },
        { name: 'bp_diastolic', type: 'number', label_en: 'BP Diastolic (mmHg)', label_ar: 'الضغط الانبساطي' },
        { name: 'ecg_finding', type: 'text', label_en: 'ECG Findings', label_ar: 'نتائج تخطيط القلب' },
        { name: 'ejec_fraction', type: 'number', label_en: 'Ejection Fraction (%)', label_ar: 'الكسر القذفي للقلب' }
    ]
};

const PEDIATRICS_NICU_TEMPLATE = {
    fields: [
        { name: 'birth_weight', type: 'number', label_en: 'Birth Weight (kg)', label_ar: 'وزن الولادة (كجم)' },
        { name: 'apgar_1m', type: 'number', label_en: 'APGAR Score (1 min)', label_ar: 'مقياس أبغار دقيقة' },
        { name: 'apgar_5m', type: 'number', label_en: 'APGAR Score (5 min)', label_ar: 'مقياس أبغار 5 دقائق' },
        { name: 'o2_saturation', type: 'number', label_en: 'O2 Saturation (%)', label_ar: 'نسبة الأكسجين بالدم' },
        { name: 'ventilator_mode', type: 'select', label_en: 'Ventilator Mode', label_ar: 'وضع جهاز التنفس', options: ['None', 'CPAP', 'SIMV', 'HFOV'] }
    ]
};

const SURGICAL_COUNT_TEMPLATE = {
    fields: [
        { name: 'sponge_count_pre', type: 'number', label_en: 'Pre-incision Sponge Count', label_ar: 'عدد الشاش قبل الفتح' },
        { name: 'sponge_count_post', type: 'number', label_en: 'Post-closure Sponge Count', label_ar: 'عدد الشاش بعد الإغلاق' },
        { name: 'instrument_count_pre', type: 'number', label_en: 'Pre-incision Instrument Count', label_ar: 'عدد الأدوات قبل الفتح' },
        { name: 'instrument_count_post', type: 'number', label_en: 'Post-closure Instrument Count', label_ar: 'عدد الأدوات بعد الإغلاق' },
        { name: 'sharp_count_pre', type: 'number', label_en: 'Pre-incision Sharps Count', label_ar: 'عدد الإبر والآلات الحادة قبل الفتح' },
        { name: 'sharp_count_post', type: 'number', label_en: 'Post-closure Sharps Count', label_ar: 'عدد الإبر والآلات الحادة بعد الإغلاق' },
        { name: 'override_reason', type: 'text', label_en: 'Override Reason (if mismatch)', label_ar: 'سبب التجاوز (في حال عدم التطابق)' }
    ]
};

const BRADEN_TEMPLATE = {
    fields: [
        { name: 'sensory_perception', type: 'number', label_en: 'Sensory Perception (1-4)', label_ar: 'الإدراك الحسي (1-4)' },
        { name: 'moisture', type: 'number', label_en: 'Moisture (1-4)', label_ar: 'الرطوبة (1-4)' },
        { name: 'activity', type: 'number', label_en: 'Activity (1-4)', label_ar: 'النشاط (1-4)' },
        { name: 'mobility', type: 'number', label_en: 'Mobility (1-4)', label_ar: 'الحركة (1-4)' },
        { name: 'nutrition', type: 'number', label_en: 'Nutrition (1-4)', label_ar: 'التغذية (1-4)' },
        { name: 'friction_shear', type: 'number', label_en: 'Friction & Shear (1-3)', label_ar: 'الاحتكاك والقص (1-3)' }
    ]
};

const MORSE_TEMPLATE = {
    fields: [
        { name: 'history_of_falls', type: 'number', label_en: 'History of Falls (0 or 25)', label_ar: 'تاريخ السقوط (0 أو 25)' },
        { name: 'secondary_diagnosis', type: 'number', label_en: 'Secondary Diagnosis (0 or 15)', label_ar: 'تشخيص ثانوي (0 أو 15)' },
        { name: 'ambulatory_aid', type: 'number', label_en: 'Ambulatory Aid (0, 15, or 30)', label_ar: 'مساعد المشي (0 أو 15 أو 30)' },
        { name: 'iv_heparin_lock', type: 'number', label_en: 'IV/Heparin Lock (0 or 20)', label_ar: 'العلاج بالوريد/حامل المحاليل (0 أو 20)' },
        { name: 'gait_transferring', type: 'number', label_en: 'Gait/Transferring (0, 10, or 20)', label_ar: 'المشية والتحويل (0 أو 10 أو 20)' },
        { name: 'mental_status', type: 'number', label_en: 'Mental Status (0 or 15)', label_ar: 'الحالة العقلية (0 أو 15)' }
    ]
};

const APGAR_TEMPLATE = {
    fields: [
        { name: 'apgar_1m_appearance', type: 'number', label_en: '1-Min Appearance (0-2)', label_ar: 'المظهر عند دقيقة (0-2)' },
        { name: 'apgar_1m_pulse', type: 'number', label_en: '1-Min Pulse (0-2)', label_ar: 'النبض عند دقيقة (0-2)' },
        { name: 'apgar_1m_grimace', type: 'number', label_en: '1-Min Grimace (0-2)', label_ar: 'الاستجابة للمنعكسات عند دقيقة (0-2)' },
        { name: 'apgar_1m_activity', type: 'number', label_en: '1-Min Activity (0-2)', label_ar: 'النشاط العضلي عند دقيقة (0-2)' },
        { name: 'apgar_1m_respiration', type: 'number', label_en: '1-Min Respiration (0-2)', label_ar: 'التنفس عند دقيقة (0-2)' },
        { name: 'apgar_5m_appearance', type: 'number', label_en: '5-Min Appearance (0-2)', label_ar: 'المظهر عند 5 دقائق (0-2)' },
        { name: 'apgar_5m_pulse', type: 'number', label_en: '5-Min Pulse (0-2)', label_ar: 'النبض عند 5 دقائق (0-2)' },
        { name: 'apgar_5m_grimace', type: 'number', label_en: '5-Min Grimace (0-2)', label_ar: 'الاستجابة للمنعكسات عند 5 دقائق (0-2)' },
        { name: 'apgar_5m_activity', type: 'number', label_en: '5-Min Activity (0-2)', label_ar: 'النشاط العضلي عند 5 دقائق (0-2)' },
        { name: 'apgar_5m_respiration', type: 'number', label_en: '5-Min Respiration (0-2)', label_ar: 'التنفس عند 5 دقائق (0-2)' }
    ]
};

async function seed() {
    console.log('Starting specialties database seeding...');
    const client = await pool.connect();
    try {
        await client.query('BEGIN');
        await client.query("SET app.tenant_id = '1'");

        // 1. Insert Departments
        for (const dept of DEPARTMENTS) {
            await client.query(
                `INSERT INTO clinical_departments (tenant_id, code, name_en, name_ar)
                 VALUES (1, $1, $2, $3)
                 ON CONFLICT (tenant_id, code) DO UPDATE 
                 SET name_en = EXCLUDED.name_en, name_ar = EXCLUDED.name_ar`,
                [dept.code, dept.name_en, dept.name_ar]
            );
        }
        console.log(`✓ Seeded ${DEPARTMENTS.length} clinical departments.`);

        // Check is_active type dynamically
        const colTypeRes = await client.query(`
            SELECT data_type FROM information_schema.columns 
            WHERE table_name = 'clinical_templates' AND column_name = 'is_active'
        `);
        const isBool = colTypeRes.rows.length && colTypeRes.rows[0].data_type === 'boolean';
        const isActiveVal = isBool ? true : 1;

        // Helper to insert templates safely and idempotently
        async function insertTemplate(deptCode, nameEn, nameAr, structure) {
            const deptRes = await client.query('SELECT id FROM clinical_departments WHERE code = $1', [deptCode]);
            if (!deptRes.rows.length) return;
            const deptId = deptRes.rows[0].id;
            
            const check = await client.query(
                "SELECT id FROM clinical_templates WHERE department_id = $1 AND template_name_en = $2 AND tenant_id = 1",
                [deptId, nameEn]
            );
            if (check.rowCount === 0) {
                await client.query(
                    `INSERT INTO clinical_templates (department_id, template_name_en, template_name_ar, version, form_structure, is_active, tenant_id)
                     VALUES ($1, $2, $3, '1.0.0', $4, $5, 1)`,
                    [deptId, nameEn, nameAr, JSON.stringify(structure), isActiveVal]
                );
            }
        }

        // 2. Insert Templates
        await insertTemplate('CARDIOLOGY', 'Cardiology Evaluation', 'نموذج الفحص القلبي', CARDIOLOGY_TEMPLATE);
        await insertTemplate('NEONATOLOGY_NICU', 'NICU Admission & Vitals', 'دخول ومؤشرات العناية المركزة لحديثي الولادة', PEDIATRICS_NICU_TEMPLATE);
        
        // Seed F1 Templates
        await insertTemplate('GENERAL_SURGERY', 'Surgical Count Sheet', 'سجل جرد أدوات الجراحة', SURGICAL_COUNT_TEMPLATE);
        await insertTemplate('PEDIATRICS', 'Braden Scale Assessment', 'مقياس برادن لقرح الفراش', BRADEN_TEMPLATE);
        await insertTemplate('PEDIATRICS', 'Morse Fall Risk Assessment', 'مقياس مورس لمخاطر السقوط', MORSE_TEMPLATE);
        await insertTemplate('NEONATOLOGY_NICU', 'Neonatal Apgar Score', 'مقياس أبغار لحديثي الولادة', APGAR_TEMPLATE);

        await client.query('COMMIT');
        console.log('✓ Seeding clinical templates complete.');
    } catch (e) {
        await client.query('ROLLBACK');
        console.error('❌ Seeding failed:', e);
    } finally {
        client.release();
    }
}

seed();
