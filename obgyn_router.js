// obgyn_router.js
// Obstetrics & Gynecology HTTP routes — Partograph + Bishop score
'use strict';

const express = require('express');
const router = express.Router();
const db = require('./db_postgres');
const { requireAuth, requireTenantScope, requireRole, validateBody, idempotencyGuard } = require('./mw');
const RS = require('./route_schemas');
const partograph = require('./partograph_extended_engine');
const ob = require('./ob_engine');

// ============================================================
// POST /api/obgyn/partograph
// Partograph assessment (WHO modified) + alert
// ============================================================
router.post('/partograph',
    requireAuth,
    requireTenantScope,
    requireRole('midwife', 'doctor', 'nurse'),
    validateBody(RS.obgynPartographCreate),
    idempotencyGuard,
    async (req, res) => {
        try {
            // Wrap into the partograph engine input format
            const result = partograph.assessPartograph(req.validated);
            res.status(201).json(result);
        } catch (err) {
            if (err.message && err.message.includes('required')) {
                return res.status(400).json({ error: 'invalid_input', detail: err.message });
            }
            console.error('POST /api/obgyn/partograph', err);
            res.status(500).json({ error: 'internal_error' });
        }
    }
);

// ============================================================
// POST /api/obgyn/bishop-score
// Bishop score for cervical readiness before induction
// ============================================================
router.post('/bishop-score',
    requireAuth,
    requireTenantScope,
    requireRole('doctor', 'midwife'),
    validateBody(RS.obgynBishopCreate),
    async (req, res) => {
        try {
            const result = partograph.bishopScore(req.validated);
            res.status(201).json(result);
        } catch (err) {
            if (err.message && err.message.includes('required')) {
                return res.status(400).json({ error: 'invalid_input', detail: err.message });
            }
            console.error('POST /api/obgyn/bishop-score', err);
            res.status(500).json({ error: 'internal_error' });
        }
    }
);

module.exports = router;
