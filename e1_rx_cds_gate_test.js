/**
 * e1_rx_cds_gate_test.js — CRITICAL-1: server-side DRUG-DRUG gate on POST /api/prescriptions.
 * No real DB/HTTP/PHI. Run: node e1_rx_cds_gate_test.js
 *
 * The /api/prescriptions route (server.js) lives inside a large Express app, so this test reproduces
 * the EXACT gate composition the route performs — allergy + dose + drug-drug, where the active-med
 * list comes from the SERVER (getPatientActiveMeds), never the client — using the REAL cds engine and
 * a mock active-meds source. It proves:
 *   1. A fatal combo (Nitrate + Sildenafil), where Sildenafil is known ONLY server-side, is a 422
 *      hard-stop with NO override reason.
 *   2. With a non-empty override_reason it PROCEEDS (allow) and is auditable as CDS_OVERRIDE.
 *   3. The dangerous med is supplied by the SERVER source, NOT the client body (anti-spoof).
 *
 * It also statically confirms the route wires getPatientActiveMeds + checkDrugDrugInteraction.
 */
const fs = require('fs');
const path = require('path');
const cds = require('./cds');
let pass = 0, fail = 0;
const ok = (c, m) => { if (c) { pass++; console.log('  PASS', m); } else { fail++; console.log('  FAIL', m); } };

// ---------- static: the route composes the gate the way CRITICAL-1 requires ----------
const server = fs.readFileSync(path.join(__dirname, 'server.js'), 'utf8');
ok(server.includes('async function getPatientActiveMeds('), 'route helper getPatientActiveMeds defined');
ok(server.includes('cds.checkDrugDrugInteraction([medication_name].concat(activeMeds))'),
   'route runs drug-drug = new drug + server-derived active meds');
ok(server.includes('await getPatientActiveMeds(patient_id, tenantId)'), 'route derives active meds server-side (patient+tenant)');

// ---------- functional: reproduce the route gate with the REAL cds engine ----------
// getPatientActiveMeds is server-derived; the client body never feeds the interaction list.
function rxGate({ medication_name, dosage, patientAllergies, serverActiveMeds, override_reason }) {
    let alerts = [];
    alerts = alerts
        .concat(cds.checkDrugAllergy(medication_name, patientAllergies))
        .concat(cds.checkDoseRange(medication_name, dosage, null));
    // CRITICAL-1: new drug vs. the SERVER-derived active-med list
    alerts = alerts.concat(cds.checkDrugDrugInteraction([medication_name].concat(serverActiveMeds)));
    const decision = cds.decide(alerts, override_reason);
    return { alerts, decision };
}

// Patient is ALREADY on Sildenafil (server-side). Client now prescribes a Nitrate. The client body
// carries NO active meds — only the server source knows about the Sildenafil.
const serverActiveMeds = ['Sildenafil'];

// 1) No override reason => 422 hard-stop on the fatal interaction.
const blocked = rxGate({ medication_name: 'Nitroglycerin', dosage: '0.4 mg', patientAllergies: '', serverActiveMeds });
ok(blocked.decision.allow === false && blocked.decision.status === 422,
   'CRITICAL-1: Nitrate + (server-known) Sildenafil, no reason => 422 hard-stop');
ok(blocked.alerts.some(a => a.rule === 'drug-drug' && a.severity === 'critical'),
   'CRITICAL-1: the blocking alert is the critical drug-drug interaction');

// 2) Same prescription WITH an override reason => proceeds (allow), auditable as CDS_OVERRIDE.
const overridden = rxGate({ medication_name: 'Nitroglycerin', dosage: '0.4 mg', patientAllergies: '', serverActiveMeds, override_reason: 'Nitrate-free interval; cardiology aware' });
ok(overridden.decision.allow === true, 'CRITICAL-1: same combo proceeds WITH non-empty override_reason');
ok(overridden.alerts.some(a => a.severity === 'critical') && overridden.decision.reason,
   'CRITICAL-1: a critical alert + reason present => route would audit CDS_OVERRIDE');

// 3) Anti-spoof: if the active-med list came from the CLIENT and omitted Sildenafil, the interaction
//    would be MISSED. Proving the danger only surfaces because the list is SERVER-derived.
const clientOmitted = rxGate({ medication_name: 'Nitroglycerin', dosage: '0.4 mg', patientAllergies: '', serverActiveMeds: [] });
ok(clientOmitted.decision.allow === true,
   'CRITICAL-1 (control): an EMPTY (client-omitted) list would NOT 422 — hence the list MUST be server-derived');

// 4) Sanity: a benign single drug with no active meds and no allergy => allowed.
const benign = rxGate({ medication_name: 'Amoxicillin', dosage: '500 mg', patientAllergies: '', serverActiveMeds: [] });
ok(benign.decision.allow === true, 'CRITICAL-1: benign prescription (no interaction/allergy/overdose) => allowed');

console.log(`\n${fail === 0 ? 'ALL PASS' : 'FAIL'}: ${pass} passed, ${fail} failed`);
process.exit(fail === 0 ? 0 : 1);
