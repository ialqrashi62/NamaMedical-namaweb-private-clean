/**
 * e1_cds_unit_test.js — E1 Clinical Decision Support: EXTENSIVE pure unit tests.
 * No DB/HTTP, no PHI, no external deps. Run: node e1_cds_unit_test.js
 *
 * Covers (clinical-safety critical):
 *  - drug-drug interaction matrix hits + misses + single-drug-no-pair guard + severity mapping
 *  - allergy exact match + class cross-reactivity + no-allergy empty + fail-safe is NOT triggered on empty
 *  - dose out-of-range (critical) + within-range (none) + unknown drug (fail-safe warning)
 *    + non-mg/unparseable dose (fail-safe warning) + <=0 (warning)
 *  - duplicate order detection (warning) + no-duplicate + unspecified item (fail-safe warning)
 *  - severity contract: critical => hard-stop via decide(); override-with-reason => allow
 *  - FAIL-SAFE invariant: uncertainty surfaces a warning, never a silent pass
 *  - evaluateOrder aggregation: blocked flag, requiresReason flag
 */
const cds = require('./cds');
let pass = 0, fail = 0;
const ok = (c, m) => { if (c) { pass++; console.log('  PASS', m); } else { fail++; console.log('  FAIL', m); } };

const {
    checkDrugDrugInteraction, checkDrugAllergy, checkDoseRange, checkDuplicateOrder,
    evaluateOrder, decide,
} = cds;

// ---------- 1) DRUG-DRUG INTERACTION ----------
(() => {
    // Hit: Warfarin + Aspirin (high -> critical)
    const a1 = checkDrugDrugInteraction(['Warfarin', 'Aspirin']);
    ok(a1.length >= 1 && a1.every(a => a.rule === 'drug-drug'), 'interaction: Warfarin+Aspirin produces a drug-drug alert');
    ok(a1.some(a => a.severity === 'critical'), 'interaction: high severity mapped to CRITICAL (hard-stop class)');

    // Hit critical: Sildenafil + Nitrate (critical -> critical)
    const a2 = checkDrugDrugInteraction(['Sildenafil', 'Nitroglycerin']);
    ok(a2.some(a => a.severity === 'critical'), 'interaction: Sildenafil+Nitroglycerin CRITICAL (fatal hypotension)');

    // Moderate -> warning: Clopidogrel + Omeprazole
    const a3 = checkDrugDrugInteraction(['Clopidogrel', 'Omeprazole']);
    ok(a3.some(a => a.severity === 'warning'), 'interaction: moderate severity mapped to WARNING');

    // Miss: two unrelated drugs
    const a4 = checkDrugDrugInteraction(['Paracetamol', 'Vitamin C']);
    ok(a4.length === 0, 'interaction: unrelated drugs => no alerts (definitive miss, not fail-safe)');

    // Single drug => no pair can form
    const a5 = checkDrugDrugInteraction(['Warfarin']);
    ok(a5.length === 0, 'interaction: single drug => no interaction (need >=2)');

    // Single drug that looseMatches both sides must NOT self-trigger
    const a6 = checkDrugDrugInteraction(['Warfarin']); // pair Warfarin+X needs a second distinct source
    ok(a6.length === 0, 'interaction: one source drug cannot satisfy both pair members');

    // Empty / non-array
    ok(checkDrugDrugInteraction([]).length === 0, 'interaction: empty list => []');
    ok(checkDrugDrugInteraction(null).length === 0, 'interaction: null => [] (nothing to evaluate)');

    // Object form {medication_name}
    const a7 = checkDrugDrugInteraction([{ medication_name: 'Warfarin' }, { name: 'Aspirin' }]);
    ok(a7.some(a => a.severity === 'critical'), 'interaction: accepts object form {medication_name}/{name}');
})();

