// gi_router.js
// Gastroenterology HTTP routes — GI bleed risk (Glasgow-Blatchford) + IBD activity
'use strict';

const express = require('express');
const router = express.Router();
const db = require('./db_postgres');
const { requireAuth, requireTenantScope, requireRole, validateBody, idempotencyGuard } = require('./mw');
const RS = require('./route_schemas');
const giBleed = require('./gi_bleed_risk_engine');
const ibd = require('./ibd_activity_engine');

// ============================================================
// POST /api/gi/bleed-risk (Glasgow-Blatchford Score)
// ============================================================
router.post('/bleed-risk',
    requireAuth,
    requireTenantScope,
    requireRole('doctor'),
    validateBody(RS.giBleedCreate),
    idempotencyGuard,
    async (req, res) => {
        try {
            const result = giBleed.giBleedRisk(req.validated);
            res.status(201).json(result);
        } catch (err) {
            if (err.message && err.message.includes('required')) {
                return res.status(400).json({ error: 'invalid_input', detail: err.message });
            }
            console.error('POST /api/gi/bleed-risk', err);
            res.status(500).json({ error: 'internal_error' });
        }
    }
);

// ============================================================
// POST /api/gi/ibd-activity
// ============================================================
router.post('/ibd-activity',
    requireAuth,
    requireTenantScope,
    requireRole('doctor'),
    validateBody(RS.giIbdCreate),
    idempotencyGuard,
    async (req, res) => {
        try {
            const result = ibd.crohnCDAI(req.validated);
            res.status(201).json(result);
        } catch (err) {
            if (err.message && err.message.includes('required')) {
                return res.status(400).json({ error: 'invalid_input', detail: err.message });
            }
            console.error('POST /api/gi/ibd-activity', err);
            res.status(500).json({ error: 'internal_error' });
        }
    }
);

module.exports = router;
