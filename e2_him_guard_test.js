/**
 * e2_him_guard_test.js — static assertions for E2 (Medical Records / HIM).
 * No DB / no HTTP / no PHI. Run: node e2_him_guard_test.js
 *
 * Asserts:
 *   - server endpoints exist, are auth+RBAC+tenant-scope guarded
 *   - longitudinal record access is logged (record_access_log) + audited
 *   - coding stamps tenant_id from session (not body) + FORCE-RLS migration canonical
 *   - ROI workflow states + RBAC + audit
 *   - break-glass requires reason + raises BREAK_GLASS alert
 *   - migrations follow the canonical FORCE-RLS template + are idempotent (up/down/validate)
 *   - client screen wired with tr()+escapeHTML+safeId; app.js not broken
 */
const fs = require('fs');
const path = require('path');
const ROOT = __dirname;
const server = fs.readFileSync(path.join(ROOT, 'server.js'), 'utf8');
const app = fs.readFileSync(path.join(ROOT, 'public', 'js', 'app.js'), 'utf8');
const mig = (n) => fs.readFileSync(path.join(ROOT, 'migrations', n), 'utf8');

let pass = 0, fail = 0;
const ok = (c, m) => { if (c) { pass++; console.log('  PASS', m); } else { fail++; console.log('  FAIL', m); } };

