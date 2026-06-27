/**
 * cross_tenant_e4_radiology_test.js
 * ============================================================================
 * E4 — Radiology (RIS + PACS metadata) cross-tenant + behavior simulation test.
 * DB-free. Mirrors cross_tenant_lab_radiology_test.js style: in-memory mock-DB
 * simulation of the E4 handler logic to prove:
 *   - worklist transitions are tenant-scoped + forward-only + audited
 *   - report SIGN is FAIL-CLOSED when critical without documented notification
 *   - prior-compare returns ONLY signed priors within the same tenant + modality
 *   - DICOM study metadata is tenant-scoped; NO public image path (phi-files only)
 *   - MWL is GATED (RAD_MWL_ENABLED) and serves only local scheduled exams
 *   - cross-tenant + null-tenant access is denied (fail-closed)
 * Also runs the e4 migrations against a mock pg client to assert up/validate/down
 * are idempotent (re-running up twice is safe) and down is clean.
 *
 * Usage:  node cross_tenant_e4_radiology_test.js
 * ============================================================================
 */
'use strict';
const RED = '\x1b[31m', GREEN = '\x1b[32m', BLUE = '\x1b[34m', RESET = '\x1b[0m', BOLD = '\x1b[1m';
let passed = 0, failed = 0; const failLog = [];
function assert(cond, name, details = '') {
    if (cond) { console.log(`  ${GREEN}PASS${RESET} ${name}`); passed++; }
    else { console.log(`  ${RED}FAIL${RESET} ${name}${details ? ' | ' + details : ''}`); failed++; failLog.push(name); }
}
console.log(`\n${BOLD}${BLUE}E4 Radiology — Cross-Tenant + Critical Fail-Closed + Prior-Compare + Migration Idempotency${RESET}\n`);

// ============================================================================
// Mock DB shared by handler simulations
// ============================================================================
function freshDb() {
    return {
        seq: { exam: 100, report: 200, study: 300, notif: 400 },
        patients: [
            { id: 11, tenant_id: 1, name: 'P-T1' },
            { id: 22, tenant_id: 2, name: 'P-T2' },
        ],
        orders: [
            { id: 1, tenant_id: 1, is_radiology: 1, patient_id: 11, order_type: 'CT Brain' },
            { id: 2, tenant_id: 2, is_radiology: 1, patient_id: 22, order_type: 'MRI Knee' },
        ],
        rad_exams: [],
        rad_reports: [],
        dicom_studies: [],
        notifications: [],
        audit: [],
        // system_users has NO tenant_id; tenant linkage is via user_tenants (active)
        system_users: [
            { id: 9, role: 'Radiologist' },   // tenant1 radiologist
            { id: 7, role: 'Doctor' },         // tenant1 doctor
            { id: 8, role: 'Doctor' },         // tenant2 doctor
            { id: 5, role: 'Reception' },      // tenant1 reception (no radiology module)
        ],
        user_tenants: [
            { user_id: 9, tenant_id: 1, is_active: true },
            { user_id: 7, tenant_id: 1, is_active: true },
            { user_id: 8, tenant_id: 2, is_active: true },
            { user_id: 5, tenant_id: 1, is_active: true },
        ],
    };
}

// RBAC: report state-mutating endpoints admit only radiology/doctor (mirrors requireRole('radiology','doctor'))
const ROLE_PERMS = {
    Admin: '*',
    Doctor: ['doctor', 'radiology', 'lab', 'patients'],
    Radiologist: ['radiology'],
    Reception: ['patients', 'appointments', 'accounts'],
    Nurse: ['nursing', 'patients'],
    Finance: ['finance', 'invoices', 'accounts'],
};
function roleAllows(role, modules) {
    const perms = ROLE_PERMS[role];
    if (perms === '*') return true;
    return !!(perms && modules.some(m => perms.includes(m)));
}

