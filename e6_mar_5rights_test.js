/**
 * e6_mar_5rights_test.js — E6 MAR (POST /api/mar/administer) 5-RIGHTS + CDS + witness gate.
 * DB-free / HTTP-free / no PHI. Run: node e6_mar_5rights_test.js
 * (NODE_PATH may point at the main namaweb/node_modules; this test only needs the local ./cds engine.)
 *
 * Same house style as e5_dispense_cds_gate_test.js:
 *   [1] STATIC WIRING — the /api/mar/administer route exists, is role+tenant gated, resolves the
 *       drug SERVER-SIDE, runs the cds engine, audits every block/override, writes mar_administrations.
 *   [2] SIMULATION — a faithful reproduction of the route's fail-closed decision logic proves each of
 *       the 5 rights INDEPENDENTLY blocks (wrong patient/drug/dose/route/time => 422, no row written);
 *       fully-correct => recorded; high-alert without (distinct, real) witness => blocked; CDS allergy
 *       at administration => fail-safe block (overridable with a reason).
 */
'use strict';
const fs = require('fs');
const path = require('path');
const cds = require('./cds');

let pass = 0, fail = 0;
const failures = [];
const ok = (c, m) => { if (c) { pass++; console.log('  \x1b[32mPASS\x1b[0m', m); } else { fail++; failures.push(m); console.log('  \x1b[31mFAIL\x1b[0m', m); } };

const server = fs.readFileSync(path.join(__dirname, 'server.js'), 'utf8');
const appjs = fs.readFileSync(path.join(__dirname, 'public', 'js', 'app.js'), 'utf8');

console.log('\n\x1b[1m\x1b[34m============================================================\x1b[0m');
console.log('\x1b[1m\x1b[34m  E6 — MAR 5-Rights + CDS + Witness (server-enforced, fail-closed)\x1b[0m');
console.log('\x1b[1m\x1b[34m============================================================\x1b[0m\n');

// ============================================================================
// [1] STATIC WIRING
// ============================================================================
console.log('\x1b[1m[ 1 ] Static wiring of POST /api/mar/administer in server.js\x1b[0m');
ok(/app\.post\('\/api\/mar\/administer',\s*requireAuth,\s*requireRole\('nursing',\s*'doctor'\),\s*requireTenantScope/.test(server),
  'route present + requireAuth + requireRole(nursing,doctor) + requireTenantScope');
ok(server.includes("FROM pharmacy_prescriptions_queue WHERE id=$1 AND tenant_id=$2") &&
   server.includes("FROM emar_orders WHERE id=$1 AND tenant_id=$2"),
  'resolves source row SERVER-SIDE (prescription_ref OR emar_order), tenant-scoped');
ok(server.includes("'MAR_WRONG_PATIENT'"), 'Right-Patient mismatch audits MAR_WRONG_PATIENT');
ok(server.includes("'MAR_WRONG_DRUG'"), 'Right-Drug mismatch audits MAR_WRONG_DRUG');
ok(server.includes("'MAR_WRONG_DOSE'") && server.includes("'MAR_OVERRIDE_DOSE'"), 'Right-Dose block + override audited');
ok(server.includes("'MAR_WRONG_ROUTE'") && server.includes("'MAR_OVERRIDE_ROUTE'"), 'Right-Route block + override audited');
ok(server.includes("'MAR_WRONG_TIME'") && server.includes("'MAR_OVERRIDE_TIME'"), 'Right-Time block + override audited');
ok(server.includes('cds.checkDrugAllergy(src.medication') && server.includes('cds.checkDrugDrugInteraction('),
  'CDS at administration: allergy + drug-drug via the cds engine (server-derived meds)');
ok(server.includes('await getPatientActiveMeds(src.patient_id, tenantId)'),
  'CDS drug-drug uses SERVER-derived active meds (getPatientActiveMeds), not client');
ok(server.includes('cds.decide(cdsAlerts, reason)') && server.includes("'MAR_CDS_BLOCK'"),
  'CDS hard-stop via cds.decide => 422 MAR_CDS_BLOCK (fail-safe)');
ok(server.includes('isHighAlertMed(src.medication)') && server.includes("'MAR_WITNESS_REQUIRED'"),
  'high-alert witness gate present (MAR_WITNESS_REQUIRED)');
ok(server.includes('JOIN user_tenants ut ON ut.user_id = su.id') && server.includes('ut.tenant_id=$2'),
  'witness verified as a DISTINCT real user in the SAME tenant (system_users JOIN user_tenants)');
ok(server.includes("parseInt(witness_user_id, 10)") && server.includes("witnessId === parseInt(uid, 10)"),
  'C1: witness/self comparison uses parseInt (whitespace-padded id cannot bypass self-witness)');
ok(server.includes("Number.isNaN(witnessId)"),
  'C1: NaN/non-numeric witness id is rejected fail-closed');
ok(/\[witnessId, tenantId\]\)\)\.rows\[0\]/.test(server),
  'C1: witness DB lookup uses the parsed integer (padded value cannot slip through)');
