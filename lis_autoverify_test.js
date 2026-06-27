/**
 * lis_autoverify_test.js  (DB-free; run: node lis_autoverify_test.js)
 * ==========================================================================
 * Unit tests for the E3 LIS clinical-safety core (lis.js):
 *   - autoVerify: in-range -> verified; abnormal/critical/delta/missing-data -> HOLD (fail-safe)
 *   - isCritical: panic-value flagging
 *   - parseHL7ORU: valid maps; malformed rejected safely
 *   - qcFlag: 1-3s breach + invalid-input fail-safe
 * Exit non-zero on any failure.
 */
const lis = require('./lis');

let passed = 0, failed = 0;
const fails = [];
function chk(name, cond) {
    if (cond) { passed++; console.log('  PASS — ' + name); }
    else { failed++; fails.push(name); console.log('  FAIL — ' + name); }
}

console.log('\n=== E3 LIS autoVerify / isCritical / HL7 / QC unit tests ===\n');

// ---------- autoVerify: HAPPY PATH (verified) ----------
console.log('[1] autoVerify — in-range, no critical, no prior -> verified');
{
    const v = lis.autoVerify({ test_name: 'Sodium', value: 140, unit: 'mEq/L', ref_low: 136, ref_high: 145 }, null);
    chk('in-range first result is VERIFIED', v.status === 'verified');
    chk('in-range flagged N', v.abnormal_flag === 'N');
    chk('in-range is_abnormal=0', v.is_abnormal === 0);
    chk('in-range no hold reasons', v.reasons.length === 0);
    chk('in-range not critical', v.is_critical === false);
}

console.log('[2] autoVerify — in-range with a NON-significant prior delta -> verified');
{
    const v = lis.autoVerify({ test_name: 'Sodium', value: 141, ref_low: 136, ref_high: 145 },
                             { test_name: 'Sodium', value: 139 });
    chk('small delta still VERIFIED', v.status === 'verified');
    chk('delta_pct computed', typeof v.delta_pct === 'number');
}

// ---------- autoVerify: HOLD paths (fail-safe) ----------
console.log('[3] autoVerify — out-of-range -> HOLD');
{
    const v = lis.autoVerify({ test_name: 'Sodium', value: 150, ref_low: 136, ref_high: 145 }, null);
    chk('out-of-range HELD', v.status === 'held');
    chk('out-of-range flagged H', v.abnormal_flag === 'H');
    chk('out-of-range reason out_of_range', v.reasons.includes('out_of_range'));
    chk('out-of-range is_abnormal=1', v.is_abnormal === 1);
}

console.log('[4] autoVerify — CRITICAL value -> HOLD (never auto-verify)');
{
    // Potassium critical high >= 6.5; within ref range would never matter — critical dominates.
    const v = lis.autoVerify({ test_name: 'Potassium', value: 7.0, ref_low: 3.5, ref_high: 5.0 }, null);
    chk('critical HELD', v.status === 'held');
    chk('critical flagged is_critical', v.is_critical === true);
    chk('critical reason present', v.reasons.includes('critical_value'));
}

console.log('[5] autoVerify — significant delta vs prior -> HOLD');
{
    const v = lis.autoVerify({ test_name: 'Creatinine', value: 1.2, ref_low: 0.6, ref_high: 1.3 },
                             { test_name: 'Creatinine', value: 0.6 }); // +100% change
    chk('significant delta HELD', v.status === 'held');
    chk('delta reason present', v.reasons.includes('significant_delta'));
}

console.log('[6] autoVerify — MISSING value -> HOLD (fail-safe)');
{
    const v = lis.autoVerify({ test_name: 'Glucose', value: '', ref_low: 70, ref_high: 100 }, null);
    chk('missing value HELD', v.status === 'held');
    chk('missing value reason', v.reasons.includes('non_numeric_value'));
}

console.log('[7] autoVerify — MISSING reference range -> HOLD (fail-safe)');
{
    const v = lis.autoVerify({ test_name: 'Glucose', value: 90 }, null);
    chk('missing range HELD', v.status === 'held');
    chk('missing range reason', v.reasons.includes('missing_reference_range'));
}

console.log('[8] autoVerify — INVALID range (low>high) -> HOLD');
{
    const v = lis.autoVerify({ test_name: 'Glucose', value: 90, ref_low: 100, ref_high: 70 }, null);
    chk('invalid range HELD', v.status === 'held');
    chk('invalid range reason', v.reasons.includes('invalid_reference_range'));
}

console.log('[9] autoVerify — MALFORMED prior -> HOLD (cannot delta-check)');
{
    const v = lis.autoVerify({ test_name: 'Sodium', value: 140, ref_low: 136, ref_high: 145 },
                             { test_name: 'Sodium', value: 'N/A' });
    chk('malformed prior HELD', v.status === 'held');
    chk('malformed prior reason', v.reasons.includes('malformed_prior'));
}

console.log('[10] autoVerify — non-numeric value never silently verifies even if "looks normal"');
{
    const v = lis.autoVerify({ test_name: 'Sodium', value: 'normal', ref_low: 136, ref_high: 145 }, null);
    chk('text value HELD', v.status === 'held');
}

// ---------- isCritical ----------
console.log('[11] isCritical');
{
    chk('Potassium 7.0 critical', lis.isCritical({ test_name: 'Serum Potassium', value: 7.0 }).critical === true);
    chk('Potassium 4.0 not critical', lis.isCritical({ test_name: 'Potassium', value: 4.0 }).critical === false);
    chk('unknown analyte not critical', lis.isCritical({ test_name: 'Foobarin', value: 9999 }).critical === false);
    chk('non-numeric not critical (but holdable)', lis.isCritical({ test_name: 'Potassium', value: 'high' }).critical === false);
}

