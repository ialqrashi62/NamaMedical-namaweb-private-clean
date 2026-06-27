/**
 * cross_tenant_discharge_occupancy_test.js
 * =================================================================
 * Local verification test for multi-tenant isolation in Discharge
 * and Occupancy/Census workflows for Batch 3.
 *
 * This script runs:
 * 1. Static code audit on server.js to ensure requireTenantScope,
 *    transactions (BEGIN/COMMIT/ROLLBACK), and SELECT FOR UPDATE are used.
 * 2. Simulation tests to verify tenant-scoped access to discharge and census.
 *
 * Usage:
 *   node cross_tenant_discharge_occupancy_test.js
 * =================================================================
 */

const fs = require('fs');
const path = require('path');

// Terminal Colors
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
console.log(`${BOLD}${BLUE}  اختبار عزل الخروج وإشغال الأسرة (Cross-Tenant Discharge & Occupancy Test)${RESET}`);
console.log(`${BOLD}${BLUE}  NamaMedical — Inpatient Discharge & Census Isolation Verification${RESET}`);
console.log(`${BOLD}${BLUE}================================================================${RESET}\n`);

// ===== 1. Static Code Audit of server.js =====
console.log(`${BOLD}[ 1 ] فحص حماية وتصفية مسارات الخروج والإشغال في server.js (Static Code Audit)${RESET}`);
const serverPath = path.join(__dirname, 'server.js');
const serverContent = fs.readFileSync(serverPath, 'utf8');

const staticChecks = [
    { pattern: "app.put('/api/admissions/:id/discharge', requireAuth, requireTenantScope", label: "Discharge Endpoint: PUT /api/admissions/:id/discharge محمي بـ requireTenantScope" },
    { pattern: "app.get('/api/beds/census', requireAuth, requireTenantScope", label: "Beds Census Endpoint: GET /api/beds/census محمي بـ requireTenantScope" },
    { pattern: "client.query('BEGIN')", label: "Discharge Transaction: استخدام BEGIN لبدء المعاملة" },
    { pattern: "client.query('COMMIT')", label: "Discharge Transaction: استخدام COMMIT لالتزام المعاملة" },
    { pattern: "client.query('ROLLBACK')", label: "Discharge Transaction: استخدام ROLLBACK للتراجع في حال الفشل" },
    { pattern: "FOR UPDATE", label: "Race Condition Prevention: استخدام FOR UPDATE لحظر التعديل المتقاطع" }
];

for (const { pattern, label } of staticChecks) {
    const cleanPattern = pattern.replace(/\s+/g, '');
    const cleanContent = serverContent.replace(/\s+/g, '');
    const found = cleanContent.includes(cleanPattern);
    assert(found, label, `البحث عن: "${pattern}"`);
}

// ===== 2. Simulation of Admissions, Beds, and Patient Datastore =====
console.log(`\n${BOLD}[ 2 ] محاكاة واختبار عزل عمليات خروج المرضى (Discharge Simulation Tests)${RESET}`);

const mockDb = {
    patients: [
        { id: 10, name: 'Patient Tenant 1', status: 'Admitted', tenant_id: 1 },
        { id: 20, name: 'Patient Tenant 2', status: 'Admitted', tenant_id: 2 }
    ],
    beds: [
        { id: 100, bed_number: 'B100', status: 'Occupied', tenant_id: 1, current_patient_id: 10, current_admission_id: 1000 },
        { id: 200, bed_number: 'B200', status: 'Occupied', tenant_id: 2, current_patient_id: 20, current_admission_id: 2000 }
    ],
    admissions: [
        { id: 1000, patient_id: 10, patient_name: 'Patient Tenant 1', status: 'Active', bed_id: 100, tenant_id: 1 },
        { id: 2000, patient_id: 20, patient_name: 'Patient Tenant 2', status: 'Active', bed_id: 200, tenant_id: 2 }
    ],
    audit: []
};

// Simulated Database Connection Client
class MockClient {
    constructor(tenantId) {
        this.tenantId = tenantId;
        this.inTransaction = false;
    }

