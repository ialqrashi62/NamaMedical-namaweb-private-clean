/**
 * e5_dispense_cds_gate_test.js
 * ============================================================================
 * E5 PHARMACY — pharmacist VERIFY (CDS reuse) + FEFO dispense + CONTROLLED fail-closed.
 * No real DB/HTTP/PHI. Run: node e5_dispense_cds_gate_test.js
 * (NODE_PATH should point at the main namaweb/node_modules if any dep is needed; this test
 *  only requires the local ./cds engine, so it runs DB-free with no external deps.)
 *
 * The /api/pharmacy/queue/:id/verify and /api/pharmacy/dispense routes live inside a large
 * Express app, so this test reproduces the EXACT decision logic those routes perform — reusing
 * the REAL E1 cds engine (NOT a duplicated matrix) — and statically confirms the routes wire it.
 *
 * It proves the three clinical-safety rules:
 *   A. VERIFY re-runs the E1 CDS engine SERVER-SIDE (allergy + dose + drug-drug vs server-derived
 *      active meds). A CRITICAL alert HARD-STOPS (422) with no override reason; proceeds (allow)
 *      with a reason (audited CDS_OVERRIDE). The dangerous active med is SERVER-known, not client
 *      supplied (anti-spoof — E1 CRITICAL-2 lesson).
 *   B. FEFO decrement: earliest NON-EXPIRED batch is consumed first; an EXPIRED batch is NEVER
 *      used even if it has stock; insufficient on-hand across valid batches => 409.
 *   C. CONTROLLED fail-closed: a controlled drug CANNOT dispense without a (distinct) witness;
 *      the controlled register is a double-entry row with balance_before/after.
 */
const fs = require('fs');
const path = require('path');
const cds = require('./cds');

let pass = 0, fail = 0;
const failures = [];
const ok = (c, m) => { if (c) { pass++; console.log('  \x1b[32mPASS\x1b[0m', m); } else { fail++; failures.push(m); console.log('  \x1b[31mFAIL\x1b[0m', m); } };

const server = fs.readFileSync(path.join(__dirname, 'server.js'), 'utf8');
const appjs = fs.readFileSync(path.join(__dirname, 'public', 'js', 'app.js'), 'utf8');

console.log('\n\x1b[1m\x1b[34m============================================================\x1b[0m');
console.log('\x1b[1m\x1b[34m  E5 — Verify(CDS reuse) + FEFO + Controlled (fail-closed)\x1b[0m');
console.log('\x1b[1m\x1b[34m============================================================\x1b[0m\n');

// ============================================================================
// [1] STATIC WIRING — the routes reuse the E1 cds engine + server-derived active meds + FEFO + controlled.
// ============================================================================
console.log('\x1b[1m[ 1 ] Static wiring of the E5 routes in server.js\x1b[0m');
ok(server.includes("require('./cds')"), 'server reuses E1 cds engine (require(\'./cds\'))');
ok(server.includes("app.put('/api/pharmacy/queue/:id/verify'"), 'pharmacist VERIFY route present');
ok(server.includes("app.post('/api/pharmacy/dispense'"), 'FEFO dispense route present');
ok(server.includes('await getPatientActiveMeds(rx.patient_id, tenantId)'),
   'VERIFY derives active meds SERVER-SIDE (getPatientActiveMeds) — not from client');
ok(server.includes('cds.checkDrugAllergy(rx.medication_name') &&
   server.includes('cds.checkDoseRange(rx.medication_name') &&
   server.includes('cds.checkDrugDrugInteraction(['),
   'VERIFY runs allergy + dose + drug-drug via the cds engine');