// ---------- 2) ALLERGY ----------
(() => {
    // Exact / direct match
    const al1 = checkDrugAllergy('Amoxicillin', ['amoxicillin']);
    ok(al1.length === 1 && al1[0].severity === 'critical' && al1[0].rule === 'allergy', 'allergy: direct match => CRITICAL');

    // Class cross-reactivity: recorded "penicillin", drug Amoxicillin
    const al2 = checkDrugAllergy('Amoxicillin', ['penicillin']);
    ok(al2.some(a => a.severity === 'critical'), 'allergy: penicillin class cross-reactivity => CRITICAL');

    // Class: recorded "sulfa", drug Sulfamethoxazole
    const al3 = checkDrugAllergy('Sulfamethoxazole', ['sulfa allergy']);
    ok(al3.some(a => a.severity === 'critical'), 'allergy: sulfa class cross-reactivity => CRITICAL');

    // Free-text comma-delimited allergies
    const al4 = checkDrugAllergy('Ibuprofen', 'penicillin, nsaid, dust');
    ok(al4.some(a => a.severity === 'critical'), 'allergy: free-text list, NSAID class match => CRITICAL');

    // No match
    const al5 = checkDrugAllergy('Paracetamol', ['penicillin']);
    ok(al5.length === 0, 'allergy: no cross-reactivity => [] (definitive)');

    // No recorded allergies => nothing to flag (NOT a fail-safe; absence of allergy data here is "none recorded")
    ok(checkDrugAllergy('Amoxicillin', []).length === 0, 'allergy: empty allergy list => []');
    ok(checkDrugAllergy('Amoxicillin', null).length === 0, 'allergy: null allergies => []');

    // No drug => nothing
    ok(checkDrugAllergy('', ['penicillin']).length === 0, 'allergy: empty drug => []');
})();

// ---------- 3) DOSE RANGE ----------
(() => {
    // Overdose -> critical
    const d1 = checkDoseRange('Paracetamol', '4000 mg', null);
    ok(d1.some(a => a.severity === 'critical' && a.rule === 'dose'), 'dose: 4000mg paracetamol > 1000 max => CRITICAL overdose');

    // Within range -> none
    const d2 = checkDoseRange('Paracetamol', '500 mg', null);
    ok(d2.length === 0, 'dose: 500mg paracetamol within range => []');

    // Numeric mg
    const d3 = checkDoseRange('Ibuprofen', 1200, null);
    ok(d3.some(a => a.severity === 'critical'), 'dose: numeric 1200 ibuprofen > 800 => CRITICAL');

    // Unknown drug => FAIL-SAFE warning (never silent pass)
    const d4 = checkDoseRange('Zzybloxin', '500 mg', null);
    ok(d4.length === 1 && d4[0].severity === 'warning' && d4[0].fail_safe === true, 'dose: unknown drug => FAIL-SAFE warning');

    // Non-mg unit => FAIL-SAFE warning (cannot compare to mg limit)
    const d5 = checkDoseRange('Paracetamol', '2 tablets', null);
    ok(d5.length === 1 && d5[0].severity === 'warning' && d5[0].fail_safe === true, 'dose: non-mg unit => FAIL-SAFE warning');

    // Unparseable dose => FAIL-SAFE warning
    const d6 = checkDoseRange('Paracetamol', 'as directed', null);
    ok(d6.length === 1 && d6[0].fail_safe === true, 'dose: unparseable => FAIL-SAFE warning');

    // <= 0 implausible => warning (not fail-safe)
    const d7 = checkDoseRange('Paracetamol', '0 mg', null);
    ok(d7.some(a => a.severity === 'warning' && !a.fail_safe), 'dose: <=0 => implausible warning');

    // No drug => nothing
    ok(checkDoseRange('', '500 mg', null).length === 0, 'dose: empty drug => []');
})();

// ---------- 4) DUPLICATE ORDER ----------
(() => {
    const active = [{ type: 'lab', catalog_ref: 'CBC' }, { type: 'med', catalog_ref: 'Amoxicillin' }];

    // Duplicate lab CBC -> warning
    const du1 = checkDuplicateOrder({ type: 'lab', catalog_ref: 'CBC' }, active);
    ok(du1.some(a => a.severity === 'warning' && a.rule === 'duplicate'), 'duplicate: same-type same-item => WARNING');

    // Not a duplicate
    const du2 = checkDuplicateOrder({ type: 'lab', catalog_ref: 'LFT' }, active);
    ok(du2.length === 0, 'duplicate: different item => [] (definitive)');

    // Unspecified item => FAIL-SAFE warning
    const du3 = checkDuplicateOrder({ type: 'lab' }, active);
    ok(du3.length === 1 && du3[0].fail_safe === true, 'duplicate: unspecified item => FAIL-SAFE warning');

    // No active orders, valid item => no duplicate
    const du4 = checkDuplicateOrder({ type: 'med', catalog_ref: 'Aspirin' }, []);
    ok(du4.length === 0, 'duplicate: empty active list + known item => []');

    // Null order => []
    ok(checkDuplicateOrder(null, active).length === 0, 'duplicate: null order => []');
})();