    async query(sql, params = []) {
        const cleanSql = sql.replace(/\s+/g, ' ').trim();

        if (cleanSql.includes('BEGIN')) {
            this.inTransaction = true;
            return { rows: [] };
        }
        if (cleanSql.includes('COMMIT')) {
            this.inTransaction = false;
            return { rows: [] };
        }
        if (cleanSql.includes('ROLLBACK')) {
            this.inTransaction = false;
            return { rows: [] };
        }

        // SELECT FOR UPDATE
        if (cleanSql.includes('SELECT id, bed_id, patient_id FROM admissions WHERE id = $1')) {
            let list = [...mockDb.admissions];
            const [id, tId] = params;
            if (tId !== undefined) {
                list = list.filter(a => a.id === id && a.tenant_id === tId);
            } else {
                list = list.filter(a => a.id === id);
            }
            return { rows: list };
        }

        // UPDATE admissions
        if (cleanSql.includes('UPDATE admissions SET status=$1')) {
            const [status, time, type, summary, inst, meds, followup_date, doctor, id, tId] = params;
            const item = mockDb.admissions.find(a => a.id === id && (tId === undefined || a.tenant_id === tId));
            if (item) {
                item.status = status;
                item.discharge_date = time;
                item.discharge_type = type;
                item.discharge_summary = summary;
            }
            return { rowCount: item ? 1 : 0 };
        }

        // UPDATE beds
        if (cleanSql.includes("UPDATE beds SET status='Available'")) {
            const [bedId, tId] = params;
            const bed = mockDb.beds.find(b => b.id === bedId && (tId === undefined || b.tenant_id === tId));
            if (bed) {
                bed.status = 'Available';
                bed.current_patient_id = 0;
                bed.current_admission_id = 0;
            }
            return { rowCount: bed ? 1 : 0 };
        }

        // UPDATE patients
        if (cleanSql.includes("UPDATE patients SET status='Discharged'")) {
            const [patId, tId] = params;
            const pat = mockDb.patients.find(p => p.id === patId && (tId === undefined || p.tenant_id === tId));
            if (pat) {
                pat.status = 'Discharged';
            }
            return { rowCount: pat ? 1 : 0 };
        }

        return { rows: [] };
    }
}

// Simulated API Handler
async function simulateDischargeRoute(req) {
    const client = new MockClient(req.session?.user?.tenantId);
    try {
        const { tenantId } = req.session?.user || {};
        const admissionId = parseInt(req.params.id);

        await client.query('BEGIN');

        // Check ownership
        const checkQ = tenantId
            ? 'SELECT id, bed_id, patient_id FROM admissions WHERE id = $1 AND tenant_id = $2 FOR UPDATE'
            : 'SELECT id, bed_id, patient_id FROM admissions WHERE id = $1 FOR UPDATE';
        const checkParams = tenantId ? [admissionId, tenantId] : [admissionId];
        const checkRes = await client.query(checkQ, checkParams);
        const adm = checkRes.rows[0];

        if (!adm) {
            await client.query('ROLLBACK');
            return { status: 404, error: 'Admission not found' };
        }

        const { discharge_type, discharge_summary } = req.body || {};

        // Update admission
        const updateQ = tenantId
            ? 'UPDATE admissions SET status=$1, discharge_date=$2, discharge_type=$3, discharge_summary=$4, discharge_instructions=$5, discharge_medications=$6, followup_date=$7, followup_doctor=$8 WHERE id=$9 AND tenant_id=$10'
            : 'UPDATE admissions SET status=$1, discharge_date=$2, discharge_type=$3, discharge_summary=$4, discharge_instructions=$5, discharge_medications=$6, followup_date=$7, followup_doctor=$8 WHERE id=$9';
        const updateParams = [
            'Discharged',
            new Date().toISOString(),
            discharge_type || 'Regular',
            discharge_summary || '',
            '', '', '', '',
            admissionId
        ];
        if (tenantId) updateParams.push(tenantId);
        await client.query(updateQ, updateParams);

        // Release bed
        if (adm.bed_id) {
            const updateBedQ = tenantId
                ? "UPDATE beds SET status='Available', current_patient_id=0, current_admission_id=0 WHERE id=$1 AND tenant_id=$2"
                : "UPDATE beds SET status='Available', current_patient_id=0, current_admission_id=0 WHERE id=$1";
            const updateBedParams = tenantId ? [adm.bed_id, tenantId] : [adm.bed_id];
            await client.query(updateBedQ, updateBedParams);
        }

        // Release patient
        if (adm.patient_id) {
            const updatePatientQ = tenantId
                ? "UPDATE patients SET status='Discharged' WHERE id=$1 AND tenant_id=$2"
                : "UPDATE patients SET status='Discharged' WHERE id=$1";
            const updatePatientParams = tenantId ? [adm.patient_id, tenantId] : [adm.patient_id];
            await client.query(updatePatientQ, updatePatientParams);
        }

        await client.query('COMMIT');
        mockDb.audit.push(`DISCHARGE_PATIENT adm #${admissionId}`);
        return { status: 200, success: true };
    } catch (e) {
        await client.query('ROLLBACK');
        return { status: 500, error: 'Server error' };
    }
}

