// orthopedics_router.js
// Orthopedics HTTP routes — Bone density (DEXA T-score)
'use strict';

const express = require('express');
const router = express.Router();
const db = require('./db_postgres');
const { requireAuth, requireTenantScope, requireRole, validateBody, idempotencyGuard } = require('./mw');
const RS = require('./route_schemas');
const bone = require('./bone_density_engine');

// ============================================================
// POST /api/orthopedics/bone-density
// WHO/ISCD classification by DEXA T-score
// ============================================================
router.post('/bone-density',
    requireAuth,
    requireTenantScope,
    requireRole('doctor'),
    validateBody(RS.orthopedicsBoneDensityCreate),
    idempotencyGuard,
    async (req, res) => {
        try {
            const result = bone.fraxScore(req.validated);
            res.status(201).json(result);
        } catch (err) {
            if (err.message && err.message.includes('required')) {
                return res.status(400).json({ error: 'invalid_input', detail: err.message });
            }
            console.error('POST /api/orthopedics/bone-density', err);
            res.status(500).json({ error: 'internal_error' });
        }
    }
);

module.exports = router;
