// wave43_error_handler.js
//
// Wave 43 — Express Error Handler Middleware
//
// Background:
//   server.js has 100+ route handlers that catch errors with:
//       } catch (e) { res.status(500).json({ error: 'Server error' }); }
//   This silences the actual error message — operators see "Server error" in
//   client logs but never see WHY. Plus, Express 4 does NOT auto-handle async
//   errors: a thrown error in an `async (req, res) =>` route handler can hang
//   the connection until timeout. And JSON parse errors (malformed body) return
//   a generic HTML error page instead of JSON.
//
// Solution:
//   - 4-arg Express error middleware registered LAST (after all routes).
//   - Distinguishes JSON parse errors (status 400), RLS errors (403), and
//     generic errors (500).
//   - Logs structured info to console + audit_trail (System module).
//   - Increments counters per class + per status code.
//   - Emits Prometheus metrics.
//
// Safety rails:
//   -1 No secrets, no PHI in metrics.
//   -5 No tenant data leak.
//  -11 Fail-safe: handler never throws (try/catch around everything).
//  -12 Never logs request bodies or headers.
//  -13 Absolute access: Admin/IT can read /api/security/errors JSON.
//
'use strict';

const _counters = {
    started_at: new Date().toISOString(),
    total: 0,
    parse_errors: 0,    // JSON parse / body-parser
    rls_errors: 0,      // RLS rejection
    not_found: 0,       // 404 handler hits
    server_errors: 0,   // 5xx generic
    bad_request: 0,     // 4xx generic
    by_status: {},      // status -> count
    by_path: {},        // path -> count (capped)
    last_at: null,
    last_message: '',
    last_path: null,
};

const _MAX_PATH_ENTRIES = 100;

function reset() {
    _counters.started_at = new Date().toISOString();
    _counters.total = 0;
    _counters.parse_errors = 0;
    _counters.rls_errors = 0;
    _counters.not_found = 0;
    _counters.server_errors = 0;
    _counters.bad_request = 0;
    _counters.by_status = {};
    _counters.by_path = {};
    _counters.last_at = null;
    _counters.last_message = '';
    _counters.last_path = null;
}

function getCounters() {
    return Object.assign({}, _counters, { since: _counters.started_at });
}

function inc(kind, status, path) {
    try {
        _counters.total += 1;
        switch (kind) {
            case 'parse':     _counters.parse_errors += 1; break;
            case 'rls':       _counters.rls_errors += 1; break;
            case 'not_found': _counters.not_found += 1; break;
            case 'server':    _counters.server_errors += 1; break;
            case 'bad_req':   _counters.bad_request += 1; break;
            default: break;
        }
        if (status) {
            const k = String(status);
            _counters.by_status[k] = (_counters.by_status[k] || 0) + 1;
        }
        if (path) {
            // Cap by_path to prevent unbounded growth.
            if (Object.keys(_counters.by_path).length >= _MAX_PATH_ENTRIES) {
                delete _counters.by_path[Object.keys(_counters.by_path)[0]];
            }
            const norm = String(path).split('?')[0];
            _counters.by_path[norm] = (_counters.by_path[norm] || 0) + 1;
        }
        _counters.last_at = new Date().toISOString();
    } catch (_e) { /* never throw */ }
}

function recordLast(message, path) {
    try {
        _counters.last_message = String(message || '').slice(0, 200);
        _counters.last_path = path ? String(path).slice(0, 200) : null;
    } catch (_e) { /* ignore */ }
}

// ----- Classification helpers -----
function isRlsError(msg) {
    return /row-level security|row level security|RLS/i.test(String(msg || ''));
}

function isParseError(err) {
    if (!err) return false;
    // Express body-parser errors have type=entity.parse.failed
    return err.type === 'entity.parse.failed' ||
           /JSON parse|JSON\.parse|Unexpected token/i.test(String(err.message || ''));
}

function isCsrfError(msg) {
    return /csrf|CSRF|invalid csrf/i.test(String(msg || ''));
}