ok(server.includes('INSERT INTO mar_administrations') && server.includes("VALUES ($1,$2,$3,$4,$5,$6,$7,$8,CURRENT_TIMESTAMP"),
  'writes mar_administrations with server-clock administered_at + tenant_id stamped');
ok(server.includes("status,'given'") || /VALUES[^;]*'given'/.test(server),
  'status FORCED server-side to \'given\' (not from body)');
ok(server.includes("logAudit(uid, uname, 'MAR_ADMINISTRATION', 'Nursing'"),
  'success audits MAR_ADMINISTRATION');
ok(!server.includes('FROM system_users WHERE id=$1 AND tenant_id=$2'),
  'no broken system_users.tenant_id query (that column does not exist)');
// client primary "Give" routes to the SAFE path, not the legacy one (E5 lesson — no shadow path).
ok(appjs.includes("API.post('/api/mar/administer'") &&
   /window\.administerMed[\s\S]{0,1500}\/api\/mar\/administer/.test(appjs),
  'C1: administerMed() posts to /api/mar/administer (safe stack), not legacy /api/emar/administrations');
ok(!/window\.administerMed[\s\S]{0,1500}\/api\/emar\/administrations/.test(appjs),
  'administerMed no longer posts to the legacy /api/emar/administrations route');

// ============================================================================
// [2] SIMULATION — faithful reproduction of the route's fail-closed 5-rights gate.
// ============================================================================
console.log('\n\x1b[1m[ 2 ] 5-Rights gate simulation (each right independently blocks)\x1b[0m');

const MAR_TIME_WINDOW_MIN = 60;
const MAR_HIGH_ALERT = ['insulin', 'heparin', 'warfarin', 'morphine', 'fentanyl', 'potassium chloride', 'kcl'];
const isHighAlert = (n) => { const s = String(n || '').toLowerCase(); return !!s && MAR_HIGH_ALERT.some(h => s.includes(h)); };
const norm = (s) => String(s == null ? '' : s).trim().toLowerCase().replace(/\s+/g, ' ');

// The DB is mocked: a single tenant-1 patient #10 with an Amoxicillin order; tenant users 7 (nurse) & 8 (witness).
const DB = {
  patients: { 10: { id: 10, tenant_id: 1, allergies: '' } },
  orders:   { 100: { id: 100, tenant_id: 1, patient_id: 10, medication: 'Amoxicillin', dose: '500 mg', route: 'Oral' } },
  // prescription queue rows have NO route column (I1) — route is unknown server-side.
  prescriptions: { 200: { id: 200, tenant_id: 1, patient_id: 10, medication: 'Amoxicillin', dose: '500 mg' } },
  tenantUsers: { 1: [7, 8] }, // user_ids that are members of tenant 1
  rows: [], // mar_administrations rows actually written
};

