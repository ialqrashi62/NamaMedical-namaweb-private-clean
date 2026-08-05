/**
 * nphies_v1_stub.js — NPHIES v1 API stubs (jumanaMedical ERP)
 * ============================================================================
 * Sandbox-mode NPHIES (National Platform for Health Insurance Exchange
 * Services, Saudi Arabia) endpoints exposed under /api/v1/nphies. Returns
 * valid response SHAPES only — no real network call to NPHIES, no real
 * claim/eligibility submission.
 *
 * This file is the v1-NAMESPACE stub layer. The existing ./nphies_client.js
 * (GATE-INT) is the lower-level FHIR R4 Bundle builder + NphiesClient class;
 * the v1 stubs reuse its env-flag convention and return shapes that match
 * the public API contract the NPHIES gateway expects.
 *
 * Endpoints (mounted at /api/v1/nphies)
 *   GET  /status                → {status, last_check, environment, mode}
 *   GET  /test                  → {ok, message, environment, ts}
 *   POST /claim/submit          → {claim_id, status, environment, ts}
 *   POST /eligibility           → {eligible, coverage, environment, ts}
 *
 * Safety rails honored
 *   - Tenant isolated (rail 5): all writes (when added) MUST be scoped to
 *     req.session.user.tenantId. Stubs do not touch the DB; this comment
 *     is the contract for the next implementer.
 *   - Idempotent (rail 6): claim/submit + eligibility are money/claim
 *     routes in production. The sandbox stub does not mutate state, so
 *     no makeIdempotencyGuard is attached. PRODUCTION (real CSID/OTP
 *     credentials) MUST add makeIdempotencyGuard + requireTenantScope
 *     on every money/claim route.
 *   - Fail-closed (rail 11): every handler returns a JSON shape even on
 *     error (no thrown 500s to the client).
 *   - No PHI in logs (rail 12): log line carries only method, path,
 *     session.user.id, env (no body, no header, no PHI).
 *   - Auth: requireAuth is applied at the outer mount in server.js
 *     (defense-in-depth). Stubs refuse anonymous callers.
 *
 * Production note
 *   The 'sandbox' environment tag is the source of truth. As soon as a
 *   real CSID + OTP is provisioned, flip NPHIES_ENV=sandbox->production,
 *   set NPHIES_BASE_URL + NPHIES_CERT_PATH/KEY_PATH, and replace each
 *   stub body with the real HTTP call (using the existing
 *   ./nphies_client.js NphiesClient class). Wire idempotencyGuard +
 *   tenant scope at that point.
 *
 * Author: Backend API engineer
 * Created: 2026-07-29
 */
'use strict';

const express = require('express');
const router = express.Router();

// ---------------------------------------------------------------------------
// Helpers (no PHI in logs)
// ---------------------------------------------------------------------------

// Environment tag — never trust the client, default to 'sandbox'.
function getNphiesEnv() {
    return process.env.NPHIES_ENV || 'sandbox';
}

// ISO-8601 timestamp at request time.
function nowIso() {
    return new Date().toISOString();
}

// Safe log line: only method, path, session.user.id, no body/header.
function safeLogLine(req, status, msg) {
    const u = req.session && req.session.user;
    const userId = u && (u.id !== undefined && u.id !== null) ? u.id : 'anon';
    const t = new Date().toISOString();
    return `[nphies_v1_stub] ${t} env=${getNphiesEnv()} user=${userId} ${req.method} ${req.originalUrl || req.url} -> ${status} ${msg || ''}`;
}

// Async handler wrapper. Translates thrown errors to a 500 JSON without
// leaking the stack trace to the client (rail 12 — never print req.body).
function ah(handler) {
    return async (req, res, next) => {
        try { await handler(req, res, next); }
        catch (e) {
            console.error(safeLogLine(req, 500, e && e.message));
            res.status(500).json({ error: 'NPHIES sandbox error' });
        }
    };
}

// Random claim id shaped like a NPHIES tracking reference
// (4-letter prefix + 24 hex chars). NOT a real NPHIES id — sandbox only.
function sandboxClaimId() {
    const bytes = [];
    for (let i = 0; i < 24; i += 1) {
        bytes.push(Math.floor(Math.random() * 16).toString(16));
    }
    return 'CLM-' + bytes.join('').toUpperCase();
}

// Build a sandbox coverage stub. Shape mirrors the NPHIES `Coverage`
// resource subset we surface to clients (only the marketing-safe fields).
function sandboxCoverage(req) {
    const tenantId = (req.session && req.session.user &&
        (req.session.user.tenantId || req.session.user.tenant_id)) || null;
    return {
        payer_id: 'NPHIES-SANDBOX-PAYER',
        payer_name: 'Sandbox Payer',
        member_id: 'MEMBER-' + String(Date.now()).slice(-6),
        plan_code: 'SANDBOX-PLAN-01',
        network: 'SANDBOX-NETWORK',
        class: 'standard',
        effective_from: nowIso(),
        effective_to: null,
        copay_pct: 0.20,
        deductible: 0,
        // Audit-only echo of the requesting tenant (read from session, never body)
        tenant_id: tenantId
    };
}

// ---------------------------------------------------------------------------
// 1. GET /status — connectivity + last health check
// ---------------------------------------------------------------------------
router.get('/status', ah(async (req, res) => {
    const env = getNphiesEnv();
    res.json({
        status: 'connected',
        last_check: nowIso(),
        environment: env,
        mode: env === 'production' ? 'real-calls' : 'sandbox-stub'
        // Note: tenant_id is NOT included; this endpoint is operator-facing.
    });
}));

// ---------------------------------------------------------------------------
// 2. GET /test — liveness probe (fixes /api/v1/nphies/test 404)
// ---------------------------------------------------------------------------
router.get('/test', ah(async (req, res) => {
    res.json({
        ok: true,
        message: 'NPHIES client reachable (sandbox mode)',
        environment: getNphiesEnv(),
        ts: nowIso()
    });
}));

// ---------------------------------------------------------------------------
// 3. POST /claim/submit — sandbox dry-run. PRODUCTION must add
//    makeIdempotencyGuard + requireTenantScope + real HTTP call to NPHIES.
// ---------------------------------------------------------------------------
router.post('/claim/submit', ah(async (req, res) => {
    const claimId = sandboxClaimId();
    res.json({
        claim_id: claimId,
        status: 'submitted',
        environment: getNphiesEnv(),
        ts: nowIso()
        // No PHI echo. Real submission would attach NPHIES tracking refs.
    });
}));

// ---------------------------------------------------------------------------
// 4. POST /eligibility — sandbox dry-run. PRODUCTION must add
//    makeIdempotencyGuard + requireTenantScope + real HTTP call to NPHIES.
// ---------------------------------------------------------------------------
router.post('/eligibility', ah(async (req, res) => {
    res.json({
        eligible: true,
        coverage: sandboxCoverage(req),
        environment: getNphiesEnv(),
        ts: nowIso()
    });
}));

module.exports = router;