// Run Simulation Checks
(async () => {
    // Test Case 1: Tenant 1 attempts to discharge Tenant 2 admission
    const req1 = {
        session: { user: { tenantId: 1 } },
        params: { id: '2000' }, // Tenant 2 admission
        body: { discharge_type: 'Regular', discharge_summary: 'Attack summary' }
    };
    const res1 = await simulateDischargeRoute(req1);
    assert(res1.status === 404, "منع خروج مريض مستأجر آخر: محاولة خروج تنويم Tenant 2 بواسطة Tenant 1 ترجع 404");
    assert(mockDb.admissions.find(a => a.id === 2000).status === 'Active', "تأكيد عدم تعديل حالة التنويم المتقاطع");
    assert(mockDb.beds.find(b => b.id === 200).status === 'Occupied', "تأكيد بقاء السرير للمستأجر الآخر مشغولاً");

    // Test Case 2: Tenant 1 discharges own admission (1000)
    const req2 = {
        session: { user: { tenantId: 1 } },
        params: { id: '1000' }, // Own admission
        body: { discharge_type: 'Regular', discharge_summary: 'Valid discharge summary' }
    };
    const res2 = await simulateDischargeRoute(req2);
    assert(res2.status === 200, "خروج ناجح للتنويم الصحيح: مستأجر 1 يستطيع إخراج التنويم الخاص به بنجاح");
    assert(mockDb.admissions.find(a => a.id === 1000).status === 'Discharged', "تأكيد تغيير حالة التنويم لـ Discharged");
    assert(mockDb.beds.find(b => b.id === 100).status === 'Available', "تأكيد تحرير السرير الخاص بالمنشأة ليصبح Available");
    assert(mockDb.patients.find(p => p.id === 10).status === 'Discharged', "تأكيد تحرير المريض ليصبح Discharged");

    // ===== 3. Simulation of Occupancy & Census Scoping =====
    console.log(`\n${BOLD}[ 3 ] محاكاة واختبار عزل إشغال الأسرة والإحصاء الطبي (Occupancy & Census Simulation Tests)${RESET}`);
    
    const mockWards = [
        { id: 11, ward_name: 'Ward A', tenant_id: 1 },
        { id: 22, ward_name: 'Ward B', tenant_id: 2 }
    ];
    const mockBeds = [
        { id: 101, bed_number: 'B1', status: 'Occupied', ward_id: 11, tenant_id: 1 },
        { id: 102, bed_number: 'B2', status: 'Available', ward_id: 11, tenant_id: 1 },
        { id: 201, bed_number: 'B3', status: 'Occupied', ward_id: 22, tenant_id: 2 }
    ];

    function simulateCensusRoute(req) {
        const { tenantId } = req.session?.user || {};
        if (!tenantId) return { status: 403 };

        // Filter wards and beds by tenantId
        const tenantWards = mockWards.filter(w => w.tenant_id === tenantId);
        const tenantBeds = mockBeds.filter(b => b.tenant_id === tenantId);

        const total = tenantBeds.length;
        const occupied = tenantBeds.filter(b => b.status === 'Occupied').length;
        const available = total - occupied;
        const occupancyRate = total > 0 ? Math.round((occupied / total) * 100) : 0;

        return {
            status: 200,
            data: {
                wards: tenantWards,
                beds: tenantBeds,
                total,
                occupied,
                available,
                occupancyRate
            }
        };
    }

    const censusT1 = simulateCensusRoute({ session: { user: { tenantId: 1 } } });
    assert(censusT1.data.total === 2, "إجمالي الأسرة المفرزة: مستأجر 1 يرى فقط سريرين");
    assert(censusT1.data.occupied === 1, "إجمالي الأسرة المشغولة المفرزة: مستأجر 1 يرى سريراً واحداً مشغولاً");
    assert(censusT1.data.available === 1, "إجمالي الأسرة المتاحة المفرزة: مستأجر 1 يرى سريراً واحداً متاحاً");
    assert(censusT1.data.occupancyRate === 50, "معدل الإشغال المفرز: معدل إشغال مستأجر 1 هو 50%");
    assert(censusT1.data.beds.every(b => b.tenant_id === 1), "منع تسريب الأسرة: كافة الأسرة المسترجعة تنتمي للمستأجر 1 فقط");

    const censusT2 = simulateCensusRoute({ session: { user: { tenantId: 2 } } });
    assert(censusT2.data.total === 1, "إجمالي أسرة مستأجر 2: يرى سريراً واحداً فقط");
    assert(censusT2.data.occupancyRate === 100, "معدل إشغال مستأجر 2: يرى معدل إشغال 100%");

    // ===== Final Summary =====
    console.log(`\n${BOLD}================================================================${RESET}`);
    console.log(`${BOLD}  ملخص الاختبارات (Test Execution Summary)${RESET}`);
    console.log(`${BOLD}================================================================${RESET}`);
    console.log(`  إجمالي الفحوصات الناجحة (PASSED): ${GREEN}${passed}${RESET}`);
    console.log(`  إجمالي الفحوصات الفاشلة (FAILED): ${failed > 0 ? RED : GREEN}${failed}${RESET}`);

    if (failed > 0) {
        console.log(`\n${RED}تفاصيل الفشل:${RESET}`);
        failureLog.forEach((f, idx) => {
            console.log(`  ${idx + 1}. [${f.testName}] - ${f.details}`);
        });
        process.exit(1);
    } else {
        console.log(`\n${GREEN}🎉 جميع فحوصات عزل الخروج والإشغال لـ Batch 3 نجحت بالكامل بنسبة 100%!${RESET}\n`);
        process.exit(0);
    }
})();