// Mirrors the server route's decision sequence. Returns { status, body } and writes DB.rows on success.
function administer(req, sessionUserId = 7, tenantId = 1) {
  const reason = (req.override_reason == null) ? '' : String(req.override_reason).trim();
  if (!tenantId) return { status: 403 }; // null-tenant fail-closed
  // resolve source server-side (tenant-scoped). I1: prescription path has NO route column => src.route=null.
  let src;
  if (req.prescription_ref != null) {
    const rx = DB.prescriptions[req.prescription_ref];
    if (!rx || rx.tenant_id !== tenantId) return { status: 404, body: { error: 'Prescription not found' } };
    src = { patient_id: rx.patient_id, medication: rx.medication, dose: rx.dose, route: null };
  } else {
    const order = DB.orders[req.emar_order_id];
    if (!order || order.tenant_id !== tenantId) return { status: 404, body: { error: 'Order not found' } };
    src = { patient_id: order.patient_id, medication: order.medication, dose: order.dose, route: order.route };
  }
  // right patient
  const pat = DB.patients[src.patient_id];
  if (!pat || pat.tenant_id !== tenantId) return { status: 404, body: { error: 'Patient not found' } };
  const claimed = req.scanned_patient_id != null ? req.scanned_patient_id : req.patient_id;
  if (claimed == null || Number(claimed) !== Number(src.patient_id)) return { status: 422, right: 'patient' };
  // right drug
  if (req.scanned_drug != null && norm(req.scanned_drug) && norm(req.scanned_drug) !== norm(src.medication)) return { status: 422, right: 'drug' };
  // right dose
  if (req.scanned_dose != null && norm(req.scanned_dose) && norm(req.scanned_dose) !== norm(src.dose)) {
    if (!reason) return { status: 422, right: 'dose', requires_override_reason: true };
  }
  // right route. I1: only enforce when src.route is a KNOWN non-null value; for the prescription path
  // (src.route===null) accept the scanned route as authoritative and record it (no spurious override).
  if (src.route != null && req.scanned_route != null && norm(req.scanned_route) && norm(req.scanned_route) !== norm(src.route)) {
    if (!reason) return { status: 422, right: 'route', requires_override_reason: true };
  }
  if (src.route == null && req.scanned_route != null && norm(req.scanned_route)) {
    src.route = String(req.scanned_route).trim();
  }
  // right time
  if (req.scheduled_at) {
    const sched = new Date(req.scheduled_at);
    if (!isNaN(sched.getTime())) {
      const driftMin = Math.abs(Date.now() - sched.getTime()) / 60000;
      if (driftMin > MAR_TIME_WINDOW_MIN && !reason) return { status: 422, right: 'time', requires_override_reason: true };
    }
  }
  // CDS (fail-safe). I3: an allergy-engine THROW is a CRITICAL hard-stop (not a soft warning), so it
  // blocks unless override_reason is supplied — mirroring the server's severity:'critical' fail-safe.
  let alerts = [];
  try { alerts = alerts.concat(cds.checkDrugAllergy(src.medication, pat.allergies)); } catch (e) { alerts.push({ rule: 'allergy', severity: 'critical', overridable: true, fail_safe: true }); }
  const decision = cds.decide(alerts, reason);
  if (!decision.allow) return { status: 422, body: { error: 'CDS hard-stop', alerts } };
  // witness gate. C1: compare as integers; reject NaN; padded ' 7' === 7 cannot self-witness.
  let witnessId = null;
  if (isHighAlert(src.medication)) {
    if (req.witness_user_id == null || String(req.witness_user_id).trim() === '') return { status: 422, requires_witness: true };
    witnessId = parseInt(req.witness_user_id, 10);
    if (Number.isNaN(witnessId)) return { status: 422, requires_witness: true };
    if (witnessId === parseInt(sessionUserId, 10)) return { status: 422, requires_witness: true };
    if (!(DB.tenantUsers[tenantId] || []).includes(witnessId)) return { status: 422, requires_witness: true };
  }
  const row = { tenant_id: tenantId, patient_id: src.patient_id, medication: src.medication, dose: src.dose, route: src.route, status: 'given', administered_by: sessionUserId, witness_by: isHighAlert(src.medication) ? witnessId : null };
  DB.rows.push(row);
  return { status: 200, body: { success: true, administration: row } };
}

const baseGood = { emar_order_id: 100, patient_id: 10, scanned_patient_id: 10, scanned_drug: 'Amoxicillin', scanned_dose: '500 mg', scanned_route: 'Oral', scheduled_at: new Date().toISOString() };

// 2.0 fully correct => recorded
{ DB.rows = []; const r = administer({ ...baseGood }); ok(r.status === 200 && DB.rows.length === 1 && DB.rows[0].status === 'given', 'fully-correct administration => 200 + one \'given\' row written'); }