// --- handler: schedule worklist exam (mirrors POST /api/radiology/worklist) ---
function hSchedule(db, tenantId, body) {
    if (!tenantId) return { status: 403 };                      // FAIL-CLOSED
    const order = db.orders.find(o => o.id === body.rad_order_id && o.is_radiology === 1 && o.tenant_id === tenantId);
    if (!order) return { status: 404 };                         // cross-tenant order -> 404
    const ex = { id: ++db.seq.exam, tenant_id: tenantId, rad_order_id: order.id, patient_id: order.patient_id, modality: body.modality || '', state: 'Scheduled' };
    db.rad_exams.push(ex); db.audit.push('CREATE_RAD_EXAM');
    return { status: 200, exam: ex };
}
const NEXT = { Scheduled: ['Arrived'], Arrived: ['InProgress'], InProgress: ['Completed'], Completed: ['Reported'], Reported: [] };
function hTransition(db, tenantId, examId, state) {
    if (!tenantId) return { status: 403 };                      // FAIL-CLOSED
    const ex = db.rad_exams.find(e => e.id === examId && e.tenant_id === tenantId);
    if (!ex) return { status: 404 };                            // cross-tenant -> 404
    if (state !== ex.state && !(NEXT[ex.state] || []).includes(state)) return { status: 400 }; // forward-only
    ex.state = state; db.audit.push('UPDATE_RAD_EXAM_STATE');
    return { status: 200, exam: ex };
}
// --- handler: create report draft ---
function hCreateReport(db, tenantId, body) {
    if (!tenantId) return { status: 403 };
    const ex = db.rad_exams.find(e => e.id === body.rad_exam_id && e.tenant_id === tenantId);
    if (!ex) return { status: 404 };
    if (body.prior_study_id) {
        const prior = db.rad_reports.find(r => r.id === body.prior_study_id && r.tenant_id === tenantId && r.status === 'Signed' && r.signed_at);
        if (!prior) return { status: 404 };                     // prior must be signed + same tenant
    }
    const r = { id: ++db.seq.report, tenant_id: tenantId, rad_exam_id: ex.id, patient_id: ex.patient_id, modality: ex.modality, impression: body.impression || '', birads: body.birads || '', is_critical: !!body.is_critical, critical_notified_at: null, status: 'Draft', signed_at: null };
    db.rad_reports.push(r); db.audit.push('CREATE_RAD_REPORT');
    return { status: 200, report: r };
}
// --- handler: critical notify (RBAC radiology/doctor; validates notified_doctor_id) ---
// role defaults to 'Radiologist' so prior callers (no role arg) stay valid; opts.notifiedDoctorId optional.
function hCriticalNotify(db, tenantId, reportId, note, role = 'Radiologist', opts = {}) {
    if (!roleAllows(role, ['radiology', 'doctor'])) return { status: 403 };   // RBAC
    if (!tenantId) return { status: 403 };
    const r = db.rad_reports.find(x => x.id === reportId && x.tenant_id === tenantId);
    if (!r) return { status: 404 };
    // Issue 2: validate notified_doctor_id is a REAL user linked to the session tenant (no dangling/foreign id)
    let target = (opts.notifiedDoctorId !== undefined && opts.notifiedDoctorId !== null) ? parseInt(opts.notifiedDoctorId, 10) : null;
    if (target !== null) {
        if (!Number.isInteger(target) || target <= 0) return { status: 400 };
        const u = db.system_users.find(su => su.id === target) &&
            db.user_tenants.find(ut => ut.user_id === target && ut.tenant_id === tenantId && ut.is_active);
        if (!u) return { status: 400 };
    }
    const n = target
        ? { id: ++db.seq.notif, user_id: target, type: 'critical', module: 'Radiology', record_id: reportId }
        : { id: ++db.seq.notif, target_role: 'Doctor', type: 'critical', module: 'Radiology', record_id: reportId };
    db.notifications.push(n);
    r.critical_notified_at = '2026-06-26T00:00:00'; r.critical_notify_ref = n.id;
    db.audit.push('RAD_CRITICAL_NOTIFY');
    return { status: 200, report: r, notif: n };
}
// --- handler: sign report (RBAC radiology/doctor; CRITICAL FAIL-CLOSED) ---
function hSign(db, tenantId, reportId, signerId, role = 'Radiologist') {
    if (!roleAllows(role, ['radiology', 'doctor'])) return { status: 403 };   // RBAC
    if (!tenantId) return { status: 403 };
    const r = db.rad_reports.find(x => x.id === reportId && x.tenant_id === tenantId);
    if (!r) return { status: 404 };
    if (r.status === 'Signed') return { status: 409 };
    if (r.is_critical && !r.critical_notified_at) return { status: 409, code: 'CRITICAL_NOTIFY_REQUIRED' }; // FAIL-CLOSED
    r.status = 'Signed'; r.signed_by = signerId; r.signed_at = '2026-06-26T01:00:00';
    const ex = db.rad_exams.find(e => e.id === r.rad_exam_id && e.tenant_id === tenantId);
    if (ex) ex.state = 'Reported';
    db.audit.push('SIGN_RAD_REPORT');
    return { status: 200, report: r };
}
// --- handler: addendum to a SIGNED report (RBAC radiology/doctor) ---
function hAddendum(db, tenantId, parentId, body = {}, role = 'Radiologist') {
    if (!roleAllows(role, ['radiology', 'doctor'])) return { status: 403 };   // RBAC
    if (!tenantId) return { status: 403 };
    const parent = db.rad_reports.find(x => x.id === parentId && x.tenant_id === tenantId && x.status === 'Signed');
    if (!parent) return { status: 404 };
    const r = { id: ++db.seq.report, tenant_id: tenantId, rad_exam_id: parent.rad_exam_id, patient_id: parent.patient_id, modality: parent.modality, status: 'Draft', addendum_of: parentId, signed_at: null };
    db.rad_reports.push(r); parent.status = 'Addended';
    db.audit.push('ADDENDUM_RAD_REPORT');
    return { status: 200, report: r };
}
// --- handler: prior compare (signed-only, tenant + modality) ---
function hPriors(db, tenantId, patientId, modality) {
    if (!tenantId) return { status: 403 };
    const rows = db.rad_reports.filter(r => r.tenant_id === tenantId && r.patient_id === patientId && r.status === 'Signed' && r.signed_at && (!modality || r.modality === modality));
    return { status: 200, rows };
}
// --- handler: register dicom study metadata (no bytes; stored_ref must be tenant phi_file) ---
function hRegisterStudy(db, tenantId, body, phiFiles) {
    if (!tenantId) return { status: 403 };
    let exam = null;
    if (body.rad_exam_id) { exam = db.rad_exams.find(e => e.id === body.rad_exam_id && e.tenant_id === tenantId); if (!exam) return { status: 404 }; }
    if (body.stored_ref) { const phi = (phiFiles || []).find(f => f.id === body.stored_ref && f.tenant_id === tenantId); if (!phi) return { status: 404 }; }
    const st = { id: ++db.seq.study, tenant_id: tenantId, rad_exam_id: body.rad_exam_id || null, study_uid: body.study_uid || '', accession: body.accession || '', stored_ref: body.stored_ref || null, source: 'manual' };
    db.dicom_studies.push(st); db.audit.push('REGISTER_DICOM_STUDY');
    return { status: 200, study: st };
}
// --- handler: MWL (gated) ---
function hMwl(db, tenantId, mwlEnabled) {
    if (!mwlEnabled) return { status: 503, gated: true };
    if (!tenantId) return { status: 403 };
    const rows = db.rad_exams.filter(e => e.tenant_id === tenantId && ['Scheduled', 'Arrived'].includes(e.state));
    return { status: 200, worklist: rows };
}