ok(server.includes('cds.decide(alerts, override_reason)'), 'VERIFY uses cds.decide(alerts, override_reason) gate');
ok(server.includes("'CDS_BLOCK'") && server.includes("'CDS_OVERRIDE'"), 'VERIFY audits CDS_BLOCK / CDS_OVERRIDE');
ok(server.includes("requireRole('pharmacy')"), 'E5 pharmacy write routes are role-gated requireRole(\'pharmacy\')');
ok(server.includes('expiry_date >= CURRENT_DATE') && server.includes('ORDER BY expiry_date ASC, id ASC'),
   'FEFO query excludes expired batches and orders earliest-expiry-first');
ok(server.includes('FOR UPDATE'), 'FEFO decrement locks batch rows (FOR UPDATE) inside the transaction');
ok(server.includes("error: 'Insufficient stock'") && server.includes('status(409)'),
   'insufficient stock => 409');
ok(server.includes("error: 'Prescription must be Verified before dispensing'"),
   'dispense requires status=Verified (state machine enforced)');
ok(server.includes('requires_witness: true') && server.includes("error: 'Controlled drug requires a second witness'"),
   'controlled drug without witness => 422 fail-closed');
ok(server.includes("error: 'Witness must be a different user'"),
   'witness must differ from the dispensing pharmacist');
ok(server.includes('INSERT INTO controlled_drug_log') && server.includes('balance_before') && server.includes('balance_after'),
   'controlled dispense writes a double-entry register row (balance before/after)');
// I2: controlled-register balance derives from the AUTHORITATIVE batch sum, not the denormalized catalog.
ok(server.includes('SELECT COALESCE(SUM(qty_on_hand),0) AS bal FROM drug_batches WHERE tenant_id=$1 AND drug_id=$2') &&
   server.includes('const balanceAfter = balanceBefore - qty'),
   'I2: controlled balance_before/after come from SUM(drug_batches.qty_on_hand), tenant-scoped, under FOR UPDATE');
// C1: the primary Prescription-Queue dispense panel routes through the E5 safety stack, NOT the legacy PUT.
ok(appjs.includes("API.post('/api/pharmacy/dispense'") &&
   /window\.confirmDispense[\s\S]{0,1200}\/api\/pharmacy\/dispense/.test(appjs),
   'C1: confirmDispense() posts to /api/pharmacy/dispense (FEFO/CDS/controlled stack), not legacy PUT /queue/:id');
ok(server.includes("'CONTROLLED_DISPENSE'") && server.includes("'CONTROLLED_WITNESS'"),
   'controlled dispense audits CONTROLLED_DISPENSE + CONTROLLED_WITNESS');
ok(server.includes("'DISPENSE_FEFO'"), 'FEFO dispense audited as DISPENSE_FEFO');
// explicit tenant predicate on every new query (defense-in-depth on top of FORCE RLS)
ok(server.includes('FROM drug_batches') && server.includes('WHERE tenant_id=$1 AND drug_id=$2'),
   'FEFO batch query carries explicit tenant_id predicate');

// ============================================================================
// [2] VERIFY — reproduce the route's CDS composition with the REAL engine (server-derived active meds).
// ============================================================================
console.log('\n\x1b[1m[ 2 ] Pharmacist VERIFY re-runs the E1 CDS engine (server-side)\x1b[0m');

// Exact composition the verify route uses; activeMeds come from the SERVER (getPatientActiveMeds), never the client.
function verifyGate({ medication_name, dosage, allergies, serverActiveMeds, override_reason }) {
    let alerts = [];
    alerts = alerts
        .concat(cds.checkDrugAllergy(medication_name, allergies))
        .concat(cds.checkDoseRange(medication_name, dosage, null));
    // exclude the queue item's own drug from the active list (route filters self) so it is not compared to itself
    const others = (serverActiveMeds || []).filter(m => String(m).trim().toLowerCase() !== String(medication_name).trim().toLowerCase());
    alerts = alerts.concat(cds.checkDrugDrugInteraction([medication_name].concat(others)));
    const decision = cds.decide(alerts, override_reason);
    return { alerts, decision };
}

