// wave42_process_lifecycle.js
//
// Wave 42 — Process Lifecycle Observability
//
// Background:
//   server.js's startServer() handles `app.listen(...)` errors but DOES NOT
//   register process-level handlers for:
//     1. unhandledRejection  -> Node terminates the process silently
//     2. uncaughtException   -> Node terminates the process silently
//     3. SIGTERM / SIGINT    -> abrupt exit (PM2 cluster spawns new worker;
//                              in-flight requests drop with ECONNRESET)
//
//   PM2 restart count is 21 across all 4 workers (visible in `pm2 list`),
//   which is the surface symptom: workers crash and respawn, but operators
//   don't know WHY.
//
// Solution (minimal surgery):
//   - Wave 42 module exposes counters + Prometheus metrics for the lifecycle
//     events: unhandled rejections, uncaught exceptions, graceful shutdowns.
//   - The server.js surgical patch (≤ 10 lines) registers handlers that
//     increment counters, log to console + audit_trail, and trigger graceful
//     shutdown on SIGTERM/SIGINT.
//   - The graceful shutdown closes the http server, drains in-flight, then
//     closes the DB pool, then exits 0. PM2 sees a clean exit and starts a
//     fresh worker (no restart penalty).
//
// Safety rails:
//   -1 No secrets, no PHI in metrics.
//   -5 No tenant data leak.
//   -11 Fail-safe: handlers never throw into Node's bootstrap.
//  -12 Never logs request bodies or values.
//  -13 Absolute access: Admin/IT can read /api/security/process JSON.
//
// Public surface:
//   exports.inc(kind)                       // counter increment
//   exports.getCounters()                   // { unhandled_rejections, uncaught_exceptions, graceful_shutdowns, ... }
//   exports.toPrometheusMetrics(counters)
//   exports.install({ logAudit, pool, httpServer }) // wires everything
//
// Usage:
//   const w42 = require('./wave42_process_lifecycle');
//   w42.install({ logAudit, pool, server });  // pass http server for graceful shutdown
//
'use strict';

const _counters = {
    started_at: new Date().toISOString(),
    unhandled_rejections: 0,
    uncaught_exceptions: 0,
    graceful_shutdowns: 0,
    sigterm_count: 0,
    sigint_count: 0,
    last_event_at: null,
    last_event_kind: null,
    last_event_message: '',
    shutting_down: false,
};

function reset() {
    _counters.started_at = new Date().toISOString();
    _counters.unhandled_rejections = 0;
    _counters.uncaught_exceptions = 0;
    _counters.graceful_shutdowns = 0;
    _counters.sigterm_count = 0;
    _counters.sigint_count = 0;
    _counters.last_event_at = null;
    _counters.last_event_kind = null;
    _counters.last_event_message = '';
    _counters.shutting_down = false;
}

function getCounters() {
    return Object.assign({}, _counters, {
        since: _counters.started_at,
        uptime_seconds: process.uptime(),
    });
}

function inc(kind, message) {
    try {
        switch (kind) {
            case 'unhandled_rejection': _counters.unhandled_rejections += 1; break;
            case 'uncaught_exception':  _counters.uncaught_exceptions += 1; break;
            case 'graceful_shutdown':   _counters.graceful_shutdowns += 1; break;
            case 'sigterm':             _counters.sigterm_count += 1; break;
            case 'sigint':              _counters.sigint_count += 1; break;
            default: break;
        }
        _counters.last_event_at = new Date().toISOString();
        _counters.last_event_kind = kind;
        _counters.last_event_message = String(message || '').slice(0, 200);
    } catch (_e) { /* never throw */ }
}

// ----- Prometheus exporter -----
function toPrometheusMetrics(counters) {
    const c = counters || getCounters();
    const lines = [
        '# HELP nama_process_unhandled_rejections_total Total unhandled promise rejections (Wave 42)',
        '# TYPE nama_process_unhandled_rejections_total gauge',
        `nama_process_unhandled_rejections_total ${c.unhandled_rejections || 0}`,
        '# HELP nama_process_uncaught_exceptions_total Total uncaught exceptions (Wave 42)',
        '# TYPE nama_process_uncaught_exceptions_total gauge',
        `nama_process_uncaught_exceptions_total ${c.uncaught_exceptions || 0}`,
        '# HELP nama_process_graceful_shutdowns_total Total graceful shutdowns completed',
        '# TYPE nama_process_graceful_shutdowns_total gauge',
        `nama_process_graceful_shutdowns_total ${c.graceful_shutdowns || 0}`,
        '# HELP nama_process_sigterm_total Total SIGTERM signals received',
        '# TYPE nama_process_sigterm_total gauge',
        `nama_process_sigterm_total ${c.sigterm_count || 0}`,
        '# HELP nama_process_sigint_total Total SIGINT signals received',
        '# TYPE nama_process_sigint_total gauge',
        `nama_process_sigint_total ${c.sigint_count || 0}`,
        '# HELP nama_process_uptime_seconds Seconds since the process started',
        '# TYPE nama_process_uptime_seconds gauge',
        `nama_process_uptime_seconds ${Math.floor(process.uptime())}`,
    ];
    return lines.join('\n') + '\n';
}

