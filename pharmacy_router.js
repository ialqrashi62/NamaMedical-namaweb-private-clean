// pharmacy_router.js
// Pharmacy HTTP routes — interactions + renal dose + pregnancy safety
'use strict';

const express = require('express');
const router = express.Router();
const db = require('./db_postgres');
const { requireAuth, requireTenantScope, requireRole, validateBody, idempotencyGuard } = require('./mw');
const RS = require('./route_schemas');
const engine = require('./pharmacy_engine');

// ============================================================
// POST /api/pharmacy/interactions
// ============================================================
router.post('/interactions',
    requireAuth,
    requireTenantScope,
    requireRole('doctor', 'pharmacist'),
    validateBody(RS.pharmacyInteractionsCreate),
    idempotencyGuard,
    async (req, res) => {
        try {
            const result = engine.checkDrugInteractions(req.validated);
            res.status(201).json(result);
        } catch (err) {
            if (err.message && err.message.startsWith('checkDrugInteractions:')) {
                return res.status(400).json({ error: 'invalid_input', detail: err.message });
            }
            console.error('POST /api/pharmacy/interactions', err);
            res.status(500).json({ error: 'internal_error' });
        }
    }
);

// ============================================================
// POST /api/pharmacy/renal-dose
// ============================================================
router.post('/renal-dose',
    requireAuth,
    requireTenantScope,
    requireRole('doctor', 'pharmacist'),
    validateBody(RS.pharmacyRenalDoseCreate),
    idempotencyGuard,
    async (req, res) => {
        try {
            const result = engine.renalAdjustedDose(req.validated);
            res.status(201).json(result);
        } catch (err) {
            if (err.message && (err.message.startsWith('renalAdjustedDose:') || err.message.startsWith('cockcroftGault:'))) {
                return res.status(400).json({ error: 'invalid_input', detail: err.message });
            }
            console.error('POST /api/pharmacy/renal-dose', err);
            res.status(500).json({ error: 'internal_error' });
        }
    }
);

// ============================================================
// POST /api/pharmacy/pregnancy-check
// ============================================================
router.post('/pregnancy-check',
    requireAuth,
    requireTenantScope,
    requireRole('doctor', 'pharmacist'),
    validateBody(RS.pharmacyPregnancyCreate),
    idempotencyGuard,
    async (req, res) => {
        try {
            const result = engine.pregnancyDrugCheck(req.validated);
            res.status(201).json(result);
        } catch (err) {
            if (err.message && err.message.startsWith('pregnancyDrugCheck:')) {
                return res.status(400).json({ error: 'invalid_input', detail: err.message });
            }
            console.error('POST /api/pharmacy/pregnancy-check', err);
            res.status(500).json({ error: 'internal_error' });
        }
    }
);

module.exports = router;