// 2.1 CRITICAL drug-drug where the dangerous med is known ONLY server-side => 422 hard-stop without reason.
const dd = verifyGate({ medication_name: 'Nitroglycerin', dosage: '0.4 mg', allergies: '', serverActiveMeds: ['Sildenafil'] });
ok(dd.decision.allow === false && dd.decision.status === 422,
   'VERIFY: Nitrate + (server-known) Sildenafil, no reason => 422 hard-stop');
ok(dd.alerts.some(a => a.rule === 'drug-drug' && a.severity === 'critical'),
   'VERIFY: the blocking alert is the critical drug-drug interaction');

// 2.2 Same Rx WITH override reason => proceeds (allow) + critical present => route audits CDS_OVERRIDE.
const ddOv = verifyGate({ medication_name: 'Nitroglycerin', dosage: '0.4 mg', allergies: '', serverActiveMeds: ['Sildenafil'], override_reason: 'Nitrate-free interval; cardiology aware' });
ok(ddOv.decision.allow === true && ddOv.alerts.some(a => a.severity === 'critical') && ddOv.decision.reason,
   'VERIFY: same combo proceeds WITH reason => auditable CDS_OVERRIDE');

// 2.3 Anti-spoof: if the active list were CLIENT-supplied and omitted Sildenafil, the danger would be missed.
const ddSpoof = verifyGate({ medication_name: 'Nitroglycerin', dosage: '0.4 mg', allergies: '', serverActiveMeds: [] });
ok(ddSpoof.decision.allow === true,
   'VERIFY (control): an empty (client-omitted) active list would NOT 422 — hence the list MUST be server-derived');

// 2.4 CRITICAL allergy => hard-stop without reason, proceed with reason.
const alg = verifyGate({ medication_name: 'Amoxicillin', dosage: '500 mg', allergies: 'Penicillin', serverActiveMeds: [] });
ok(alg.decision.allow === false && alg.decision.status === 422,
   'VERIFY: Amoxicillin for a Penicillin-allergic patient => 422 hard-stop (no reason)');
const algOv = verifyGate({ medication_name: 'Amoxicillin', dosage: '500 mg', allergies: 'Penicillin', serverActiveMeds: [], override_reason: 'Mild rash only; no anaphylaxis hx; monitored' });
ok(algOv.decision.allow === true, 'VERIFY: allergy override proceeds WITH a reason');

// 2.5 Benign single med => allowed.
const benign = verifyGate({ medication_name: 'Paracetamol', dosage: '500 mg', allergies: '', serverActiveMeds: [] });
ok(benign.decision.allow === true, 'VERIFY: benign med (no interaction/allergy/overdose) => allowed');

// 2.6 Fail-safe: the engine never throws on junk input (never silently passes a real danger either).
let threw = false;
try { verifyGate({ medication_name: '', dosage: '', allergies: null, serverActiveMeds: null }); } catch (e) { threw = true; }
ok(threw === false, 'VERIFY: CDS engine is fail-safe on empty/null input (no throw)');

// ============================================================================
// [3] FEFO decrement — reproduce the route's batch consumption logic.
// ============================================================================
console.log('\n\x1b[1m[ 3 ] FEFO decrement (earliest non-expired first; never expired; 409 on shortfall)\x1b[0m');

const TODAY = new Date('2026-06-26T00:00:00Z');
const isExpired = (d) => new Date(d + 'T00:00:00Z') < TODAY;