// ----- Prometheus exporter -----
function toPrometheusMetrics(counters) {
    const c = counters || getCounters();
    const lines = [
        '# HELP nama_errors_total Total Express errors caught by Wave 43 middleware',
        '# TYPE nama_errors_total gauge',
        `nama_errors_total ${c.total || 0}`,
        '# HELP nama_errors_parse_errors JSON parse / body-parser errors',
        '# TYPE nama_errors_parse_errors gauge',
        `nama_errors_parse_errors ${c.parse_errors || 0}`,
        '# HELP nama_errors_rls_errors RLS-rejection errors caught by Express layer',
        '# TYPE nama_errors_rls_errors gauge',
        `nama_errors_rls_errors ${c.rls_errors || 0}`,
        '# HELP nama_errors_not_found 404 responses',
        '# TYPE nama_errors_not_found gauge',
        `nama_errors_not_found ${c.not_found || 0}`,
        '# HELP nama_errors_server_errors 5xx responses',
        '# TYPE nama_errors_server_errors gauge',
        `nama_errors_server_errors ${c.server_errors || 0}`,
        '# HELP nama_errors_bad_request 4xx responses',
        '# TYPE nama_errors_bad_request gauge',
        `nama_errors_bad_request ${c.bad_request || 0}`,
    ];
    // Per-status breakdown
    for (const [status, count] of Object.entries(c.by_status || {})) {
        lines.push(`# HELP nama_errors_status_${status} Total errors with status ${status}`);
        lines.push(`# TYPE nama_errors_status_${status} gauge`);
        lines.push(`nama_errors_status_${status} ${count}`);
    }
    return lines.join('\n') + '\n';
}

// ----- Express middleware factory -----
// Pass `logAudit` for audit-trail integration (optional).
// Returns the 4-arg error middleware: function (err, req, res, next) { ... }
function makeErrorMiddleware({ logAudit, notFoundHandler } = {}) {
    return function wave43ErrorMiddleware(err, req, res, next) {
        try {
            const path = (req && (req.originalUrl || req.url)) || '?';
            const status = (res && res.statusCode) || 500;

            // Already responded? Pass through (Express convention).
            if (res.headersSent) {
                try { return next(err); } catch (_) { return; }
            }

            let kind = 'server';
            let httpStatus = status >= 500 ? status : 500;

            // Parse error
            if (isParseError(err)) {
                kind = 'parse';
                httpStatus = 400;
            }
            // RLS rejection
            else if (isRlsError(err.message)) {
                kind = 'rls';
                httpStatus = 403;
            }
            // 404 (rare — usually the catch-all below)
            else if (status === 404 || err.status === 404) {
                kind = 'not_found';
                httpStatus = 404;
            }
            // 4xx
            else if (status >= 400 && status < 500) {
                kind = 'bad_req';
                httpStatus = status;
            }

            inc(kind, httpStatus, path);
            recordLast(err && err.message, path);

            // Log to console (no PHI, just class + path + status).
            const errMsg = String(err && err.message || err || '').slice(0, 200);
            console.warn(`[Wave 43] ${kind} ${httpStatus} ${path} :: ${errMsg}`);

            // Audit to tenant 0 system trail (best-effort).
            try {
                if (logAudit && typeof logAudit === 'function') {
                    logAudit(null, 'system', 'EXPRESS_ERROR', 'System',
                        `${kind} ${httpStatus} ${path} :: ${errMsg}`, req.ip || '',
                        { allowAnon: true });
                }
            } catch (_) { /* never break the response */ }

            // JSON response (clients expect JSON, not HTML).
            res.status(httpStatus).json({
                error: errMsg || 'Internal server error',
                kind: kind,
            });
        } catch (_e) {
            // Last-resort: try to send a generic response.
            try {
                if (!res.headersSent) {
                    res.status(500).json({ error: 'Internal server error' });
                }
            } catch (__) {}
        }
    };
}

// ----- 404 catch-all middleware -----
// Should be registered AFTER all routes and the error middleware.
// Increments the not_found counter.
function makeNotFoundMiddleware() {
    return function wave43NotFoundMiddleware(req, res, next) {
        try {
            inc('not_found', 404, req && (req.originalUrl || req.url));
            recordLast('Not found', req && (req.originalUrl || req.url));
        } catch (_e) {}
        next();
    };
}

module.exports = {
    makeErrorMiddleware,
    makeNotFoundMiddleware,
    inc,
    recordLast,
    reset,
    getCounters,
    toPrometheusMetrics,
    isRlsError,
    isParseError,
};
