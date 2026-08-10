// emergency_router.js
// Emergency Department HTTP routes — ESI triage + visits + trauma
'use strict';

const express = require('express');
const router = express.Router();
const db = require('./db_postgres');
const { requireAuth, requireTenantScope, requireRole, validateBody, idempotencyGuard } = require('./mw');
const RS = require('./route_schemas');
const esi = require('./esi_engine');

// ============================================================
// POST /api/emergency/triage
// ESI triage assessment
// ============================================================
router.post('/triage',
    requireAuth,
    requireTenantScope,
    requireRole('nurse', 'doctor'),
    validateBody(RS.erTriageCreate),
    idempotencyGuard,
    async (req, res) => {
        try {
            const result = esi.computeESI(req.validated);
            const q = `
                INSERT INTO er_triage
                  (tenant_id, patient_id, triage_by, chief_complaint, age, sex,
                   heart_rate, systolic_bp, spo2_pct, rr_per_min, temp_c,
                   pain_score, gcs_total, esi_level, recommended_action, notes)
                VALUES ($1,$2,$3,$4,$5,$6,$7,$8,$9,$10,$11,$12,$13,$14,$15,$16)
                RETURNING id`;
            const params = [
                req.tenantId,
                req.validated.patient_id || null,
                req.userId,
                req.validated.chief_complaint,
                req.validated.age || null,
                req.validated.sex || null,
                req.validated.heart_rate || null,
                req.validated.systolic_bp || null,
                req.validated.spo2_pct || null,
                req.validated.rr_per_min || null,
                req.validated.temp_c || null,
                req.validated.pain_score || null,
                req.validated.gcs_total || null,
                result.esi_level,
                result.rationale ? result.rationale.join('; ') : null,
                req.validated.notes || null
            ];
            const { rows } = await db.query(q, params);
            res.status(201).json({ id: rows[0].id, ...result });
        } catch (err) {
            console.error('POST /api/emergency/triage', err);
            res.status(500).json({ error: 'internal_error' });
        }
    }
);

// ============================================================
// GET /api/emergency/queue
// Active queue sorted by ESI level
// ============================================================
router.get('/queue',
    requireAuth,
    requireTenantScope,
    requireRole('nurse', 'doctor'),
    async (req, res) => {
        try {
            const q = `
                SELECT id, patient_id, esi_level, chief_complaint,
                       triage_time, recommended_action, assigned_to
                FROM er_queue
                WHERE tenant_id = $1 AND status = 'waiting'
                ORDER BY esi_level ASC, triage_time ASC
                LIMIT 100`;
            const { rows } = await db.query(q, [req.tenantId]);
            res.json({ queue: rows });
        } catch (err) {
            console.error('GET /api/emergency/queue', err);
            res.status(500).json({ error: 'internal_error' });
        }
    }
);

// ============================================================
// POST /api/emergency/trauma-assessment
// ISS (Injury Severity Score) helper
// ============================================================
router.post('/trauma-assessment',
    requireAuth,
    requireTenantScope,
    requireRole('doctor'),
    validateBody(RS.emergencyTraumaAssessmentCreate),
    idempotencyGuard,
    async (req, res) => {
        try {
            // Simple ISS calculation: sum of squares of top 3 AIS regions
            const regions = [
                req.validated.ais_head, req.validated.ais_face,
                req.validated.ais_chest, req.validated.ais_abdomen,
                req.validated.ais_extremity, req.validated.ais_external
            ].filter(v => v !== undefined && v !== null);
            if (regions.length < 3) {
                return res.status(400).json({ error: 'invalid_input', detail: 'at least 3 AIS regions required' });
            }
            regions.sort((a, b) => b - a);
            const iss = regions.slice(0, 3).reduce((sum, x) => sum + x * x, 0);
            let severity;
            if (iss >= 25) severity = 'critical';
            else if (iss >= 16) severity = 'severe';
            else if (iss >= 9) severity = 'moderate';
            else severity = 'minor';

            const q = `
                INSERT INTO er_trauma_assessments
                  (tenant_id, patient_id, assessed_by, ais_head, ais_face,
                   ais_chest, ais_abdomen, ais_extremity, ais_external,
                   iss_score, severity, mechanism, notes)
                VALUES ($1,$2,$3,$4,$5,$6,$7,$8,$9,$10,$11,$12,$13)
                RETURNING id`;
            const params = [
                req.tenantId, req.validated.patient_id,
                req.userId,
                req.validated.ais_head || null,
                req.validated.ais_face || null,
                req.validated.ais_chest || null,
                req.validated.ais_abdomen || null,
                req.validated.ais_extremity || null,
                req.validated.ais_external || null,
                iss, severity,
                req.validated.mechanism || null,
                req.validated.notes || null
            ];
            const { rows } = await db.query(q, params);
            res.status(201).json({
                id: rows[0].id, iss, severity,
                recommendation: severity === 'critical'
                    ? 'Trauma team activation; massive transfusion protocol; OR'
                    : severity === 'severe'
                    ? 'Trauma team evaluation; admit for observation'
                    : 'Standard ED workup'
            });
        } catch (err) {
            console.error('POST /api/emergency/trauma-assessment', err);
            res.status(500).json({ error: 'internal_error' });
        }
    }
);

module.exports = router;
