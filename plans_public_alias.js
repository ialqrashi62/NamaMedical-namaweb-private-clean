/**
 * plans_public_alias.js — Public plans alias under /api/v1 namespace
 * ============================================================================
 * Thin wrapper that exposes the SAME active-plan shape as /api/public/plans
 * under the new /api/v1 namespace requested by the client. Specifically:
 *
 *   GET /api/v1/plans/list   →  same payload as /api/public/plans
 *   GET /api/v1/plans        →  same payload as /api/public/plans
 *
 * Implementation strategy: re-execute the SAME public query + projection
 * the makePublicPlansRouter uses (./plans.js), so the public list shape
 * stays in lock-step. When the underlying publicPlanView changes, this
 * file is updated in the same patch.
 *
 * Safety rails honored
 *   - No auth (intentional): mirrors the existing /api/public/plans
 *     semantics. The endpoint returns ACTIVE plans with marketing-safe
 *     fields only (no disabled plans, no internal admin fields), and an
 *     empty array when the catalog tables are absent.
 *   - Tenant isolation (rail 5): N/A — public read surface; no PHI, no
 *     tenant-scoped data is touched.
 *   - No PHI in logs (rail 12): this module does not log; errors are
 *     swallowed and the response degrades to an empty plans array, just
 *     like the original /api/public/plans endpoint.
 *   - Fail-closed (rail 11): on any DB error we return 200 with empty
 *     plans, matching the existing public surface behavior.
 *
 * Author: Backend API engineer
 * Created: 2026-07-29
 */
'use strict';

const express = require('express');
const router = express.Router();

const { publicPlanView } = require('./plans');
const { pool } = require('./db_postgres');

// Replicate the inner /api/public/plans query + view so both new paths
// return the EXACT same payload without depending on Express router
// delegation tricks.
async function listActivePublicPlans() {
    try {
        const plans = (await pool.query(
            'SELECT * FROM plans WHERE active=true ORDER BY sort_order ASC, id ASC'
        )).rows;
        const ents = (await pool.query('SELECT * FROM plan_entitlements')).rows;
        const byId = {};
        for (const e of ents) byId[e.plan_id] = e;
        return { plans: plans.map(p => publicPlanView(p, byId[p.id])) };
    } catch (_) {
        // Catalog not provisioned yet (or any read error) -> empty,
        // never 500 on the public surface.
        return { plans: [] };
    }
}

// GET /api/v1/plans/list  (new canonical path requested by the client)
router.get('/list', async (req, res) => {
    res.json(await listActivePublicPlans());
});

// GET /api/v1/plans       (shorter alias for the same shape)
router.get('/', async (req, res) => {
    res.json(await listActivePublicPlans());
});

module.exports = router;
