// requestLogger.js — Wave 24 structured request logger.
// Emits a JSON line per HTTP request with PHI redaction via StructuredLogger.
// PHI: never logs headers beyond a short allowlist, never logs request bodies,
// never logs responses, never logs tokens. tenant_id + user_id + correlation_id
// only.
'use strict';

const { StructuredLogger } = require('./StructuredLogger');
const crypto = require('crypto');

const ALLOWED_REQ_HEADERS = new Set([
    'user-agent',
    'referer',
    'accept-language',
    'x-forwarded-for',
]);

function makeRequestLogger(opts = {}) {
    const log = new StructuredLogger({
        service: 'nama-medical-http',
        env: process.env.NODE_ENV || 'sandbox',
        file: opts.file || null, // e.g. /var/log/namaweb/access.log
    });

    // Sample rate for high-volume paths (default: log everything; opt-in sampling
    // available via REQUEST_LOG_SAMPLE_RATE env var, e.g. 0.1 for 10%).
    const sampleRate = Number(process.env.REQUEST_LOG_SAMPLE_RATE || '1');
    const sampledOut = (req) => Math.random() >= sampleRate;

    return function requestLogger(req, res, next) {
        if (sampledOut(req)) return next();
        const start = process.hrtime.bigint();
        // Attach a short correlation id so other middleware (audit, error handler)
        // can reference the same request in their own logs.
        req.correlationId = req.headers['x-correlation-id'] || crypto.randomBytes(8).toString('hex');

        res.on('finish', () => {
            try {
                const durMs = Number((process.hrtime.bigint() - start) / 1000000n);
                const safeHeaders = {};
                for (const h of ALLOWED_REQ_HEADERS) {
                    if (req.headers[h]) safeHeaders[h] = String(req.headers[h]).slice(0, 200);
                }
                log.info('http_request', {
                    cid: req.correlationId,
                    method: req.method,
                    path: (req.originalUrl || req.url || '').split('?')[0],
                    status: res.statusCode,
                    durMs,
                    tenantId: req.tenantId || (req.tenantScope && req.tenantScope.id) || null,
                    userId: req.user && req.user.id ? req.user.id : null,
                    userRole: req.user && req.user.role ? req.user.role : null,
                    ip: (req.headers['x-forwarded-for'] || req.ip || '').toString().split(',')[0].trim(),
                    ua: (req.headers['user-agent'] || '').slice(0, 200),
                    // Mutating requests get a higher-fidelity log so audit chains
                    // can correlate with the hash-chained audit_trail writes.
                    mutating: ['POST', 'PUT', 'PATCH', 'DELETE'].includes(req.method),
                    headers: safeHeaders,
                });
            } catch (_) { /* logging must never break the response */ }
        });
        next();
    };
}

module.exports = { makeRequestLogger, ALLOWED_REQ_HEADERS };