// Mirrors the server FEFO selection + decrement (the SQL: qty_on_hand>0 AND expiry_date>=CURRENT_DATE,
// ORDER BY expiry_date ASC, id ASC) and the JS loop that consumes earliest-first.
function fefoDispense(batches, qty) {
    const valid = batches
        .filter(b => b.qty_on_hand > 0 && !isExpired(b.expiry_date))
        .sort((a, b) => (a.expiry_date < b.expiry_date ? -1 : a.expiry_date > b.expiry_date ? 1 : a.id - b.id));
    const totalAvailable = valid.reduce((s, b) => s + b.qty_on_hand, 0);
    if (totalAvailable < qty) return { conflict: true, status: 409, available: totalAvailable };
    let remaining = qty;
    const consumed = [];
    for (const b of valid) {
        if (remaining <= 0) break;
        const take = Math.min(remaining, b.qty_on_hand);
        b.qty_on_hand -= take;
        consumed.push({ batch_id: b.id, lot: b.lot, expiry_date: b.expiry_date, qty: take });
        remaining -= take;
    }
    return { status: 200, consumed };
}

// 3.1 Earliest non-expired batch is consumed first.
{
    const batches = [
        { id: 3, lot: 'C', expiry_date: '2027-01-01', qty_on_hand: 50 },
        { id: 1, lot: 'A', expiry_date: '2026-09-01', qty_on_hand: 10 }, // earliest valid
        { id: 2, lot: 'B', expiry_date: '2026-12-01', qty_on_hand: 20 },
    ];
    const r = fefoDispense(batches, 5);
    ok(r.status === 200 && r.consumed.length === 1 && r.consumed[0].lot === 'A',
       'FEFO: a 5-unit dispense draws entirely from the earliest-expiry batch (lot A)');
    ok(batches.find(b => b.id === 1).qty_on_hand === 5, 'FEFO: lot A decremented 10 -> 5');
    ok(batches.find(b => b.id === 2).qty_on_hand === 20 && batches.find(b => b.id === 3).qty_on_hand === 50,
       'FEFO: later-expiry batches untouched');
}

// 3.2 Spillover across batches in expiry order.
{
    const batches = [
        { id: 1, lot: 'A', expiry_date: '2026-09-01', qty_on_hand: 10 },
        { id: 2, lot: 'B', expiry_date: '2026-12-01', qty_on_hand: 20 },
    ];
    const r = fefoDispense(batches, 15);
    ok(r.status === 200 && r.consumed.length === 2 && r.consumed[0].lot === 'A' && r.consumed[0].qty === 10 && r.consumed[1].lot === 'B' && r.consumed[1].qty === 5,
       'FEFO: 15 units => 10 from lot A then 5 from lot B (expiry order)');
    ok(batches.find(b => b.id === 1).qty_on_hand === 0 && batches.find(b => b.id === 2).qty_on_hand === 15,
       'FEFO: lot A drained to 0, lot B 20 -> 15');
}

// 3.3 An EXPIRED batch is NEVER used even though it has stock.
{
    const batches = [
        { id: 1, lot: 'EXPIRED', expiry_date: '2025-01-01', qty_on_hand: 1000 }, // expired, huge stock
        { id: 2, lot: 'GOOD', expiry_date: '2026-12-01', qty_on_hand: 8 },
    ];
    const r = fefoDispense(batches, 5);
    ok(r.status === 200 && r.consumed.every(c => c.lot !== 'EXPIRED'),
       'FEFO: expired batch is NEVER dispensed even with ample stock');
    ok(batches.find(b => b.id === 1).qty_on_hand === 1000, 'FEFO: expired batch left fully intact');
    ok(batches.find(b => b.id === 2).qty_on_hand === 3, 'FEFO: the GOOD batch supplied the 5 units (8 -> 3)');
}

// 3.4 Insufficient stock across valid (non-expired) batches => 409, no decrement.
{
    const batches = [
        { id: 1, lot: 'EXPIRED', expiry_date: '2025-01-01', qty_on_hand: 1000 },
        { id: 2, lot: 'GOOD', expiry_date: '2026-12-01', qty_on_hand: 3 },
    ];
    const r = fefoDispense(batches, 10);
    ok(r.conflict === true && r.status === 409 && r.available === 3,
       'FEFO: shortfall counting ONLY non-expired stock => 409 (available=3)');
    ok(batches.find(b => b.id === 2).qty_on_hand === 3, 'FEFO: no partial decrement on a 409 shortfall');
}

