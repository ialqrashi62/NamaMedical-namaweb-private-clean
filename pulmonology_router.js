// pulmonology_router.js
// Pulmonology HTTP routes — Asthma (GINA 2024) + COPD (GOLD 2024)
'use strict';

const express = require('express');
const router = express.Router();
const db = require('./db_postgres');
const { requireAuth, requireTenantScope, requireRole, validateBody, idempotencyGuard } = require('./mw');
const RS = require('./route_schemas');
const asthma = require('./asthma_control_engine');
const copd = require('./copd_severity_engine');

// ============================================================
// POST /api/pulmonology/asthma-control
// ============================================================
router.post('/asthma-control',
    requireAuth,
    requireTenantScope,
    requireRole('doctor'),
    validateBody(RS.pulmonologyAsthmaCreate),
    idempotencyGuard,
    async (req, res) => {
        try {
            const result = asthma.assessAsthmaControl(req.validated);
            res.status(201).json(result);
        } catch (err) {
            if (err.message && err.message.includes('assessAsthmaControl')) {
                return res.status(400).json({ error: 'invalid_input', detail: err.message });
            }
            console.error('POST /api/pulmonology/asthma-control', err);
            res.status(500).json({ error: 'internal_error' });
        }
    }
);

// ============================================================
// POST /api/pulmonology/copd-severity
// ============================================================
router.post('/copd-severity',
    requireAuth,
    requireTenantScope,
    requireRole('doctor'),
    validateBody(RS.pulmonologyCopdCreate),
    idempotencyGuard,
    async (req, res) => {
        try {
            const result = copd.copdSeverity(req.validated);
            res.status(201).json(result);
        } catch (err) {
            if (err.message && err.message.includes('classifyCopd')) {
                return res.status(400).json({ error: 'invalid_input', detail: err.message });
            }
            console.error('POST /api/pulmonology/copd-severity', err);
            res.status(500).json({ error: 'internal_error' });
        }
    }
);

module.exports = router;
