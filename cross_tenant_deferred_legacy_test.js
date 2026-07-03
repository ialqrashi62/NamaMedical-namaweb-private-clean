/**
 * cross_tenant_deferred_legacy_test.js
 * ============================================================================
 * اختبار الأمان التلقائي لعزل الوحدات الإرثية المؤجلة (النقل، الطب عن بعد، CME، الخدمة الاجتماعية، الوفيات)
 * Cross-Tenant Security and Isolation Test for Deferred Legacy Modules
 * ============================================================================
 */

const fs = require('fs');
const path = require('path');

const RED   = '\x1b[31m';
const GREEN = '\x1b[32m';
const YELLOW = '\x1b[33m';
const BLUE  = '\x1b[34m';
const RESET = '\x1b[0m';
const BOLD  = '\x1b[1m';

let passed = 0;
let failed = 0;
const failureLog = [];

function assert(condition, testName, details = '') {
    if (condition) {
        console.log(`  ${GREEN}✅ PASS${RESET} — ${testName}`);
        passed++;
    } else {
        console.log(`  ${RED}❌ FAIL${RESET} — ${testName}${details ? ' | ' + details : ''}`);
        failed++;
        failureLog.push({ testName, details });
    }
}

console.log(`\n${BOLD}${BLUE}================================================================${RESET}`);
console.log(`${BOLD}${BLUE}  بدء اختبارات أمان وعزل الوحدات المؤجلة الإرثية${RESET}`);
console.log(`${BOLD}${BLUE}  (نقل المرضى، الطب عن بعد، التعليم الطبي CME، الخدمة الاجتماعية، الوفيات)${RESET}`);
console.log(`${BOLD}${BLUE}  NamaMedical — Deferred Legacy Modules Isolation QA Test${RESET}`);
console.log(`${BOLD}${BLUE}================================================================${RESET}\n`);

// ===== 1. التدقيق البرمجي الاستاتيكي لكود Express (Static API Audit) =====
console.log(`${BOLD}[ 1 ] فحص حماية وتصفية مسارات الوحدات المؤجلة الإرثية في server.js${RESET}`);
const serverPath = path.join(__dirname, 'server.js');
const serverContent = fs.readFileSync(serverPath, 'utf8');

const apiRoutes = [
    // Patient Transport
    { pattern: "app.get('/api/transport/requests', requireAuth, requireRole('transport'), requireTenantScope", label: "GET /api/transport/requests محمي بـ requireRole('transport') و requireTenantScope" },
    { pattern: "app.post('/api/transport/requests', requireAuth, requireRole('transport'), requireTenantScope", label: "POST /api/transport/requests محمي بـ requireRole('transport') و requireTenantScope" },
    { pattern: "app.put('/api/transport/requests/:id', requireAuth, requireRole('transport'), requireTenantScope", label: "PUT /api/transport/requests/:id محمي بـ requireRole('transport') و requireTenantScope" },

    // Telemedicine
    { pattern: "app.get('/api/telemedicine/sessions', requireAuth, requireRole('telemedicine'), requireTenantScope", label: "GET /api/telemedicine/sessions محمي بـ requireRole('telemedicine') و requireTenantScope" },
    { pattern: "app.post('/api/telemedicine/sessions', requireAuth, requireRole('telemedicine'), requireTenantScope", label: "POST /api/telemedicine/sessions محمي بـ requireRole('telemedicine') و requireTenantScope" },
    { pattern: "app.put('/api/telemedicine/sessions/:id', requireAuth, requireRole('telemedicine'), requireTenantScope", label: "PUT /api/telemedicine/sessions/:id محمي بـ requireRole('telemedicine') و requireTenantScope" },

    // CME Activities & Registrations
    { pattern: "app.get('/api/cme/activities', requireAuth, requireRole('cme'), requireTenantScope", label: "GET /api/cme/activities محمي بـ requireRole('cme') و requireTenantScope" },
    { pattern: "app.post('/api/cme/activities', requireAuth, requireRole('cme'), requireTenantScope", label: "POST /api/cme/activities محمي بـ requireRole('cme') و requireTenantScope" },
    { pattern: "app.get('/api/cme/registrations', requireAuth, requireRole('cme'), requireTenantScope", label: "GET /api/cme/registrations محمي بـ requireRole('cme') و requireTenantScope" },
    { pattern: "app.post('/api/cme/registrations', requireAuth, requireRole('cme'), requireTenantScope", label: "POST /api/cme/registrations محمي بـ requireRole('cme') و requireTenantScope" },

    // CME Events
    { pattern: "app.get('/api/cme/events', requireAuth, requireRole('cme'), requireTenantScope", label: "GET /api/cme/events محمي بـ requireRole('cme') و requireTenantScope" },
    { pattern: "app.post('/api/cme/events', requireAuth, requireRole('cme'), requireTenantScope", label: "POST /api/cme/events محمي بـ requireRole('cme') و requireTenantScope" },

    // Social Work
    { pattern: "app.get('/api/social-work/cases', requireAuth, requireRole('him', 'nursing'), requireTenantScope", label: "GET /api/social-work/cases محمي بـ requireRole('him','nursing') و requireTenantScope" },
    { pattern: "app.post('/api/social-work/cases', requireAuth, requireRole('him', 'nursing'), requireTenantScope", label: "POST /api/social-work/cases محمي بـ requireRole('him','nursing') و requireTenantScope" },
    { pattern: "app.put('/api/social-work/cases/:id', requireAuth, requireRole('him', 'nursing'), requireTenantScope", label: "PUT /api/social-work/cases/:id محمي بـ requireRole('him','nursing') و requireTenantScope" },

    // Mortuary
    { pattern: "app.get('/api/mortuary/cases', requireAuth, requireRole('him', 'nursing'), requireTenantScope", label: "GET /api/mortuary/cases محمي بـ requireRole('him','nursing') و requireTenantScope" },
    { pattern: "app.post('/api/mortuary/cases', requireAuth, requireRole('him', 'nursing'), requireTenantScope", label: "POST /api/mortuary/cases محمي بـ requireRole('him','nursing') و requireTenantScope" },
    { pattern: "app.put('/api/mortuary/cases/:id', requireAuth, requireRole('him', 'nursing'), requireTenantScope", label: "PUT /api/mortuary/cases/:id محمي بـ requireRole('him','nursing') و requireTenantScope" }
];