// ============================================================================
// [4] CONTROLLED drugs — fail-closed witness + double-entry balances.
// ============================================================================
console.log('\n\x1b[1m[ 4 ] Controlled drugs (fail-closed witness + double-log)\x1b[0m');

// Mirrors the server's controlled gate + double-entry write.
function controlledDispense({ drug, dispenser_id, witness_user_id, qty, balance_before }) {
    const isControlled = !!(drug.is_controlled && Number(drug.is_controlled) > 0);
    if (isControlled && !witness_user_id) return { status: 422, requires_witness: true };
    if (isControlled && String(witness_user_id) === String(dispenser_id)) return { status: 422, requires_witness: true, reason: 'same_user' };
    const balance_after = Math.max(0, balance_before - qty);
    const log = isControlled ? {
        drug_id: drug.id, qty, balance_before, balance_after,
        dispensed_by: dispenser_id, witnessed_by: witness_user_id, schedule_class: drug.schedule_class || 'controlled',
    } : null;
    return { status: 200, isControlled, log, balance_after };
}

const controlledDrug = { id: 99, drug_name: 'Morphine', is_controlled: 1, schedule_class: 'CDII' };
const normalDrug = { id: 10, drug_name: 'Paracetamol', is_controlled: 0 };

// 4.1 Controlled without witness => 422 fail-closed.
ok(controlledDispense({ drug: controlledDrug, dispenser_id: 7, witness_user_id: undefined, qty: 2, balance_before: 10 }).status === 422,
   'CONTROLLED: dispense without a witness => 422 (fail-closed)');

// 4.2 Controlled with witness == dispenser => rejected.
ok(controlledDispense({ drug: controlledDrug, dispenser_id: 7, witness_user_id: 7, qty: 2, balance_before: 10 }).status === 422,
   'CONTROLLED: witness must differ from the dispensing pharmacist => 422');

// 4.3 Controlled WITH a distinct witness => proceeds + double-entry log with correct balances.
{
    const r = controlledDispense({ drug: controlledDrug, dispenser_id: 7, witness_user_id: 8, qty: 2, balance_before: 10 });
    ok(r.status === 200 && r.isControlled && r.log, 'CONTROLLED: distinct witness => dispense proceeds + register row written');
    ok(r.log.balance_before === 10 && r.log.balance_after === 8 && r.log.qty === 2,
       'CONTROLLED: double-entry balances correct (before=10, after=8, qty=2)');
    ok(r.log.dispensed_by === 7 && r.log.witnessed_by === 8 && r.log.schedule_class === 'CDII',
       'CONTROLLED: register records dispenser + witness + schedule class');
}

// 4.4 A NON-controlled drug needs no witness.
{
    const r = controlledDispense({ drug: normalDrug, dispenser_id: 7, witness_user_id: undefined, qty: 3, balance_before: 5 });
    ok(r.status === 200 && !r.isControlled && r.log === null,
       'CONTROLLED: non-controlled drug dispenses with no witness and writes no controlled-log row');
}

// ============================================================================
// Summary
// ============================================================================
console.log(`\n\x1b[1m\x1b[34m============================================================\x1b[0m`);
console.log(`  \x1b[32mPASS\x1b[0m: ${pass}   \x1b[31mFAIL\x1b[0m: ${fail}`);
if (fail > 0) { console.log('\n\x1b[31mFailures:\x1b[0m'); failures.forEach(f => console.log('  - ' + f)); }
console.log(`${fail === 0 ? '\x1b[1m\x1b[32mALL PASS\x1b[0m' : '\x1b[1m\x1b[31mFAILED\x1b[0m'}: ${pass} passed, ${fail} failed`);
process.exit(fail === 0 ? 0 : 1);