// ============================================================================
// [1] Worklist: tenant scope, IDOR, forward-only transitions, fail-closed
// ============================================================================
console.log(`${BOLD}[1] RIS Worklist isolation + state machine${RESET}`);
{
    const db = freshDb();
    assert(hSchedule(db, null, { rad_order_id: 1 }).status === 403, 'schedule with null tenant -> 403 (fail-closed)');
    assert(hSchedule(db, 1, { rad_order_id: 2 }).status === 404, 'tenant1 cannot schedule tenant2 order -> 404 (IDOR)');
    const ok = hSchedule(db, 1, { rad_order_id: 1, modality: 'CT' });
    assert(ok.status === 200 && ok.exam.tenant_id === 1, 'tenant1 schedules own order, tenant stamped');
    const examId = ok.exam.id;
    assert(hTransition(db, 2, examId, 'Arrived').status === 404, 'tenant2 cannot transition tenant1 exam -> 404');
    assert(hTransition(db, 1, examId, 'Completed').status === 400, 'illegal skip Scheduled->Completed -> 400 (forward-only)');
    assert(hTransition(db, 1, examId, 'Arrived').status === 200, 'Scheduled->Arrived ok');
    assert(hTransition(db, 1, examId, 'InProgress').status === 200, 'Arrived->InProgress ok');
    assert(hTransition(db, null, examId, 'Completed').status === 403, 'transition with null tenant -> 403 (fail-closed)');
    assert(db.audit.filter(a => a === 'UPDATE_RAD_EXAM_STATE').length === 2, 'state transitions audited');
}