// 2.1 WRONG PATIENT
{ DB.rows = []; const r = administer({ ...baseGood, scanned_patient_id: 999 }); ok(r.status === 422 && r.right === 'patient' && DB.rows.length === 0, 'Right Patient: scanned #999 != prescribed #10 => 422, no row'); }

// 2.2 WRONG DRUG
{ DB.rows = []; const r = administer({ ...baseGood, scanned_drug: 'Ibuprofen' }); ok(r.status === 422 && r.right === 'drug' && DB.rows.length === 0, 'Right Drug: scanned Ibuprofen != Amoxicillin => 422, no row'); }

// 2.3 WRONG DOSE (no reason) blocks; WITH reason proceeds
{ DB.rows = []; const r = administer({ ...baseGood, scanned_dose: '1000 mg' }); ok(r.status === 422 && r.right === 'dose' && r.requires_override_reason && DB.rows.length === 0, 'Right Dose: 1000mg != 500mg, no reason => 422, no row'); }
{ DB.rows = []; const r = administer({ ...baseGood, scanned_dose: '1000 mg', override_reason: 'MD verbal order' }); ok(r.status === 200 && DB.rows.length === 1, 'Right Dose: dose override WITH reason => proceeds + recorded'); }

// 2.4 WRONG ROUTE (no reason) blocks
{ DB.rows = []; const r = administer({ ...baseGood, scanned_route: 'IV' }); ok(r.status === 422 && r.right === 'route' && DB.rows.length === 0, 'Right Route: IV != Oral, no reason => 422, no row'); }

// 2.5 WRONG TIME (outside window, no reason) blocks
{ DB.rows = []; const old = new Date(Date.now() - 5 * 3600 * 1000).toISOString(); const r = administer({ ...baseGood, scheduled_at: old }); ok(r.status === 422 && r.right === 'time' && r.requires_override_reason && DB.rows.length === 0, 'Right Time: 5h outside 60-min window, no reason => 422, no row'); }
{ DB.rows = []; const old = new Date(Date.now() - 5 * 3600 * 1000).toISOString(); const r = administer({ ...baseGood, scheduled_at: old, override_reason: 'late round documented' }); ok(r.status === 200 && DB.rows.length === 1, 'Right Time: out-of-window WITH reason => proceeds'); }

// 2.6 CDS allergy at administration => block (fail-safe), overridable with reason
{
  DB.rows = []; DB.patients[10].allergies = 'Penicillin';
  const r = administer({ ...baseGood });
  ok(r.status === 422 && r.body && r.body.error === 'CDS hard-stop' && DB.rows.length === 0, 'CDS: Amoxicillin for Penicillin-allergic patient => 422, no row');
  const r2 = administer({ ...baseGood, override_reason: 'mild rash hx only; monitored' });
  ok(r2.status === 200 && DB.rows.length === 1, 'CDS: allergy override WITH reason => proceeds (audited)');
  DB.patients[10].allergies = '';
}

// 2.7 HIGH-ALERT without / with witness
{
  DB.orders[101] = { id: 101, tenant_id: 1, patient_id: 10, medication: 'Insulin glargine', dose: '10 units', route: 'SC' };
  const ha = { emar_order_id: 101, patient_id: 10, scanned_patient_id: 10, scanned_drug: 'Insulin glargine', scanned_dose: '10 units', scanned_route: 'SC', scheduled_at: new Date().toISOString() };
  DB.rows = []; let r = administer({ ...ha }); ok(r.status === 422 && r.requires_witness && DB.rows.length === 0, 'High-alert (insulin) WITHOUT witness => 422, no row');
  DB.rows = []; r = administer({ ...ha, witness_user_id: 7 }, 7); ok(r.status === 422 && r.requires_witness && DB.rows.length === 0, 'High-alert: witness == administering nurse => 422');
  DB.rows = []; r = administer({ ...ha, witness_user_id: 999 }, 7); ok(r.status === 422 && r.requires_witness && DB.rows.length === 0, 'High-alert: witness not a same-tenant user => 422');
  DB.rows = []; r = administer({ ...ha, witness_user_id: 8 }, 7); ok(r.status === 200 && DB.rows.length === 1 && DB.rows[0].witness_by === 8, 'High-alert: distinct, same-tenant witness => proceeds + witness recorded');
}

