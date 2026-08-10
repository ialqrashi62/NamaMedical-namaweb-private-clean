// pediatrics_router.js
// Pediatrics HTTP routes — APGAR + vitals + fluid + croup + PEWS + immunization
'use strict';

const express = require('express');
const router = express.Router();
const db = require('./db_postgres');
const { requireAuth, requireTenantScope, requireRole, validateBody, idempotencyGuard } = require('./mw');
const RS = require('./route_schemas');
const engine = require('./pediatrics_engine');

// ============================================================
// POST /api/pediatrics/apgar
// ============================================================
router.post('/apgar',
    requireAuth,
    requireTenantScope,
    requireRole('doctor', 'nurse'),
    validateBody(RS.pediatricsApgarCreate),
    idempotencyGuard,
    async (req, res) => {
        try {
            const result = engine.apgarScore(req.validated);
            const q = `
                INSERT INTO pediatrics_apgar
                  (tenant_id, patient_id, encounter_id, assessed_by, time_minutes,
                   appearance, pulse, grimace, activity, respiration,
                   score, interpretation, action)
                VALUES ($1,$2,$3,$4,$5,$6,$7,$8,$9,$10,$11,$12,$13)
                RETURNING id`;
            const params = [
                req.tenantId, req.validated.patient_id,
                req.validated.encounter_id || null,
                req.userId,
                req.validated.time_minutes || 5,
                req.validated.appearance, req.validated.pulse,
                req.validated.grimace, req.validated.activity,
                req.validated.respiration,
                result.score, result.interpretation, result.action
            ];
            const { rows } = await db.query(q, params);
            res.status(201).json({ id: rows[0].id, ...result });
        } catch (err) {
            if (err.message && err.message.startsWith('apgarScore:')) {
                return res.status(400).json({ error: 'invalid_input', detail: err.message });
            }
            console.error('POST /api/pediatrics/apgar', err);
            res.status(500).json({ error: 'internal_error' });
        }
    }
);

// ============================================================
// POST /api/pediatrics/vitals
// ============================================================
router.post('/vitals',
    requireAuth,
    requireTenantScope,
    requireRole('doctor', 'nurse'),
    validateBody(RS.pediatricsVitalsCreate),
    async (req, res) => {
        try {
            const result = engine.assessPediatricVitals(req.validated);
            res.status(201).json(result);
        } catch (err) {
            if (err.message && err.message.startsWith('assessPediatricVitals:')) {
                return res.status(400).json({ error: 'invalid_input', detail: err.message });
            }
            console.error('POST /api/pediatrics/vitals', err);
            res.status(500).json({ error: 'internal_error' });
        }
    }
);

// ============================================================
// POST /api/pediatrics/fluid
// ============================================================
router.post('/fluid',
    requireAuth,
    requireTenantScope,
    requireRole('doctor'),
    validateBody(RS.pediatricsFluidCreate),
    idempotencyGuard,
    async (req, res) => {
        try {
            const result = engine.pediatricFluidResuscitation(req.validated);
            res.status(201).json(result);
        } catch (err) {
            if (err.message && err.message.startsWith('pediatricFluidResuscitation:')) {
                return res.status(400).json({ error: 'invalid_input', detail: err.message });
            }
            console.error('POST /api/pediatrics/fluid', err);
            res.status(500).json({ error: 'internal_error' });
        }
    }
);

// ============================================================
// POST /api/pediatrics/croup
// ============================================================
router.post('/croup',
    requireAuth,
    requireTenantScope,
    requireRole('doctor', 'nurse'),
    validateBody(RS.pediatricsCroupCreate),
    idempotencyGuard,
    async (req, res) => {
        try {
            const result = engine.croupScore(req.validated);
            res.status(201).json(result);
        } catch (err) {
            if (err.message && err.message.startsWith('croupScore:')) {
                return res.status(400).json({ error: 'invalid_input', detail: err.message });
            }
            console.error('POST /api/pediatrics/croup', err);
            res.status(500).json({ error: 'internal_error' });
        }
    }
);

// ============================================================
// POST /api/pediatrics/pews
// ============================================================
router.post('/pews',
    requireAuth,
    requireTenantScope,
    requireRole('doctor', 'nurse'),
    validateBody(RS.pediatricsPewsCreate),
    idempotencyGuard,
    async (req, res) => {
        try {
            const result = engine.pewsScore(req.validated);
            res.status(201).json(result);
        } catch (err) {
            if (err.message && err.message.startsWith('pewsScore:')) {
                return res.status(400).json({ error: 'invalid_input', detail: err.message });
            }
            console.error('POST /api/pediatrics/pews', err);
            res.status(500).json({ error: 'internal_error' });
        }
    }
);

// ============================================================
// GET /api/pediatrics/immunizations?age_months=
// ============================================================
router.get('/immunizations',
    requireAuth,
    requireTenantScope,
    requireRole('doctor', 'nurse'),
    async (req, res) => {
        try {
            const age_months = parseInt(req.query.age_months, 10);
            if (!Number.isInteger(age_months)) {
                return res.status(400).json({ error: 'age_months query param required (integer)' });
            }
            res.json(engine.immunizationSchedule(age_months));
        } catch (err) {
            if (err.message && err.message.startsWith('immunizationSchedule:')) {
                return res.status(400).json({ error: 'invalid_input', detail: err.message });
            }
            console.error('GET /api/pediatrics/immunizations', err);
            res.status(500).json({ error: 'internal_error' });
        }
    }
);

module.exports = router;