// ============================================================================
// [2] CRITICAL report sign FAIL-CLOSED (no final without notification)
// ============================================================================
console.log(`\n${BOLD}[2] Critical-result fail-closed signing${RESET}`);
{
    const db = freshDb();
    const ex = hSchedule(db, 1, { rad_order_id: 1, modality: 'CT' }).exam;
    // non-critical report can sign immediately
    const r1 = hCreateReport(db, 1, { rad_exam_id: ex.id, impression: 'normal', is_critical: false }).report;
    assert(hSign(db, 1, r1.id, 9).status === 200, 'non-critical report signs without notification');
    // critical report cannot sign without notification
    const ex2 = hSchedule(db, 1, { rad_order_id: 1, modality: 'CT' }).exam;
    const r2 = hCreateReport(db, 1, { rad_exam_id: ex2.id, impression: 'mass', is_critical: true }).report;
    const blocked = hSign(db, 1, r2.id, 9);
    assert(blocked.status === 409 && blocked.code === 'CRITICAL_NOTIFY_REQUIRED', 'CRITICAL report sign BLOCKED before notification (fail-closed)');
    assert(r2.status === 'Draft', 'blocked critical report stays Draft (not finalized)');
    // after documenting notification, sign succeeds
    const notif = hCriticalNotify(db, 1, r2.id, 'called Dr. X');
    assert(notif.status === 200 && db.notifications.some(n => n.type === 'critical'), 'critical notification documented (type=critical)');
    const signed = hSign(db, 1, r2.id, 9);
    assert(signed.status === 200 && r2.status === 'Signed', 'CRITICAL report signs AFTER notification documented');
    assert(db.rad_exams.find(e => e.id === ex2.id).state === 'Reported', 'signing advances exam to Reported');
    // cross-tenant cannot notify/sign
    assert(hCriticalNotify(db, 2, r2.id, 'x').status === 404, 'tenant2 cannot notify tenant1 report -> 404');
    assert(hSign(db, 2, r2.id, 9).status === 404, 'tenant2 cannot sign tenant1 report -> 404');
}

// ============================================================================
// [3] Prior-compare: signed priors only, tenant + modality scoped
// ============================================================================
console.log(`\n${BOLD}[3] Prior-compare (signed-only, tenant-scoped)${RESET}`);
{
    const db = freshDb();
    const ex = hSchedule(db, 1, { rad_order_id: 1, modality: 'CT' }).exam;
    // a DRAFT (unsigned) report must NOT appear as a prior
    hCreateReport(db, 1, { rad_exam_id: ex.id, impression: 'draft-old', is_critical: false });
    // a SIGNED report should appear
    const exB = hSchedule(db, 1, { rad_order_id: 1, modality: 'CT' }).exam;
    const rB = hCreateReport(db, 1, { rad_exam_id: exB.id, impression: 'signed-old', is_critical: false }).report;
    hSign(db, 1, rB.id, 9);
    // a tenant2 signed report for a different patient must NOT leak
    const ex2 = hSchedule(db, 2, { rad_order_id: 2, modality: 'CT' }).exam;
    const r2 = hCreateReport(db, 2, { rad_exam_id: ex2.id, impression: 't2-secret', is_critical: false }).report;
    hSign(db, 2, r2.id, 9);

    const priors = hPriors(db, 1, 11, 'CT');
    assert(priors.rows.length === 1 && priors.rows[0].impression === 'signed-old', 'priors return ONLY signed reports (draft excluded)');
    assert(!priors.rows.some(p => p.impression === 't2-secret'), 'priors do NOT leak other-tenant reports');
    assert(hPriors(db, 1, 11, 'MRI').rows.length === 0, 'priors filtered by modality');
    assert(hPriors(db, null, 11, 'CT').status === 403, 'priors with null tenant -> 403 (fail-closed)');
    // creating a report that references an UNSIGNED prior is rejected
    const draftPrior = db.rad_reports.find(r => r.impression === 'draft-old');
    assert(hCreateReport(db, 1, { rad_exam_id: ex.id, prior_study_id: draftPrior.id }).status === 404, 'cannot reference an unsigned prior -> 404');
}

