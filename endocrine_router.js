// endocrine_router.js
// Endocrinology HTTP routes — glycemic control + thyroid
'use strict';

const express = require('express');
const router = express.Router();
const db = require('./db_postgres');
const { requireAuth, requireTenantScope, requireRole, validateBody, idempotencyGuard } = require('./mw');
const RS = require('./route_schemas');
const glycemic = require('./glycemic_control_engine');
const thyroid = require('./thyroid_engine');

// ============================================================
// POST /api/endocrine/glycemic/assess
// TIR + GMI + HbA1c assessment
// ============================================================
router.post('/glycemic/assess',
    requireAuth,
    requireTenantScope,
    requireRole('doctor'),
    validateBody(RS.glycemicAssessCreate),
    idempotencyGuard,
    async (req, res) => {
        try {
            const result = glycemic.glycemicControl(req.validated);
            res.status(201).json(result);
        } catch (err) {
            if (err.message && (err.message.includes('glycemic') || err.message.includes('required'))) {
                return res.status(400).json({ error: 'invalid_input', detail: err.message });
            }
            console.error('POST /api/endocrine/glycemic/assess', err);
            res.status(500).json({ error: 'internal_error' });
        }
    }
);

// ============================================================
// POST /api/endocrine/insulin/dose
// Sliding-scale or basal-bolus insulin calculator
// ============================================================
router.post('/insulin/dose',
    requireAuth,
    requireTenantScope,
    requireRole('doctor'),
    validateBody(RS.insulinDoseCreate),
    idempotencyGuard,
    async (req, res) => {
        try {
            // Use existing glycemic_control if it has a dose function; fallback to simple calc
            const { current_glucose_mg_dl, target_glucose_mg_dl = 110,
                    total_daily_dose_units, sensitivity_factor } = req.validated;
            // 1500 rule (rapid-acting): sensitivity = 1500/TDD
            // (current - target) / sensitivity = correction dose
            let sf = sensitivity_factor;
            if (!sf && total_daily_dose_units) {
                sf = 1500 / total_daily_dose_units;
            }
            let correction = 0;
            if (sf > 0 && current_glucose_mg_dl > target_glucose_mg_dl) {
                correction = (current_glucose_mg_dl - target_glucose_mg_dl) / sf;
            }
            const recommended_units = Math.max(0, Math.round(correction));
            const q = `
                INSERT INTO insulin_doses
                  (tenant_id, patient_id, encounter_id, prescribed_by,
                   current_glucose_mg_dl, target_glucose_mg_dl,
                   total_daily_dose_units, sensitivity_factor, recommended_units, notes)
                VALUES ($1,$2,$3,$4,$5,$6,$7,$8,$9,$10)
                RETURNING id`;
            const params = [
                req.tenantId, req.validated.patient_id,
                req.validated.encounter_id || null,
                req.userId, current_glucose_mg_dl, target_glucose_mg_dl,
                total_daily_dose_units || null,
                sf, recommended_units,
                req.validated.notes || null
            ];
            const { rows } = await db.query(q, params);
            res.status(201).json({
                id: rows[0].id,
                recommended_units,
                sensitivity_factor: sf,
                rule: '1500',
                cite: 'ADA-Standards-2024'
            });
        } catch (err) {
            console.error('POST /api/endocrine/insulin/dose', err);
            res.status(500).json({ error: 'internal_error' });
        }
    }
);

// ============================================================
// POST /api/endocrine/thyroid/interpret
// TSH + FT4 + FT3 interpretation
// ============================================================
router.post('/thyroid/interpret',
    requireAuth,
    requireTenantScope,
    requireRole('doctor'),
    validateBody(RS.thyroidInterpretCreate),
    idempotencyGuard,
    async (req, res) => {
        try {
            const result = thyroid.interpretThyroid(req.validated);
            const q = `
                INSERT INTO thyroid_assessments
                  (tenant_id, patient_id, encounter_id, assessed_by,
                   tsh_uIuml, ft4_ngdl, ft3_pgml, interpretation, recommendations)
                VALUES ($1,$2,$3,$4,$5,$6,$7,$8,$9)
                RETURNING id`;
            const params = [
                req.tenantId, req.validated.patient_id,
                req.validated.encounter_id || null,
                req.userId,
                req.validated.tsh_uIuml,
                req.validated.ft4_ngdl || null,
                req.validated.ft3_pgml || null,
                result.interpretation,
                JSON.stringify(result.recommendations || [])
            ];
            const { rows } = await db.query(q, params);
            res.status(201).json({ id: rows[0].id, ...result });
        } catch (err) {
            if (err.message && err.message.includes('thyroid')) {
                return res.status(400).json({ error: 'invalid_input', detail: err.message });
            }
            console.error('POST /api/endocrine/thyroid/interpret', err);
            res.status(500).json({ error: 'internal_error' });
        }
    }
);

module.exports = router;
