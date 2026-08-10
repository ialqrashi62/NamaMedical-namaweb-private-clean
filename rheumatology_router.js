// rheumatology_router.js
// Rheumatology HTTP routes — DAS28 (RA) + SLEDAI (SLE)
'use strict';

const express = require('express');
const router = express.Router();
const db = require('./db_postgres');
const { requireAuth, requireTenantScope, requireRole, validateBody, idempotencyGuard } = require('./mw');
const RS = require('./route_schemas');
const rheum = require('./rheum_activity_engine');

// ============================================================
// POST /api/rheumatology/das28
// Disease Activity Score for RA
// ============================================================
router.post('/das28',
    requireAuth,
    requireTenantScope,
    requireRole('doctor'),
    validateBody(RS.rheumatologyDas28Create),
    idempotencyGuard,
    async (req, res) => {
        try {
            const result = rheum.das28crp(req.validated);
            res.status(201).json(result);
        } catch (err) {
            if (err.message && err.message.includes('required')) {
                return res.status(400).json({ error: 'invalid_input', detail: err.message });
            }
            console.error('POST /api/rheumatology/das28', err);
            res.status(500).json({ error: 'internal_error' });
        }
    }
);

module.exports = router;