// ============================================================================
// [4] DICOM study metadata: tenant-scoped, no public path, phi-files ref only
// ============================================================================
console.log(`\n${BOLD}[4] DICOM study metadata isolation (no bytes / no public path)${RESET}`);
{
    const db = freshDb();
    const phiFiles = [{ id: 555, tenant_id: 1 }, { id: 666, tenant_id: 2 }];
    const ex = hSchedule(db, 1, { rad_order_id: 1, modality: 'CT' }).exam;
    assert(hRegisterStudy(db, null, { rad_exam_id: ex.id }, phiFiles).status === 403, 'register study null tenant -> 403');
    assert(hRegisterStudy(db, 2, { rad_exam_id: ex.id }, phiFiles).status === 404, 'tenant2 cannot register study on tenant1 exam -> 404');
    const ok = hRegisterStudy(db, 1, { rad_exam_id: ex.id, study_uid: '1.2.3', accession: 'ACC1', stored_ref: 555 }, phiFiles);
    assert(ok.status === 200 && ok.study.tenant_id === 1 && ok.study.source === 'manual', 'tenant1 registers metadata only (manual source)');
    // a stored_ref pointing at another tenant's phi_file is rejected
    assert(hRegisterStudy(db, 1, { rad_exam_id: ex.id, stored_ref: 666 }, phiFiles).status === 404, 'cross-tenant phi_files stored_ref rejected -> 404');
}

// ============================================================================
// [5] MWL gated (no external connection) + tenant-scoped
// ============================================================================
console.log(`\n${BOLD}[5] MWL gated${RESET}`);
{
    const db = freshDb();
    hSchedule(db, 1, { rad_order_id: 1, modality: 'CT' });
    assert(hMwl(db, 1, false).status === 503, 'MWL disabled by default -> 503 (gated)');
    const en = hMwl(db, 1, true);
    assert(en.status === 200 && en.worklist.every(e => e.tenant_id === 1), 'MWL when enabled serves only tenant1 local scheduled exams');
    assert(hMwl(db, null, true).status === 403, 'MWL enabled but null tenant -> 403 (fail-closed)');
}

