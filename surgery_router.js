// surgery_router.js
// Surgery / Perioperative HTTP routes — ASA + risk + timeout + VTE
'use strict';

const express = require('express');
const router = express.Router();
const db = require('./db_postgres');
const { requireAuth, requireTenantScope, requireRole, validateBody, idempotencyGuard } = require('./mw');
const RS = require('./route_schemas');
const engine = require('./surgery_engine');

// ============================================================
// POST /api/surgery/asa
// ============================================================
router.post('/asa',
    requireAuth,
    requireTenantScope,
    requireRole('doctor'),
    validateBody(RS.surgeryRiskCreate),
    idempotencyGuard,
    async (req, res) => {
        try {
            // ASA classification uses same risk schema (subset)
            const { age, asa_class, procedure_risk, emergency } = req.validated;
            const result = engine.asaClassify({ asa_class, emergency });
            res.status(201).json(result);
        } catch (err) {
            if (err.message && err.message.startsWith('asaClassify:')) {
                return res.status(400).json({ error: 'invalid_input', detail: err.message });
            }
            console.error('POST /api/surgery/asa', err);
            res.status(500).json({ error: 'internal_error' });
        }
    }
);

// ============================================================
// POST /api/surgery/risk
// NSQIP-simplified surgical risk
// ============================================================
router.post('/risk',
    requireAuth,
    requireTenantScope,
    requireRole('doctor'),
    validateBody(RS.surgeryRiskCreate),
    idempotencyGuard,
    async (req, res) => {
        try {
            const result = engine.surgicalRisk(req.validated);
            res.status(201).json(result);
        } catch (err) {
            if (err.message && err.message.startsWith('surgicalRisk:')) {
                return res.status(400).json({ error: 'invalid_input', detail: err.message });
            }
            console.error('POST /api/surgery/risk', err);
            res.status(500).json({ error: 'internal_error' });
        }
    }
);

// ============================================================
// POST /api/surgery/timeout
// WHO Surgical Safety Checklist
// ============================================================
router.post('/timeout',
    requireAuth,
    requireTenantScope,
    requireRole('doctor', 'nurse'),
    validateBody(RS.surgeryTimeoutCreate),
    idempotencyGuard,
    async (req, res) => {
        try {
            const result = engine.surgicalTimeout(req.validated);
            if (!result.can_proceed) {
                return res.status(409).json({
                    error: 'critical_block',
                    detail: 'Missing critical timeout items — surgery cannot proceed',
                    result
                });
            }
            res.status(201).json(result);
        } catch (err) {
            if (err.message && err.message.startsWith('surgicalTimeout:')) {
                return res.status(400).json({ error: 'invalid_input', detail: err.message });
            }
            console.error('POST /api/surgery/timeout', err);
            res.status(500).json({ error: 'internal_error' });
        }
    }
);

// ============================================================
// POST /api/surgery/caprini
// VTE risk
// ============================================================
router.post('/caprini',
    requireAuth,
    requireTenantScope,
    requireRole('doctor'),
    validateBody(RS.surgeryCapriniCreate),
    idempotencyGuard,
    async (req, res) => {
        try {
            const result = engine.capriniScore(req.validated);
            res.status(201).json(result);
        } catch (err) {
            console.error('POST /api/surgery/caprini', err);
            res.status(500).json({ error: 'internal_error' });
        }
    }
);

module.exports = router;
