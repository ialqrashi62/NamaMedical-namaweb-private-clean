// nephrology_router.js
// Nephrology HTTP routes — CKD staging + dialysis adequacy + AKI
'use strict';

const express = require('express');
const router = express.Router();
const db = require('./db_postgres');
const { requireAuth, requireTenantScope, requireRole, validateBody, idempotencyGuard } = require('./mw');
const RS = require('./route_schemas');
const ckd = require('./ckd_staging_engine');
const hd = require('./hd_adequacy_engine');

// ============================================================
// POST /api/nephrology/ckd-stage
// CKD stage by eGFR + albuminuria (KDIGO 2024)
// ============================================================
router.post('/ckd-stage',
    requireAuth,
    requireTenantScope,
    requireRole('doctor'),
    validateBody(RS.nephrologyCkdStageCreate),
    idempotencyGuard,
    async (req, res) => {
        try {
            // ckdStaging requires egfr and albuminuria_category
            const egfrResult = ckd.ckdEgfr(req.validated);
            const stageResult = ckd.ckdStaging({
                egfr: egfrResult.egfr,
                albuminuria_category: req.validated.albuminuria_category
            });
            res.status(201).json({
                ...stageResult,
                egfr_calc: egfrResult.egfr,
                egfr_formula: egfrResult.formula,
                cite: 'KDIGO-2024-CKD'
            });
        } catch (err) {
            if (err.message && err.message.includes('required')) {
                return res.status(400).json({ error: 'invalid_input', detail: err.message });
            }
            console.error('POST /api/nephrology/ckd-stage', err);
            res.status(500).json({ error: 'internal_error' });
        }
    }
);

// ============================================================
// POST /api/nephrology/hd-adequacy
// Hemodialysis adequacy (Kt/V + URR)
// ============================================================
router.post('/hd-adequacy',
    requireAuth,
    requireTenantScope,
    requireRole('doctor'),
    validateBody(RS.nephrologyHdAdequacyCreate),
    idempotencyGuard,
    async (req, res) => {
        try {
            const result = hd.hdAdequacy(req.validated);
            res.status(201).json(result);
        } catch (err) {
            if (err.message && err.message.includes('required')) {
                return res.status(400).json({ error: 'invalid_input', detail: err.message });
            }
            console.error('POST /api/nephrology/hd-adequacy', err);
            res.status(500).json({ error: 'internal_error' });
        }
    }
);

// ============================================================
// GET /api/nephrology/categories (KDIGO reference)
// ============================================================
router.get('/categories',
    requireAuth,
    requireTenantScope,
    async (req, res) => {
        res.json({
            gfr_categories: ckd.KDIGO_CATEGORIES,
            albuminuria_categories: ckd.ALBUMINURIA_CATEGORIES,
            hd_targets: {
                min_ktv: hd.MIN_KTV,
                target_ktv: hd.TARGET_KTV,
                min_urr_pct: hd.MIN_URR_PCT,
                weekly_target_ktv: hd.WEEKLY_TARGET_KTV
            },
            cite: 'KDIGO-2024'
        });
    }
);

module.exports = router;
