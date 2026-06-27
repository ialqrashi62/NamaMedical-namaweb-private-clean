/**
 * e3_critical_callback_test.js  (DB-free; run: node e3_critical_callback_test.js)
 * ==========================================================================
 * Simulates the report-release state machine to prove the CLINICAL-SAFETY rule:
 *   - a result must be 'verified' before it can be reported
 *   - a CRITICAL result CANNOT be reported until a documented call-back exists (FAIL-CLOSED)
 *   - a non-critical verified result reports freely
 * Mirrors PUT /api/lab/results/:id/report logic in server.js.
 * Exit non-zero on any failure.
 */
let passed = 0, failed = 0;
const fails = [];
function chk(name, cond) {
    if (cond) { passed++; console.log('  PASS — ' + name); }
    else { failed++; fails.push(name); console.log('  FAIL — ' + name); }
}

// Faithful reimplementation of the server report-gate (no DB).
function tryReport(result, callbacksForResult) {
    if (!result) return { status: 404 };
    // AUDIT/INTEGRITY: re-reporting an already-reported result is rejected (not silently idempotent).
    if (result.reported) return { status: 409, error: 'Result already reported' };
    if (result.status !== 'verified') return { status: 409, error: 'must be verified' };
    if (result.is_critical) {
        const n = callbacksForResult.filter(c => c.result_id === result.id).length;
        if (n === 0) return { status: 409, code: 'CRITICAL_CALLBACK_REQUIRED' };
    }
    return { status: 200, reported: 1 };
}

console.log('\n=== E3 critical call-back enforcement (report gate) ===\n');

console.log('[1] unverified result cannot be reported');
chk('held result blocked (409)', tryReport({ id: 1, status: 'held', is_critical: 0 }, []).status === 409);
chk('pending result blocked (409)', tryReport({ id: 1, status: 'pending', is_critical: 0 }, []).status === 409);

console.log('[2] non-critical verified result reports freely');
{
    const r = tryReport({ id: 2, status: 'verified', is_critical: 0 }, []);
    chk('non-critical verified reports (200)', r.status === 200 && r.reported === 1);
}

console.log('[3] CRITICAL verified result WITHOUT call-back is BLOCKED (fail-closed)');
{
    const r = tryReport({ id: 3, status: 'verified', is_critical: 1 }, []);
    chk('critical no-callback blocked (409)', r.status === 409);
    chk('critical no-callback code', r.code === 'CRITICAL_CALLBACK_REQUIRED');
}

console.log('[4] CRITICAL verified result WITH documented call-back reports');
{
    const callbacks = [{ id: 99, result_id: 3, notified_to: 'Dr. A', notified_at: 'now' }];
    const r = tryReport({ id: 3, status: 'verified', is_critical: 1 }, callbacks);
    chk('critical with callback reports (200)', r.status === 200 && r.reported === 1);
}

console.log('[5] call-back for a DIFFERENT result does not unlock this one');
{
    const callbacks = [{ id: 100, result_id: 7, notified_to: 'Dr. B' }];
    const r = tryReport({ id: 3, status: 'verified', is_critical: 1 }, callbacks);
    chk('mismatched callback still blocked', r.status === 409 && r.code === 'CRITICAL_CALLBACK_REQUIRED');
}

console.log('[6] already-reported result cannot be re-reported (audit/integrity, not silently idempotent)');
{
    // non-critical, verified, but already reported -> 409 "already reported"
    const r1 = tryReport({ id: 8, status: 'verified', is_critical: 0, reported: 1 }, []);
    chk('re-report of reported non-critical blocked (409)', r1.status === 409 && r1.error === 'Result already reported');
    // critical, verified, with callback, but already reported -> still 409 (re-report wins over the callback path)
    const cb = [{ id: 101, result_id: 9 }];
    const r2 = tryReport({ id: 9, status: 'verified', is_critical: 1, reported: 1 }, cb);
    chk('re-report of reported critical blocked (409)', r2.status === 409 && r2.error === 'Result already reported');
    // sanity: a not-yet-reported verified result still reports once.
    const r3 = tryReport({ id: 10, status: 'verified', is_critical: 0, reported: 0 }, []);
    chk('first report still succeeds (200)', r3.status === 200 && r3.reported === 1);
}

console.log('\n=== RESULT: ' + passed + ' passed, ' + failed + ' failed ===');
if (failed) console.log('FAILURES:\n  - ' + fails.join('\n  - '));
console.log(passed + '/' + (passed + failed) + ' PASS');
process.exit(failed ? 1 : 0);