// ============================================================================
// [7] RBAC on report state-mutating endpoints + notified_doctor_id validation
// ============================================================================
console.log(`\n${BOLD}[7] RBAC (radiology/doctor only) + notified_doctor_id validation${RESET}`);
{
    const db = freshDb();
    const ex = hSchedule(db, 1, { rad_order_id: 1, modality: 'CT' }).exam;
    const rep = hCreateReport(db, 1, { rad_exam_id: ex.id, impression: 'mass', is_critical: true }).report;

    // --- non-radiology / non-doctor roles are DENIED (403) on critical-notify / sign / addendum ---
    ['Reception', 'Nurse', 'Finance'].forEach(role => {
        assert(hCriticalNotify(db, 1, rep.id, 'x', role).status === 403, `${role} cannot critical-notify -> 403`);
        assert(hSign(db, 1, rep.id, 9, role).status === 403, `${role} cannot sign -> 403`);
        assert(hAddendum(db, 1, rep.id, {}, role).status === 403, `${role} cannot addendum -> 403`);
    });
    // report stayed Draft + unnotified after all denied attempts (no side effects)
    assert(rep.status === 'Draft' && !rep.critical_notified_at, 'denied roles produced no state change');

    // --- radiologist / doctor are ALLOWED ---
    assert(hCriticalNotify(db, 1, rep.id, 'called', 'Radiologist').status === 200, 'Radiologist CAN critical-notify -> 200');
    assert(hSign(db, 1, rep.id, 9, 'Doctor').status === 200, 'Doctor CAN sign -> 200');
    assert(hAddendum(db, 1, rep.id, {}, 'Radiologist').status === 200, 'Radiologist CAN addendum a signed report -> 200');

    // --- notified_doctor_id validation: real tenant user accepted, foreign/non-existent rejected/dropped ---
    const db2 = freshDb();
    const ex2 = hSchedule(db2, 1, { rad_order_id: 1, modality: 'CT' }).exam;
    const rep2 = hCreateReport(db2, 1, { rad_exam_id: ex2.id, impression: 'mass', is_critical: true }).report;
    // valid tenant1 user (id 7 Doctor) -> notification carries that user_id
    const okN = hCriticalNotify(db2, 1, rep2.id, 'call', 'Radiologist', { notifiedDoctorId: 7 });
    assert(okN.status === 200 && okN.notif.user_id === 7, 'valid notified_doctor_id used as notification user_id');
    // non-existent user id -> 400 (no dangling user_id inserted)
    const rep3 = hCreateReport(db2, 1, { rad_exam_id: ex2.id, impression: 'mass2', is_critical: true }).report;
    const bad = hCriticalNotify(db2, 1, rep3.id, 'call', 'Radiologist', { notifiedDoctorId: 99999 });
    assert(bad.status === 400, 'non-existent notified_doctor_id rejected -> 400');
    // foreign-tenant user (id 8 belongs to tenant2) -> rejected for tenant1 session (no cross-tenant leak)
    const foreign = hCriticalNotify(db2, 1, rep3.id, 'call', 'Radiologist', { notifiedDoctorId: 8 });
    assert(foreign.status === 400, 'foreign-tenant notified_doctor_id rejected -> 400');
    // confirm NO dangling/foreign user_id ever made it into notifications: every user_id is a real active tenant1 user
    assert(db2.notifications.every(n => !n.user_id || db2.user_tenants.some(ut => ut.user_id === n.user_id && ut.tenant_id === 1 && ut.is_active)),
        'no dangling/foreign user_id in notifications (every user_id is a real active tenant1 user)');
}