for (const { pattern, label } of apiRoutes) {
    const cleanPattern = pattern.replace(/\s+/g, '');
    const cleanContent = serverContent.replace(/\s+/g, '');
    const found = cleanContent.includes(cleanPattern);
    assert(found, label, `البحث عن: "${pattern}"`);
}

// Check for explicit tenant_id check in queries/statements
const queryChecks = [
    { source: "transport_requests WHERE tenant_id=$1", label: "transport_requests filter by tenant_id in GET" },
    { source: "INSERT INTO transport_requests (patient_id,patient_name,from_location,to_location,transport_type,priority,requested_by,special_needs,tenant_id,facility_id)", label: "transport_requests stamps tenant_id and facility_id in INSERT" },
    { source: "telemedicine_sessions WHERE tenant_id=$1", label: "telemedicine_sessions filter by tenant_id in GET" },
    { source: "INSERT INTO telemedicine_sessions (patient_id, patient_name, doctor, speciality, session_type, scheduled_date, scheduled_time, duration_minutes, meeting_link, notes, tenant_id, facility_id)", label: "telemedicine_sessions stamps tenant_id and facility_id in INSERT" },
    { source: "UPDATE telemedicine_sessions SET status=$1, diagnosis=$2, prescription=$3 WHERE id=$4 AND tenant_id=$5", label: "telemedicine_sessions update checks tenant_id" },
    { source: "cme_activities WHERE tenant_id=$1", label: "cme_activities filter by tenant_id in GET" },
    { source: "INSERT INTO cme_activities (title, category, provider, credit_hours, activity_date, location, max_participants, description, tenant_id, facility_id)", label: "cme_activities stamps tenant_id and facility_id in INSERT" },
    { source: "cme_registrations WHERE activity_id=$1 AND tenant_id=$2", label: "cme_registrations filter by activity_id and tenant_id" },
    { source: "INSERT INTO cme_registrations (activity_id, employee_name, registration_date, tenant_id, facility_id)", label: "cme_registrations stamps tenant_id and facility_id in INSERT" },
    { source: "cme_events WHERE tenant_id=$1", label: "cme_events filter by tenant_id in GET" },
    { source: "INSERT INTO cme_events (title,speaker,event_date,cme_hours,category,department,status,tenant_id,facility_id)", label: "cme_events stamps tenant_id and facility_id in INSERT" },
    { source: "social_work_cases WHERE tenant_id=$1", label: "social_work_cases filter by tenant_id in GET" },
    { source: "INSERT INTO social_work_cases (patient_id, patient_name, case_type, social_worker, assessment, plan, priority, tenant_id, facility_id)", label: "social_work_cases stamps tenant_id and facility_id in INSERT" },
    { source: "UPDATE social_work_cases SET status=$1, interventions=$2, referrals=$3, follow_up_date=$4 WHERE id=$5 AND tenant_id=$6", label: "social_work_cases update checks tenant_id" },
    { source: "mortuary_cases WHERE tenant_id=$1", label: "mortuary_cases filter by tenant_id in GET" },
    { source: "INSERT INTO mortuary_cases (patient_id, deceased_name, date_of_death, time_of_death, cause_of_death, attending_physician, next_of_kin, next_of_kin_phone, notes, tenant_id, facility_id)", label: "mortuary_cases stamps tenant_id and facility_id in INSERT" },
    { source: "UPDATE mortuary_cases SET release_status=$1, released_to=$2, released_date=$3, death_certificate_number=$4 WHERE id=$5 AND tenant_id=$6", label: "mortuary_cases update checks tenant_id" }
];