console.log('\n=== [1] ROLE / RBAC ===');
ok(/'HIM':\s*\[/.test(server), 'HIM role added to ROLE_PERMISSIONS');
ok(/'him',\s*'medical-records'/.test(server), "Doctor/HIM granted 'him' + 'medical-records' modules");

console.log('\n=== [2] LONGITUDINAL RECORD ENDPOINT (access-logged) ===');
ok(server.includes("app.get('/api/him/record/:patientId', requireAuth, requireRole('him', 'medical-records'), requireTenantScope"), 'GET /api/him/record/:patientId auth+RBAC+tenant-scope guarded');
ok(/INSERT INTO record_access_log[\s\S]{0,200}'normal'/.test(server), 'every record open writes record_access_log (normal)');
ok(/'VIEW_RECORD'/.test(server), 'record open raises VIEW_RECORD audit');
ok(/Patient not found/.test(server) && /FROM patients WHERE id=\$1 AND tenant_id=\$2/.test(server), 'patient verified within tenant via explicit predicate (fail-closed 404)');
ok(/_himPushSource/.test(server) && /table may not exist yet/.test(server), 'aggregation degrades gracefully for optional tables (problems/clinical_notes/coding)');
ok(/FROM problems WHERE patient_id/.test(server) && /FROM clinical_notes WHERE patient_id/.test(server), 'aggregates E1 problems + clinical_notes');
ok(/FROM medical_records WHERE patient_id/.test(server) && /FROM prescriptions WHERE patient_id/.test(server) && /FROM lab_radiology_orders/.test(server), 'aggregates records + prescriptions + lab/rad');

console.log('\n=== [3] CODING ENDPOINT ===');
ok(server.includes("app.post('/api/him/coding', requireAuth, requireRole('him', 'medical-records'), requireTenantScope"), 'POST /api/him/coding guarded');
ok(server.includes("app.get('/api/him/coding', requireAuth, requireRole('him', 'medical-records'), requireTenantScope"), 'GET /api/him/coding guarded');
ok(/INSERT INTO coding \(tenant_id, facility_id, patient_id/.test(server), 'coding INSERT stamps tenant_id first column');
ok(/\[tenantId, facilityId[\s\S]{0,160}cs, String\(code\)/.test(server), 'tenant_id from session (getRequestTenantContext), not from body');
ok(/'ADD_CODING'/.test(server), 'coding add audited (ADD_CODING)');
ok(server.includes("app.get('/api/him/deficiencies'"), 'deficiencies endpoint exists');
ok(/unsigned_record/.test(server) && /missing_coding/.test(server), 'deficiencies flag unsigned records + missing coding');

console.log('\n=== [4] ROI WORKFLOW ===');
ok(server.includes("app.post('/api/him/roi', requireAuth, requireRole('him', 'medical-records'), requireTenantScope"), 'POST /api/him/roi guarded');
ok(server.includes("app.put('/api/him/roi/:id', requireAuth, requireRole('him', 'medical-records'), requireTenantScope"), 'PUT /api/him/roi/:id guarded');
ok(/INSERT INTO roi_requests \(tenant_id, facility_id, patient_id/.test(server), 'ROI INSERT stamps tenant_id first');
ok(/Only pending requests can be approved/.test(server) && /Only approved requests can be released/.test(server), 'ROI state machine enforced (pending->approved->released)');
ok(/'ROI_REQUEST'/.test(server) && /'ROI_APPROVE'/.test(server) && /'ROI_DENY'/.test(server) && /'ROI_RELEASE'/.test(server), 'ROI actions audited');

console.log('\n=== [5] ACCESS LOG + BREAK-GLASS ===');
ok(server.includes("app.get('/api/him/access-log', requireAuth, requireRole('him', 'medical-records'), requireTenantScope"), 'GET /api/him/access-log guarded');
ok(server.includes("app.post('/api/him/break-glass', requireAuth, requireRole('him', 'medical-records'), requireTenantScope"), 'POST /api/him/break-glass guarded');
ok(/Break-glass reason required/.test(server), 'break-glass requires a reason (400 otherwise)');
ok(/access_type[\s\S]{0,60}'break_glass'/.test(server) || /'break_glass',\$5/.test(server), 'break-glass writes break_glass access row');
ok(/'BREAK_GLASS'/.test(server), 'break-glass raises BREAK_GLASS audit alert');

console.log('\n=== [6] MIGRATIONS — FORCE RLS canonical + idempotent ===');
const upFiles = ['e2_01_coding_up.sql', 'e2_02_roi_up.sql', 'e2_03_record_access_up.sql'];
const tables = { 'e2_01_coding_up.sql': 'coding', 'e2_02_roi_up.sql': 'roi_requests', 'e2_03_record_access_up.sql': 'record_access_log' };
for (const f of upFiles) {
  const s = mig(f); const t = tables[f];
  ok(s.includes('CANDIDATE ONLY'), `${f}: CANDIDATE-ONLY banner`);
  ok(new RegExp(`CREATE TABLE IF NOT EXISTS ${t}`).test(s), `${f}: CREATE TABLE IF NOT EXISTS ${t} (idempotent)`);
  ok(/tenant_id INTEGER NOT NULL REFERENCES tenants\(id\)/.test(s), `${f}: tenant_id NOT NULL FK -> tenants(id)`);
  ok(new RegExp(`ALTER TABLE ${t} ENABLE ROW LEVEL SECURITY`).test(s) && new RegExp(`ALTER TABLE ${t} FORCE ROW LEVEL SECURITY`).test(s), `${f}: ENABLE + FORCE RLS`);
  ok(s.includes("USING (tenant_id = NULLIF(current_setting('app.tenant_id', true), '')::integer)"), `${f}: canonical fail-closed USING policy`);
  ok(s.includes("WITH CHECK (tenant_id = NULLIF(current_setting('app.tenant_id', true), '')::integer)"), `${f}: canonical fail-closed WITH CHECK policy`);
  ok(new RegExp(`DROP POLICY IF EXISTS rls_${t}_tenant_isolation`).test(s), `${f}: DROP POLICY IF EXISTS (idempotent)`);
  ok(new RegExp(`CREATE INDEX IF NOT EXISTS idx_${t}_tenant_id`).test(s), `${f}: tenant_id index (idempotent)`);
}
for (const f of upFiles) {
  const down = f.replace('_up.sql', '_down.sql');
  const val = f.replace('_up.sql', '_validate.sql');
  ok(fs.existsSync(path.join(ROOT, 'migrations', down)), `${down} exists`);
  ok(fs.existsSync(path.join(ROOT, 'migrations', val)), `${val} exists`);
  ok(/DROP TABLE IF EXISTS/.test(mig(down)), `${down}: idempotent DROP TABLE IF EXISTS`);
  ok(/relforcerowsecurity/.test(mig(val)), `${val}: validates FORCE RLS`);
}
// CHECK constraints present
ok(/code_system IN \('ICD10', 'SNOMED', 'CPT'\)/.test(mig('e2_01_coding_up.sql')), 'coding: code_system CHECK (ICD10/SNOMED/CPT)');
ok(/status IN \('pending', 'approved', 'released', 'denied'\)/.test(mig('e2_02_roi_up.sql')), 'roi: status CHECK');
ok(/access_type IN \('normal', 'break_glass'\)/.test(mig('e2_03_record_access_up.sql')), 'record_access_log: access_type CHECK');

console.log('\n=== [7] CLIENT (app.js) ===');
ok(/viewLongitudinalRecord/.test(app), 'longitudinal record viewer wired');
ok(/'\/api\/him\/record\/'/.test(app), 'client calls GET /api/him/record');
ok(/breakGlassRecord/.test(app) && /Break-glass requires a reason/.test(app), 'break-glass UI requires reason');
ok(/window\.addCoding/.test(app) && /window\.createROI/.test(app) && /window\.actROI/.test(app), 'coding + ROI client handlers present');
ok(/isHimAdmin/.test(app) && /mrTab === 'access'/.test(app), 'access-log tab gated to Admin/HIM');
ok(/escapeHTML\(/.test(app.slice(app.indexOf('viewLongitudinalRecord'))), 'longitudinal viewer escapes PHI (escapeHTML)');
ok(/safeId\(/.test(app.slice(app.indexOf('renderMedicalRecords'))), 'HIM screen uses safeId for ids');
ok(/window\.submitMRRequest/.test(app) && /window\.updateMRRequest/.test(app), 'legacy MR request handlers preserved (no regression)');

console.log('\n=== [8] DEFENSE-IN-DEPTH: explicit tenant_id predicate on EVERY HIM read/update (reviewer fixes) ===');
// CRIT-1: every longitudinal sub-query binds tenant_id=$2
ok(/FROM visits WHERE patient_id=\$1 AND tenant_id=\$2/.test(server), 'CRIT-1 visits sub-query tenant_id=$2');
ok(/FROM visit_lifecycle WHERE patient_id=\$1 AND tenant_id=\$2/.test(server), 'CRIT-1 visit_lifecycle sub-query tenant_id=$2');
ok(/FROM problems WHERE patient_id=\$1 AND tenant_id=\$2/.test(server), 'CRIT-1 problems sub-query tenant_id=$2');
ok(/FROM clinical_notes WHERE patient_id=\$1 AND tenant_id=\$2/.test(server), 'CRIT-1 clinical_notes sub-query tenant_id=$2');
ok(/FROM medical_records WHERE patient_id=\$1 AND tenant_id=\$2/.test(server), 'CRIT-1 medical_records sub-query tenant_id=$2');
ok((server.match(/FROM lab_radiology_orders WHERE patient_id=\$1 AND tenant_id=\$2/g) || []).length === 2, 'CRIT-1 lab + radiology sub-queries tenant_id=$2');
ok(/FROM prescriptions WHERE patient_id=\$1 AND tenant_id=\$2/.test(server), 'CRIT-1 prescriptions sub-query tenant_id=$2');
ok(/FROM coding WHERE patient_id=\$1 AND tenant_id=\$2/.test(server), 'CRIT-1 coding sub-query tenant_id=$2');
ok(/_himPushSource\(events,[^\n]+\[pid, tenantId\]/.test(server), 'CRIT-1 tenantId passed as a parameter to _himPushSource');
// CRIT-1 fail-closed + CORR-2 LIMIT 500
ok(/if \(!tenantId\) return res\.status\(403\)\.json\(\{ error: 'Tenant scope required' \}\);[\s\S]{0,400}FROM patients WHERE id=\$1 AND tenant_id=\$2/.test(server), 'CRIT-1 record view fail-closed on null tenant (403, no unfiltered sub-queries)');
ok((server.match(/ORDER BY id DESC LIMIT 500/g) || []).length >= 3, 'CORR-2 default LIMIT 500 on unbounded HIM lists');
// CRIT-2 ROI list
ok(/SELECT \* FROM roi_requests WHERE tenant_id=\$1 ORDER BY id DESC LIMIT 500/.test(server), 'CRIT-2 GET /him/roi tenant_id=$1 + LIMIT');
// CRIT-3 access-log list
ok(/FROM record_access_log WHERE ' \+ where\.join/.test(server) && /where = \['tenant_id=\$1'\]/.test(server.slice(server.indexOf('/api/him/access-log'))), 'CRIT-3 GET /him/access-log tenant_id=$1 always');
// CRIT-4 ROI mutation: SELECT + all 3 UPDATEs tenant-bound
ok(/SELECT id, status, requested_by FROM roi_requests WHERE id=\$1 AND tenant_id=\$2/.test(server), 'CRIT-4 ROI PUT SELECT tenant-bound');
ok((server.match(/UPDATE roi_requests SET[\s\S]*?AND tenant_id=\$\d RETURNING \*/g) || []).length === 3, 'CRIT-4 all 3 ROI UPDATEs tenant-bound');
// IMP-1 coding GET
ok(/where = \['tenant_id=\$1'\]/.test(server.slice(server.indexOf('/api/him/coding'))), 'IMP-1 GET /him/coding tenant_id=$1 always');
// IMP-2 deficiencies
ok(/FROM medical_records WHERE tenant_id=\$1 AND COALESCE\(emr_status/.test(server), 'IMP-2 deficiencies unsigned tenant-scoped');
ok(/mr\.tenant_id=\$1 AND NOT EXISTS \(SELECT 1 FROM coding c WHERE c\.patient_id = mr\.patient_id AND c\.tenant_id=\$1\)/.test(server), 'IMP-2 deficiencies uncoded tenant-scoped both sides');
// IMP-3 audit fail-closed
ok(/record_access_log insert FAILED[\s\S]{0,400}return res\.status\(500\)\.json\(\{ error: 'Access could not be logged/.test(server), 'IMP-3 record view fails CLOSED if access-log write fails (500)');
ok(/'VIEW_RECORD_AUDIT_FAIL'/.test(server), 'IMP-3 failed-to-log access raises a loud audit_trail entry');
// IMP-4 self-approval
ok(/action === 'approve' && cur\.requested_by === actor\.id\) return res\.status\(403\)\.json\(\{ error: 'Cannot self-approve ROI request' \}\)/.test(server), 'IMP-4 ROI self-approval blocked (403)');
// IMP-5 strict server-side role gate
ok(/function isHimOrAdmin\(req\)[\s\S]{0,120}role === 'HIM' \|\| role === 'Admin'/.test(server), 'IMP-5 isHimOrAdmin strict (HIM/Admin only, not broad module)');
ok(/access-log[\s\S]{0,200}if \(!isHimOrAdmin\(req\)\) return res\.status\(403\)/.test(server), 'IMP-5 access-log strict server-side role gate');
ok(/break-glass[\s\S]{0,200}if \(!isHimOrAdmin\(req\)\) return res\.status\(403\)/.test(server), 'IMP-5 break-glass strict server-side role gate');

console.log('\n=== [9] MIGRATIONS — down DROP INDEX IF EXISTS (CORR-3) ===');
ok(/DROP INDEX IF EXISTS idx_coding_tenant_id/.test(mig('e2_01_coding_down.sql')) && /DROP INDEX IF EXISTS idx_coding_patient_id/.test(mig('e2_01_coding_down.sql')) && /DROP INDEX IF EXISTS idx_coding_encounter_ref/.test(mig('e2_01_coding_down.sql')), 'CORR-3 coding down drops all 3 indexes');
ok(/DROP INDEX IF EXISTS idx_roi_requests_tenant_id/.test(mig('e2_02_roi_down.sql')) && /DROP INDEX IF EXISTS idx_roi_requests_patient_id/.test(mig('e2_02_roi_down.sql')) && /DROP INDEX IF EXISTS idx_roi_requests_status/.test(mig('e2_02_roi_down.sql')), 'CORR-3 roi down drops all 3 indexes');
ok(/DROP INDEX IF EXISTS idx_record_access_log_tenant_id/.test(mig('e2_03_record_access_down.sql')) && /DROP INDEX IF EXISTS idx_record_access_log_patient_id/.test(mig('e2_03_record_access_down.sql')) && /DROP INDEX IF EXISTS idx_record_access_log_at/.test(mig('e2_03_record_access_down.sql')), 'CORR-3 record_access_log down drops all 3 indexes');

console.log(`\n${fail === 0 ? 'ALL PASS' : 'FAILURES'}: ${pass} passed, ${fail} failed`);
process.exit(fail === 0 ? 0 : 1);
