// neurology_router.js
// Neurology HTTP routes — NIHSS (stroke) + APACHE II (ICU)
// ============================================================
'use strict';

const express = require('express');
const router = express.Router();
const db = require('./db_postgres');
const { requireAuth, requireTenantScope, requireRole, validateBody, idempotencyGuard } = require('./mw');
const RS = require('./route_schemas');
const neuro = require('./nihss_apache_engine');

// ============================================================
// POST /api/neurology/nihss
// NIH Stroke Scale (0-42)
// ============================================================
router.post('/nihss',
    requireAuth,
    requireTenantScope,
    requireRole('doctor'),
    validateBody(RS.neurologyNihssCreate),
    idempotencyGuard,
    async (req, res) => {
        try {
            const result = neuro.nihssScore(req.validated);
            res.status(201).json(result);
        } catch (err) {
            if (err.message && err.message.includes('required')) {
                return res.status(400).json({ error: 'invalid_input', detail: err.message });
            }
            console.error('POST /api/neurology/nihss', err);
            res.status(500).json({ error: 'internal_error' });
        }
    }
);

module.exports = router;