for (const { source, label } of queryChecks) {
    const cleanSource = source.replace(/\s+/g, '');
    const cleanContent = serverContent.replace(/\s+/g, '');
    const found = cleanContent.includes(cleanSource);
    assert(found, label, `البحث عن: "${source}"`);
}

// ===== 2. فحص مطابقة بنية الجداول في ملف db_postgres.js (db_postgres.js Parity Check) =====
console.log(`\n${BOLD}[ 2 ] فحص مطابقة بنية الجداول في ملف db_postgres.js لتضمين tenant_id والترقيات والنسخ الاحتياطي${RESET}`);
const dbPostgresPath = path.join(__dirname, 'db_postgres.js');
const dbPostgresContent = fs.readFileSync(dbPostgresPath, 'utf8');

const dbTablesToCheck = [
    { pattern: "ALTER TABLE transport_requests ADD COLUMN IF NOT EXISTS tenant_id INTEGER;", label: "ترقية جدول transport_requests لتضمين tenant_id" },
    { pattern: "UPDATE telemedicine_sessions SET tenant_id = 1, facility_id = 1 WHERE tenant_id IS NULL;", label: "نسخ احتياطي وترقية telemedicine_sessions بالمعرف الافتراضي" },
    { pattern: "UPDATE pathology_cases SET tenant_id = 1, facility_id = 1 WHERE tenant_id IS NULL;", label: "نسخ احتياطي وترقية pathology_cases بالمعرف الافتراضي" },
    { pattern: "UPDATE social_work_cases SET tenant_id = 1, facility_id = 1 WHERE tenant_id IS NULL;", label: "نسخ احتياطي وترقية social_work_cases بالمعرف الافتراضي" },
    { pattern: "UPDATE mortuary_cases SET tenant_id = 1, facility_id = 1 WHERE tenant_id IS NULL;", label: "نسخ احتياطي وترقية mortuary_cases بالمعرف الافتراضي" }
];

for (const { pattern, label } of dbTablesToCheck) {
    const cleanPattern = pattern.replace(/\s+/g, '');
    const cleanContent = dbPostgresContent.replace(/\s+/g, '');
    const found = cleanContent.includes(cleanPattern);
    assert(found, label, `توقع وجود: "${pattern}"`);
}

// ===== نتائج الفحص النهائي =====
console.log(`\n${BOLD}${BLUE}================================================================${RESET}`);
console.log(`${BOLD}${BLUE}  ملخص نتائج اختبارات الأمان للوحدات الإرثية المؤجلة${RESET}`);
console.log(`  إجمالي الفحوصات الناجحة (PASSED): ${passed}`);
console.log(`  إجمالي الفحوصات الفاشلة (FAILED): ${failed}`);
console.log(`${BOLD}${BLUE}================================================================${RESET}\n`);

if (failed > 0) {
    console.error(`${RED}🔴 فشل الاختبار! تم رصد ثغرات عزل غير معالجة في الوحدات الإرثية المؤجلة.${RESET}`);
    process.exit(1);
} else {
    console.log(`${GREEN}🟢 نجاح كافة اختبارات أمان الوحدات الإرثية المؤجلة بنسبة 100%! تم إغلاق فجوات العزل بالكامل.${RESET}`);
    process.exit(0);
}