// 2.8 null-tenant fail-closed
{ DB.rows = []; const r = administer({ ...baseGood }, 7, null); ok(r.status === 403 && DB.rows.length === 0, 'null tenant => 403 fail-closed, no row'); }

// 2.9 C1 — whitespace-padded self-witness is REJECTED (cannot bypass via ' 7')
{
  DB.orders[101] = DB.orders[101] || { id: 101, tenant_id: 1, patient_id: 10, medication: 'Insulin glargine', dose: '10 units', route: 'SC' };
  const ha = { emar_order_id: 101, patient_id: 10, scanned_patient_id: 10, scanned_drug: 'Insulin glargine', scanned_dose: '10 units', scanned_route: 'SC', scheduled_at: new Date().toISOString() };
  DB.rows = []; let r = administer({ ...ha, witness_user_id: ' 7' }, 7); ok(r.status === 422 && r.requires_witness && DB.rows.length === 0, 'C1: padded witness_user_id " 7" == administering nurse 7 => 422 (self-witness bypass blocked)');
  DB.rows = []; r = administer({ ...ha, witness_user_id: 'abc' }, 7); ok(r.status === 422 && r.requires_witness && DB.rows.length === 0, 'C1: non-numeric witness_user_id "abc" => 422 (NaN rejected)');
  DB.rows = []; r = administer({ ...ha, witness_user_id: ' 8' }, 7); ok(r.status === 200 && DB.rows.length === 1 && DB.rows[0].witness_by === 8, 'C1: padded DISTINCT witness " 8" => normalized to 8, proceeds + recorded as int');
}

// 2.10 I1 — prescription path (no route column): scanned route accepted as authoritative, NO override needed
{
  const rx = { prescription_ref: 200, patient_id: 10, scanned_patient_id: 10, scanned_drug: 'Amoxicillin', scanned_dose: '500 mg', scanned_route: 'IV', scheduled_at: new Date().toISOString() };
  DB.rows = []; const r = administer({ ...rx });
  ok(r.status === 200 && DB.rows.length === 1 && DB.rows[0].route === 'IV', 'I1: prescription path accepts scanned route "IV" as authoritative WITHOUT override_reason (no spurious right-route block)');
}
// I1 emar_orders path still HARD-STOPS on route mismatch (route known)
{
  DB.rows = []; const r = administer({ ...baseGood, scanned_route: 'IV' });
  ok(r.status === 422 && r.right === 'route' && DB.rows.length === 0, 'I1: emar_orders path (route known) STILL blocks IV != Oral without reason');
}

// 2.11 I3 — allergy-engine THROW is a CRITICAL hard-stop (blocked), overridable with reason
{
  // Force checkDrugAllergy to throw by monkeypatching, mirroring an engine failure.
  const orig = cds.checkDrugAllergy;
  cds.checkDrugAllergy = () => { throw new Error('engine down'); };
  try {
    DB.rows = []; let r = administer({ ...baseGood });
    ok(r.status === 422 && r.body && r.body.error === 'CDS hard-stop' && DB.rows.length === 0, 'I3: allergy-engine throw => CRITICAL fail-safe block (422, no row)');
    DB.rows = []; r = administer({ ...baseGood, override_reason: 'allergy verified manually from chart' });
    ok(r.status === 200 && DB.rows.length === 1, 'I3: allergy-engine throw overridable WITH reason => proceeds (audited)');
  } finally { cds.checkDrugAllergy = orig; }
}

console.log(`\n\x1b[1m\x1b[34m============================================================\x1b[0m`);
console.log(`  \x1b[32mPASS\x1b[0m: ${pass}   \x1b[31mFAIL\x1b[0m: ${fail}`);
if (fail > 0) { console.log('\n\x1b[31mFailures:\x1b[0m'); failures.forEach(f => console.log('  - ' + f)); }
console.log(`${fail === 0 ? '\x1b[1m\x1b[32mALL PASS\x1b[0m' : '\x1b[1m\x1b[31mFAILED\x1b[0m'}: ${pass} passed, ${fail} failed`);
process.exit(fail === 0 ? 0 : 1);