// ---------- HL7 parse ----------
console.log('[12] parseHL7ORU — valid ORU maps to barcode + results');
{
    const msg = [
        'MSH|^~\\&|ANALYZER|LAB|LIS|HOSP|20260626120000||ORU^R01|MSG1|P|2.5',
        'PID|1||P123||DOE^JOHN',
        'OBR|1|PL999|LAB-42-abc123|CBC^Complete Blood Count',
        'OBX|1|NM|718-7^Hemoglobin|1|14.2|g/dL|13.5-17.5|N|||F',
        'OBX|2|NM|2823-3^Potassium|1|7.1|mEq/L|3.5-5.0|H|||F',
    ].join('\r');
    const p = lis.parseHL7ORU(msg);
    chk('valid HL7 ok', p.ok === true);
    chk('barcode from OBR-3', p.barcode === 'LAB-42-abc123');
    chk('two OBX results', p.results.length === 2);
    chk('first result name', p.results[0].test_name === 'Hemoglobin');
    chk('first result loinc', p.results[0].loinc === '718-7');
    chk('ref range parsed', p.results[0].ref_low === 13.5 && p.results[0].ref_high === 17.5);
    // auto-verify of the potassium OBX must HOLD (critical)
    const v = lis.autoVerify(p.results[1], null);
    chk('HL7 critical OBX auto-holds', v.status === 'held' && v.is_critical === true);
}

console.log('[13] parseHL7ORU — malformed rejected safely (no throw)');
{
    chk('empty -> not ok', lis.parseHL7ORU('').ok === false);
    chk('null -> not ok', lis.parseHL7ORU(null).ok === false);
    chk('missing MSH -> not ok', lis.parseHL7ORU('OBR|1||LAB-1').ok === false);
    chk('no barcode -> not ok', lis.parseHL7ORU('MSH|^~\\&|A\rOBX|1|NM|X^Y|1|5||1-9').ok === false);
    chk('no OBX -> not ok', lis.parseHL7ORU('MSH|^~\\&|A\rOBR|1||LAB-7').ok === false);
}

// ---------- delta baseline selection (server prior-query semantics) ----------
// CLINICAL SAFETY: the server's prior-result query selects ONLY status='verified' priors as the
// delta baseline (server.js POST /api/lab/results). A held/pending prior must be IGNORED so it
// cannot suppress a true significant delta. Simulate that selection here, then feed into autoVerify.
console.log('[14] delta baseline ignores a HELD prior (only VERIFIED baseline) -> correct hold/verify');
{
    // mirrors:  ... AND lr.status = 'verified' ORDER BY lr.id DESC LIMIT 1
    function selectPriorBaseline(priorRows) {
        return priorRows.filter(r => r.status === 'verified').sort((a, b) => b.id - a.id)[0] || null;
    }
    // History for an analyte: a recent HELD erroneous low prior, plus an older VERIFIED stable prior.
    const history = [
        { id: 10, test_name: 'Creatinine', value: 0.6, status: 'verified' }, // true baseline
        { id: 20, test_name: 'Creatinine', value: 1.19, status: 'held' },     // unverified/erroneous, must be ignored
    ];
    const baseline = selectPriorBaseline(history);
    chk('held prior is NOT chosen as baseline', baseline && baseline.id === 10);
    chk('verified prior IS chosen as baseline', baseline && baseline.status === 'verified' && baseline.value === 0.6);

    // New value 1.2 vs the VERIFIED baseline 0.6 = +100% -> significant delta -> HOLD (correct/safe).
    const vAgainstVerified = lis.autoVerify({ test_name: 'Creatinine', value: 1.2, ref_low: 0.6, ref_high: 1.3 }, baseline);
    chk('delta vs VERIFIED baseline -> HOLD (significant_delta)',
        vAgainstVerified.status === 'held' && vAgainstVerified.reasons.includes('significant_delta'));

    // Counter-proof: had the HELD prior (1.19) been (wrongly) used, the delta would be ~+0.8% and
    // the result would have been silently VERIFIED — the exact suppression this fix prevents.
    const wrongBaseline = history.find(r => r.id === 20);
    const vAgainstHeld = lis.autoVerify({ test_name: 'Creatinine', value: 1.2, ref_low: 0.6, ref_high: 1.3 }, wrongBaseline);
    chk('using the HELD prior would have WRONGLY verified (suppression demonstrated)',
        vAgainstHeld.status === 'verified');

    // No verified prior at all -> baseline null -> first-result path (in-range -> verified).
    chk('no verified prior -> null baseline', selectPriorBaseline([{ id: 5, test_name: 'X', value: 1, status: 'held' }]) === null);
}

// ---------- QC ----------
console.log('[15] qcFlag — Levey-Jennings 1-3s + fail-safe');
{
    chk('in control (z<2)', lis.qcFlag(10.1, 10.0, 0.2).breach === false);
    chk('1-2s warning not breach', lis.qcFlag(10.5, 10.0, 0.2).rule === '1-2s_warning');
    chk('1-3s breach', lis.qcFlag(10.7, 10.0, 0.2).breach === true);
    chk('invalid sd=0 -> breach (fail-safe)', lis.qcFlag(10, 10, 0).breach === true);
    chk('non-numeric -> breach (fail-safe)', lis.qcFlag('x', 10, 1).breach === true);
}

console.log('\n=== RESULT: ' + passed + ' passed, ' + failed + ' failed ===');
if (failed) { console.log('FAILURES:\n  - ' + fails.join('\n  - ')); }
console.log(passed + '/' + (passed + failed) + ' PASS');
process.exit(failed ? 1 : 0);