// ---------- 5) decide() SEVERITY / OVERRIDE CONTRACT ----------
(() => {
    const critical = [{ severity: 'critical', message: 'x' }];
    const warning = [{ severity: 'warning', message: 'y' }];

    const dc1 = decide(critical, '');
    ok(dc1.allow === false && dc1.status === 422, 'decide: CRITICAL + no reason => HARD-STOP 422');

    const dc2 = decide(critical, '   ');
    ok(dc2.allow === false, 'decide: CRITICAL + whitespace-only reason => still blocked');

    const dc3 = decide(critical, 'Benefit outweighs risk, monitoring INR');
    ok(dc3.allow === true && dc3.reason, 'decide: CRITICAL + valid reason => allow (override audited by route)');

    const dc4 = decide(warning, '');
    ok(dc4.allow === true, 'decide: WARNING only + no reason => allow (soft)');

    const dc5 = decide([], '');
    ok(dc5.allow === true, 'decide: no alerts => allow');
})();

// ---------- 6) evaluateOrder AGGREGATION ----------
(() => {
    // Med order with allergy -> blocked
    const e1 = evaluateOrder({
        type: 'med', med: 'Amoxicillin', dose: '500 mg',
        patient: { allergies: 'penicillin' }, activeMeds: [], activeOrders: [],
    });
    ok(e1.hasCritical === true && e1.blocked === true && e1.requiresReason === true, 'evaluateOrder: med+penicillin allergy => blocked + requiresReason');

    // Med order, safe drug + interaction with active med
    const e2 = evaluateOrder({
        type: 'med', med: 'Aspirin', dose: '100 mg',
        patient: { allergies: '' }, activeMeds: ['Warfarin'], activeOrders: [],
    });
    ok(e2.hasCritical === true, 'evaluateOrder: Aspirin + active Warfarin => CRITICAL interaction surfaced');

    // Lab order duplicate => warning only (not blocked)
    const e3 = evaluateOrder({
        type: 'lab', catalog_ref: 'CBC',
        activeOrders: [{ type: 'lab', catalog_ref: 'CBC' }],
    });
    ok(e3.hasCritical === false && e3.blocked === false && e3.requiresReason === true, 'evaluateOrder: duplicate lab => warning (not blocked) but requiresReason');

    // Med order unknown drug => fail-safe warning, not blocked
    const e4 = evaluateOrder({
        type: 'med', med: 'Zzybloxin', dose: '500 mg',
        patient: { allergies: '' }, activeMeds: [], activeOrders: [],
    });
    ok(e4.blocked === false && e4.alerts.some(a => a.fail_safe === true), 'evaluateOrder: unknown drug => FAIL-SAFE warning, not blocked');
})();

// ---------- 7) FAIL-SAFE INVARIANT sweep ----------
(() => {
    // Every fail_safe alert must be at least 'warning' (never 'info', never absent => silent pass)
    const samples = [
        checkDoseRange('Unknownium', '5 mg', null),
        checkDoseRange('Paracetamol', '2 tabs', null),
        checkDuplicateOrder({ type: 'lab' }, []),
    ];
    let allWarn = true;
    samples.forEach(arr => arr.forEach(a => { if (a.fail_safe && !(a.severity === 'warning' || a.severity === 'critical')) allWarn = false; }));
    ok(allWarn, 'fail-safe invariant: uncertainty always surfaces >= warning (never silent pass)');
})();

console.log(`\n${fail === 0 ? 'ALL PASS' : 'FAIL'}: ${pass} passed, ${fail} failed`);
process.exit(fail === 0 ? 0 : 1);
