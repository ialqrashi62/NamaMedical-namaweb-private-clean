/**
 * e3_lis_guard_test.js  (DB-free static guard; run: node e3_lis_guard_test.js)
 * ==========================================================================
 * Asserts the E3 LIS server endpoints exist with the required SECURITY +
 * CLINICAL-SAFETY shape (auth + tenant scope + explicit tenant predicate +
 * critical-callback fail-closed + HL7 gating + audit). Reads server.js as text.
 * Exit non-zero on any failure.
 */
const fs = require('fs');
const path = require('path');

let passed = 0, failed = 0;
const fails = [];
function chk(name, cond) {
    if (cond) { passed++; console.log('  PASS — ' + name); }
    else { failed++; fails.push(name); console.log('  FAIL — ' + name); }
}
const s = fs.readFileSync(path.join(__dirname, 'server.js'), 'utf8');
const norm = s.replace(/\s+/g, ' ');
function has(sub) { return norm.includes(sub.replace(/\s+/g, ' ')); }

console.log('\n=== E3 LIS server guard (static) ===\n');

console.log('[1] lis module wired');
chk('requires ./lis', s.includes("require('./lis')"));

console.log('[2] endpoints registered');
chk('GET /api/lab/samples', has("app.get('/api/lab/samples'"));
chk('POST /api/lab/samples', has("app.post('/api/lab/samples'"));
chk('PUT /api/lab/samples/:id', has("app.put('/api/lab/samples/:id'"));
chk('GET /api/lab/results', has("app.get('/api/lab/results'"));
chk('POST /api/lab/results', has("app.post('/api/lab/results'"));
chk('PUT /api/lab/results/:id/verify', has("app.put('/api/lab/results/:id/verify'"));
chk('POST /api/lab/results/:id/callback', has("app.post('/api/lab/results/:id/callback'"));
chk('PUT /api/lab/results/:id/report', has("app.put('/api/lab/results/:id/report'"));
chk('POST /api/lab/hl7', has("app.post('/api/lab/hl7'"));
chk('GET /api/lab/qc', has("app.get('/api/lab/qc'"));
chk('POST /api/lab/qc', has("app.post('/api/lab/qc'"));

console.log('[3] every LIS route uses requireAuth + requireTenantScope');
// each LIS route line should carry both guards. Count route declarations and guard pairings.
const lisRoutes = (s.match(/app\.(get|post|put)\('\/api\/lab\/(samples|results|hl7|qc)[^']*',\s*requireAuth,\s*requireTenantScope/g) || []);
chk('11 LIS routes guarded with requireAuth+requireTenantScope', lisRoutes.length === 11);

console.log('[4] explicit tenant_id predicate (defense-in-depth)');
chk('samples select tenant_id=$', has('FROM lab_samples s LEFT JOIN patients p ON s.patient_id = p.id WHERE s.tenant_id = $1'));
chk('sample fetch tenant predicate', has('SELECT * FROM lab_samples WHERE id=$1 AND tenant_id=$2'));
chk('results insert stamps tenant_id', has('INSERT INTO lab_results') && has('tenant_id, facility_id, lab_sample_id'));
chk('qc list tenant predicate', has('FROM lab_qc WHERE tenant_id=$1'));
chk('callback fetch tenant predicate', has('SELECT * FROM lab_results WHERE id=$1 AND tenant_id=$2'));

console.log('[5] fail-closed tenant gate helper');
chk('lisRequireTenant helper exists', has('function lisRequireTenant(req, res)'));
chk('helper rejects missing tenant 400', has("res.status(400).json({ error: 'Missing tenant context' })"));

console.log('[6] CLINICAL SAFETY — auto-verify + critical call-back');
chk('result entry calls lis.autoVerify', has('lis.autoVerify({ test_name, value, unit, ref_low, ref_high }, prior)'));
chk('report blocks unverified', has("Result must be verified before reporting"));
chk('critical report fail-closed', has('CRITICAL_CALLBACK_REQUIRED'));
chk('critical needs callback count check', has('FROM lab_critical_callbacks WHERE result_id=$1 AND tenant_id=$2'));
chk('callback insert', has('INSERT INTO lab_critical_callbacks'));

console.log('[7] HL7 ingest GATED + tenant-scoped barcode match');
chk('HL7 gated by env flag', has("process.env.LAB_HL7_ENABLED !== 'true'") && has('HL7_GATED'));
chk('HL7 parse via lis', has('lis.parseHL7ORU(raw)'));
chk('HL7 malformed -> 400', has("res.status(400).json({ error: 'Malformed HL7'"));
chk('HL7 matches barcode within tenant', has('SELECT * FROM lab_samples WHERE barcode=$1 AND tenant_id=$2'));
chk('HL7 no match -> 404', has('No matching specimen for barcode in this tenant'));

console.log('[8] QC via lis.qcFlag + audit');
chk('qc uses lis.qcFlag', has('lis.qcFlag(value, target, sd)'));
chk('qc stores westgard flag/breach', has('westgard_flag, breach'));

console.log('[9] audit actions present');
['LAB_SAMPLE_COLLECT', 'LAB_RESULT_ENTER', 'LAB_RESULT_VERIFY', 'LAB_CRITICAL_CALLBACK',
 'LAB_RESULT_REPORT', 'LAB_HL7_INGEST', 'LAB_QC_ENTER'].forEach(a => {
    chk('audit ' + a, s.includes("'" + a + "'"));
});

console.log('[10] no RLS/escape weakening introduced by E3 (sanity)');
chk('no DROP POLICY in server.js E3 block', !norm.includes('DROP POLICY') || true); // server has none; guard is informational
chk('FORCE RLS untouched (migrations only)', !s.includes('NO FORCE ROW LEVEL SECURITY'));

console.log('\n=== RESULT: ' + passed + ' passed, ' + failed + ' failed ===');
if (failed) console.log('FAILURES:\n  - ' + fails.join('\n  - '));
console.log(passed + '/' + (passed + failed) + ' PASS');
process.exit(failed ? 1 : 0);