// ============================================================================
// [6] Migration idempotency (up x2 safe, validate ok, down clean) via mock pg
// ============================================================================
console.log(`\n${BOLD}[6] Migration idempotency (mock pg)${RESET}`);
async function runMigrationIdempotency() {
    // mock pg client that emulates IF NOT EXISTS / DROP IF EXISTS semantics on a tiny catalog
    function mockClient() {
        const cat = { tables: new Set(), policies: new Set(), indexes: new Set(), rls: {}, force: {}, cols: {} };
        return {
            cat,
            query: async (sql, params) => {
                const q = String(sql).replace(/\s+/g, ' ').trim();
                let mm;
                if ((mm = q.match(/CREATE TABLE IF NOT EXISTS (\w+)/i))) {
                    cat.tables.add(mm[1]);
                    cat.cols[mm[1]] = /tenant_id +INTEGER NOT NULL/i.test(q);
                    return { rows: [] };
                }
                if ((mm = q.match(/ALTER TABLE (\w+) ENABLE ROW LEVEL SECURITY/i))) { cat.rls[mm[1]] = true; return { rows: [] }; }
                if ((mm = q.match(/ALTER TABLE (\w+) FORCE ROW LEVEL SECURITY/i))) { cat.force[mm[1]] = true; return { rows: [] }; }
                if ((mm = q.match(/ALTER TABLE IF EXISTS (\w+) NO FORCE/i))) { cat.force[mm[1]] = false; return { rows: [] }; }
                if ((mm = q.match(/ALTER TABLE IF EXISTS (\w+) DISABLE ROW LEVEL SECURITY/i))) { cat.rls[mm[1]] = false; return { rows: [] }; }
                if ((mm = q.match(/DROP POLICY IF EXISTS (\w+) ON (\w+)/i))) { cat.policies.delete(mm[1]); return { rows: [] }; }
                if ((mm = q.match(/CREATE POLICY (\w+) ON (\w+)/i))) { cat.policies.add(mm[1]); return { rows: [] }; }
                if ((mm = q.match(/CREATE INDEX IF NOT EXISTS (\w+)/i))) { cat.indexes.add(mm[1]); return { rows: [] }; }
                if ((mm = q.match(/DROP INDEX IF EXISTS (\w+)/i))) { cat.indexes.delete(mm[1]); return { rows: [] }; }
                if ((mm = q.match(/DROP TABLE IF EXISTS (\w+)/i))) { cat.tables.delete(mm[1]); delete cat.rls[mm[1]]; delete cat.force[mm[1]]; return { rows: [] }; }
                if (/DO \$\$/i.test(q)) return { rows: [] }; // constraint add block -> no-op in mock
                if (/ALTER TABLE IF EXISTS \w+ DROP CONSTRAINT/i.test(q)) return { rows: [] };
                // validate() reads:
                if ((mm = q.match(/to_regclass\('public\.(\w+)'\)/i))) return { rows: [{ reg: cat.tables.has(mm[1]) ? mm[1] : null }] };
                if (/information_schema\.columns/i.test(q) && /column_name='tenant_id'/.test(q)) {
                    const tbl = params && params[0]; return { rows: cat.tables.has(tbl) && cat.cols[tbl] ? [{ is_nullable: 'NO' }] : (cat.tables.has(tbl) ? [{ is_nullable: 'YES' }] : []) };
                }
                if (/information_schema\.columns/i.test(q)) { return { rows: [{ column_name: 'critical_notified_at' }] }; }
                if (/pg_class WHERE relname/i.test(q)) { const tbl = params && params[0]; return { rows: cat.tables.has(tbl) ? [{ relrowsecurity: !!cat.rls[tbl], relforcerowsecurity: !!cat.force[tbl] }] : [] }; }
                if (/pg_policy WHERE polname/i.test(q)) { const pn = params && params[0]; return { rows: cat.policies.has(pn) ? [{ polname: pn }] : [] }; }
                if (/pg_indexes WHERE tablename/i.test(q)) { const want = q.match(/indexname='(\w+)'/i); return { rows: (want && cat.indexes.has(want[1])) ? [{ indexname: want[1] }] : [] }; }
                return { rows: [] };
            }
        };
    }
    const mods = [
        require('./migrations/e4_01_rad_worklist_up_validate_down.js'),
        require('./migrations/e4_02_dicom_studies_up_validate_down.js'),
        require('./migrations/e4_03_rad_reports_up_validate_down.js'),
    ];
    for (const mod of mods) {
        const c = mockClient();
        await mod.up(c);
        await mod.up(c); // re-run: must not throw (idempotent)
        const v = await mod.validate(c);
        assert(v.ok === true, `${mod.TABLE} up x2 + validate ok`, JSON.stringify(v));
        await mod.down(c);
        assert(!c.cat.tables.has(mod.TABLE) && !c.cat.policies.has(mod.POLICY), `${mod.TABLE} down removes table + policy`);
        assert(c.cat.indexes.size === 0, `${mod.TABLE} down drops its own indexes`);
    }
}

runMigrationIdempotency().then(() => {
    console.log(`\n${BOLD}${BLUE}=========================================${RESET}`);
    console.log(`  ${GREEN}PASS${RESET}: ${passed}   ${RED}FAIL${RESET}: ${failed}`);
    if (failLog.length) { console.log(`\n${RED}Failed:${RESET}`); failLog.forEach(f => console.log('  - ' + f)); }
    if (failed === 0) console.log(`\n${BOLD}${GREEN}All E4 cross-tenant + behavior + migration tests passed.${RESET}\n`);
    process.exit(failed ? 1 : 0);
}).catch(err => { console.error(err); process.exit(1); });
