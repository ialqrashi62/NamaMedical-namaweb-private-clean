// wave40_audit_resilience.js
//
// Wave 40 — Audit Trail Resilience
//
// Background:
//   `logAudit()` in server.js has three branches:
//     1. caller-provided or AsyncLocalStorage tenant  -> INSERT with tenant_id + hash chain
//     2. allowAnon=true                              -> SET LOCAL app.tenant_id='0' + INSERT
//     3. NEITHER                                      -> INSERT with no GUC, no tenant_id
//
//   Branch 3 silently fails RLS (audit_trail is FORCE RLS) and only logs a
//   console.error. Operators had no Prometheus signal.
//
// Solution (minimal surgery):
//   - Wave 40 owns an in-process counter object with safe increment + get.
//   - server.js is patched at two surgical points (≤ 4 lines total) to call
//     `wave40.inc('audit_call_branch_*')` and `wave40.recordError(msg)`.
//   - Wave 40 exposes a Prometheus exporter + JSON summary.
//
// Why we don't auto-route branch-3 to allowAnon:
//   Pre-tenant events (BLOCKED_AUTHORIZATION before login, etc.) are
//   intentionally "system-level" and should land in tenant 0 so they show up
//   in the admin audit trail. But auto-routing silently hides bugs (e.g. a
//   missed runWithTenant). Wave 40 SURFACES the failures via metric so
//   operators fix call sites properly with `allowAnon: true`.
//
// Safety rails:
//   -1 No secrets, no PHI. Counters only.
//   -5 Counters are in-process; not persisted.
//   -12 Never logs request bodies or values.
//  -11 Fail-safe: if inc() throws, logAudit keeps working unchanged.
//
'use strict';

const _counters = {
    started_at: new Date().toISOString(),
    calls_total: 0,
    branch_tenant: 0,
    branch_anon: 0,
    branch_nocontext: 0,
    error_rls: 0,
    error_other: 0,
    last_error_message: '',
    last_error_at: null,
};

function reset() {
    _counters.started_at = new Date().toISOString();
    _counters.calls_total = 0;
    _counters.branch_tenant = 0;
    _counters.branch_anon = 0;
    _counters.branch_nocontext = 0;
    _counters.error_rls = 0;
    _counters.error_other = 0;
    _counters.last_error_message = '';
    _counters.last_error_at = null;
}

function getCounters() {
    return Object.assign({}, _counters, { since: _counters.started_at });
}

// Hot-path: increment a counter by key. Cheap, never throws.
// Unknown keys are silently ignored (fail-safe).
function inc(kind) {
    try {
        switch (kind) {
            case 'audit_call_branch_tenant': _counters.branch_tenant += 1; _counters.calls_total += 1; break;
            case 'audit_call_branch_anon':   _counters.branch_anon += 1;   _counters.calls_total += 1; break;
            case 'audit_call_branch_nocontext': _counters.branch_nocontext += 1; _counters.calls_total += 1; break;
            case 'audit_error_rls':   _counters.error_rls += 1; break;
            case 'audit_error_other': _counters.error_other += 1; break;
            default: break;
        }
    } catch (_e) { /* never throw into the caller's chain */ }
}

function recordError(msg) {
    try {
        const s = String(msg || '').slice(0, 200);
        if (isRlsError(s)) {
            _counters.error_rls += 1;
        } else {
            _counters.error_other += 1;
        }
        _counters.last_error_message = s;
        _counters.last_error_at = new Date().toISOString();
    } catch (_e) { /* ignore */ }
}

function isRlsError(msg) {
    return /row-level security|row level security/i.test(String(msg || ''));
}

function toPrometheusMetrics(counters) {
    const c = counters || getCounters();
    const lines = [
        '# HELP nama_audit_log_calls_total Total logAudit invocations (Wave 40)',
        '# TYPE nama_audit_log_calls_total gauge',
        `nama_audit_log_calls_total ${c.calls_total || 0}`,
        '# HELP nama_audit_log_branch_tenant Branch 1 (tenant present) invocations',
        '# TYPE nama_audit_log_branch_tenant gauge',
        `nama_audit_log_branch_tenant ${c.branch_tenant || 0}`,
        '# HELP nama_audit_log_branch_anon Branch 2 (allowAnon=true) invocations',
        '# TYPE nama_audit_log_branch_anon gauge',
        `nama_audit_log_branch_anon ${c.branch_anon || 0}`,
        '# HELP nama_audit_log_branch_nocontext Branch 3 (silent-failure) invocations',
        '# TYPE nama_audit_log_branch_nocontext gauge',
        `nama_audit_log_branch_nocontext ${c.branch_nocontext || 0}`,
        '# HELP nama_audit_log_error_rls RLS rejection errors (silent failures)',
        '# TYPE nama_audit_log_error_rls gauge',
        `nama_audit_log_error_rls ${c.error_rls || 0}`,
        '# HELP nama_audit_log_error_other Other INSERT errors',
        '# TYPE nama_audit_log_error_other gauge',
        `nama_audit_log_error_other ${c.error_other || 0}`,
    ];
    return lines.join('\n') + '\n';
}

module.exports = {
    inc,
    recordError,
    isRlsError,
    getCounters,
    reset,
    toPrometheusMetrics,
};