// ----- Install -----
// Wires all handlers into the running process. Idempotent: if called twice,
// the second call is a no-op (registered flag).
let _installed = false;
function install({ logAudit, pool, httpServer, gracefulTimeoutMs = 8000 } = {}) {
    if (_installed) return { ok: false, reason: 'already installed' };
    _installed = true;

    // ---- unhandledRejection ----
    process.on('unhandledRejection', (reason, _promise) => {
        const msg = reason instanceof Error ? reason.message : String(reason);
        inc('unhandled_rejection', msg);
        console.error('[Wave 42] Unhandled Rejection:', msg);
        try { logAudit && logAudit(null, 'system', 'UNHANDLED_REJECTION', 'System', msg, '', { allowAnon: true }); } catch (_) {}
    });

    // ---- uncaughtException ----
    process.on('uncaughtException', (err) => {
        const msg = err && err.message || String(err);
        inc('uncaught_exception', msg);
        console.error('[Wave 42] Uncaught Exception:', msg);
        try { logAudit && logAudit(null, 'system', 'UNCAUGHT_EXCEPTION', 'System', msg, '', { allowAnon: true }); } catch (_) {}
        // Trigger graceful shutdown rather than letting Node terminate mid-request.
        // PM2 will see clean exit code and respawn a fresh worker.
        gracefulShutdown({ logAudit, pool, httpServer, reason: 'uncaughtException', timeoutMs: gracefulTimeoutMs });
    });

    // ---- SIGTERM ----
    process.on('SIGTERM', () => {
        inc('sigterm');
        console.warn('[Wave 42] SIGTERM received — graceful shutdown');
        try { logAudit && logAudit(null, 'system', 'SIGTERM', 'System', 'SIGTERM received', '', { allowAnon: true }); } catch (_) {}
        gracefulShutdown({ logAudit, pool, httpServer, reason: 'SIGTERM', timeoutMs: gracefulTimeoutMs });
    });

    // ---- SIGINT ----
    process.on('SIGINT', () => {
        inc('sigint');
        console.warn('[Wave 42] SIGINT received — graceful shutdown');
        try { logAudit && logAudit(null, 'system', 'SIGINT', 'System', 'SIGINT received', '', { allowAnon: true }); } catch (_) {}
        gracefulShutdown({ logAudit, pool, httpServer, reason: 'SIGINT', timeoutMs: gracefulTimeoutMs });
    });

    return { ok: true, counters: getCounters() };
}

// ----- Graceful shutdown -----
// 1. Stop accepting new connections (httpServer.close)
// 2. Drain in-flight requests (close callback fires when done)
// 3. Close DB pool
// 4. Exit cleanly
// If timeout elapses, force-exit.
async function gracefulShutdown({ logAudit, pool, httpServer, reason, timeoutMs = 8000 } = {}) {
    if (_counters.shutting_down) {
        // Already shutting down — don't run twice.
        return;
    }
    _counters.shutting_down = true;
    inc('graceful_shutdown', reason || 'unknown');
    console.warn(`[Wave 42] Graceful shutdown initiated (reason: ${reason || 'unknown'})`);

    const deadline = Date.now() + timeoutMs;
    let forceTimer = null;

    try {
        // 1. Stop accepting new HTTP connections.
        if (httpServer && typeof httpServer.close === 'function') {
            await new Promise((resolve) => {
                const onClose = () => resolve();
                try {
                    httpServer.close(onClose);
                } catch (_) { resolve(); }
                // Safety net: if close hangs (e.g. keep-alive connection),
                // force-resolve after the deadline.
                if (Date.now() < deadline) {
                    forceTimer = setTimeout(() => {
                        console.warn('[Wave 42] HTTP close timeout — forcing drain');
                        resolve();
                    }, Math.max(100, deadline - Date.now()));
                }
            });
            if (forceTimer) clearTimeout(forceTimer);
        }

        // 2. Close DB pool.
        if (pool && typeof pool.end === 'function') {
            try { await pool.end(); } catch (_) { /* ignore */ }
        }

        try { logAudit && logAudit(null, 'system', 'GRACEFUL_SHUTDOWN', 'System', `reason=${reason || 'unknown'}`, '', { allowAnon: true }); } catch (_) {}

        // 3. Exit cleanly. PM2 sees exit code 0 and starts a fresh worker.
        process.exit(0);
    } catch (e) {
        // Even if something in the shutdown chain throws, exit cleanly.
        console.error('[Wave 42] Shutdown error:', e && e.message || e);
        process.exit(0);
    }
}

module.exports = {
    install,
    inc,
    getCounters,
    reset,
    toPrometheusMetrics,
    gracefulShutdown,  // exposed for tests
};
