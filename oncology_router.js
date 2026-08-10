// oncology_router.js
// Oncology HTTP routes — TNM staging + BSA + chemo dose
'use strict';

const express = require('express');
const router = express.Router();
const db = require('./db_postgres');
const { requireAuth, requireTenantScope, requireRole, validateBody, idempotencyGuard } = require('./mw');
const RS = require('./route_schemas');
const engine = require('./oncology_engine');

// ============================================================
// POST /api/oncology/tnm
// Input: { T: 0-4, N: 0-3, M: 0-1 } (AJCC 8th ed)
// ============================================================
router.post('/tnm',
    requireAuth,
    requireTenantScope,
    requireRole('doctor'),
    validateBody(RS.oncologyTnmCreate),
    idempotencyGuard,
    async (req, res) => {
        try {
            const result = engine.tnmStage(req.validated);
            try {
                const q = `INSERT INTO oncology_staging
                    (tenant_id, patient_id, encounter_id, assessed_by, T, N, M, stage, cancer_type, payload)
                    VALUES ($1,$2,$3,$4,$5,$6,$7,$8,$9,$10) RETURNING id`;
                await db.query(q, [
                    req.tenantId, req.validated.patient_id,
                    req.validated.encounter_id || null, req.userId,
                    req.validated.T, req.validated.N, req.validated.M,
                    result.stage, req.validated.cancer_type || null,
                    req.validated
                ]);
            } catch (_e) { /* log only; engine result still returned */ }
            res.status(201).json(result);
        } catch (err) {
            if (err.message && err.message.includes('required')) {
                return res.status(400).json({ error: 'invalid_input', detail: err.message });
            }
            console.error('POST /api/oncology/tnm', err);
            res.status(500).json({ error: 'internal_error' });
        }
    }
);

// ============================================================
// POST /api/oncology/bsa (Mosteller)
// ============================================================
router.post('/bsa',
    requireAuth,
    requireTenantScope,
    requireRole('doctor'),
    validateBody(RS.oncologyBsaCreate),
    async (req, res) => {
        try {
            const result = engine.bodySurfaceArea(req.validated);
            res.status(201).json(result);
        } catch (err) {
            if (err.message && err.message.includes('required')) {
                return res.status(400).json({ error: 'invalid_input', detail: err.message });
            }
            console.error('POST /api/oncology/bsa', err);
            res.status(500).json({ error: 'internal_error' });
        }
    }
);

// ============================================================
// POST /api/oncology/chemo-dose
// ============================================================
router.post('/chemo-dose',
    requireAuth,
    requireTenantScope,
    requireRole('doctor'),
    validateBody(RS.oncologyChemoDoseCreate),
    idempotencyGuard,
    async (req, res) => {
        try {
            const bsa = engine.bodySurfaceArea({ height_cm: req.validated.height_cm, weight_kg: req.validated.weight_kg });
            const result = engine.chemoDose({
                drug_name: req.validated.drug_name,
                dose_mg_per_m2: req.validated.dose_per_m2,
                height_cm: req.validated.height_cm,
                weight_kg: req.validated.weight_kg,
                renal_function_pct: 100,
                hepatic_function_pct: 100
            });
            try {
                await db.query(
                    `INSERT INTO oncology_chemo_doses
                     (tenant_id, patient_id, encounter_id, prescribed_by, drug_name, dose_mg_per_m2, bsa, calculated_dose_mg, adjusted_dose_mg, adjustments)
                     VALUES ($1,$2,$3,$4,$5,$6,$7,$8,$9,$10)`,
                    [req.tenantId, req.validated.patient_id, req.validated.encounter_id || null, req.userId,
                     req.validated.drug_name, req.validated.dose_per_m2, bsa.bsa,
                     result.calculatedDose, result.adjustedDose, JSON.stringify(result.adjustments || [])]
                );
            } catch (_e) {}
            res.status(201).json({ ...result, bsa: bsa.bsa });
        } catch (err) {
            if (err.message && err.message.includes('required')) {
                return res.status(400).json({ error: 'invalid_input', detail: err.message });
            }
            console.error('POST /api/oncology/chemo-dose', err);
            res.status(500).json({ error: 'internal_error' });
        }
    }
);

// ============================================================
// GET /api/oncology/tnm-stages (reference table)
// ============================================================
router.get('/tnm-stages',
    requireAuth,
    requireTenantScope,
    async (req, res) => {
        res.json({ tnm_groups: engine.TNM_STAGE_GROUPS, cite: 'AJCC-8th-edition' });
    }
);

module.exports = router;
