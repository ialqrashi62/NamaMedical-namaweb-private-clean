// cardiology_router.js
// Cardiology HTTP routes (mounted in server.js).
// All routes use: requireAuth, requireTenantScope, requireRole('cardiologist'|'doctor'|'nurse'|'admin'),
//                 validateBody(RS.<schema>), idempotencyGuard (for writes).

'use strict';

const express = require('express');
const router = express.Router();
const db = require('./db_postgres');
const { requireAuth, requireTenantScope, requireRole, validateBody, idempotencyGuard } = require('./mw');
const RS = require('./route_schemas');
const engine = require('./cardiology_engine');

// ============================================================
// POST /api/cardiology/assessments/grace
// Compute GRACE score + persist
// ============================================================
router.post('/assessments/grace',
    requireAuth,
    requireTenantScope,
    requireRole('doctor'),
    validateBody(RS.cardiologyGraceCreate),
    idempotencyGuard,
    async (req, res) => {
        try {
            const result = engine.graceScore(req.validated);
            const q = `
                INSERT INTO cardiology_assessments
                  (tenant_id, patient_id, encounter_id, assessed_by,
                   assessment_type, score, risk, payload, recommendations)
                VALUES ($1,$2,$3,$4,'grace',$5,$6,$7,$8)
                RETURNING id`;
            const params = [
                req.tenantId, req.validated.patient_id,
                req.validated.encounter_id || null,
                req.userId,
                result.score, result.risk,
                req.validated, JSON.stringify([{
                    action: result.recommendation,
                    urgency: result.risk === 'high' ? 'urgent' : 'routine',
                    cite: result.cite
                }])
            ];
            const { rows } = await db.query(q, params);
            res.status(201).json({ id: rows[0].id, ...result });
        } catch (err) {
            if (err.message && err.message.startsWith('graceScore:')) {
                return res.status(400).json({ error: 'invalid_input', detail: err.message });
            }
            console.error('POST /api/cardiology/assessments/grace', err);
            res.status(500).json({ error: 'internal_error' });
        }
    }
);

// ============================================================
// POST /api/cardiology/assessments/cha2ds2vasc
// Compute CHA2DS2-VASc + persist
// ============================================================
router.post('/assessments/cha2ds2vasc',
    requireAuth,
    requireTenantScope,
    requireRole('doctor'),
    validateBody(RS.cardiologyCha2ds2vascCreate),
    idempotencyGuard,
    async (req, res) => {
        try {
            const result = engine.cha2ds2vasc(req.validated);
            const q = `
                INSERT INTO cardiology_assessments
                  (tenant_id, patient_id, encounter_id, assessed_by,
                   assessment_type, score, risk, payload, recommendations)
                VALUES ($1,$2,$3,$4,'cha2ds2vasc',$5,$6,$7,$8)
                RETURNING id`;
            const params = [
                req.tenantId, req.validated.patient_id,
                req.validated.encounter_id || null,
                req.userId,
                result.score, result.annual_stroke_risk_pct + '% annual stroke',
                req.validated, JSON.stringify([{
                    action: `${result.anticoagulation_recommendation}. ${result.preferred_agent}`,
                    urgency: result.score >= 2 ? 'routine' : 'optional',
                    cite: result.cite
                }])
            ];
            const { rows } = await db.query(q, params);
            res.status(201).json({ id: rows[0].id, ...result });
        } catch (err) {
            if (err.message && err.message.startsWith('cha2ds2vasc:')) {
                return res.status(400).json({ error: 'invalid_input', detail: err.message });
            }
            console.error('POST /api/cardiology/assessments/cha2ds2vasc', err);
            res.status(500).json({ error: 'internal_error' });
        }
    }
);

// ============================================================
// POST /api/cardiology/assessments/hasbled
// ============================================================
router.post('/assessments/hasbled',
    requireAuth,
    requireTenantScope,
    requireRole('doctor'),
    validateBody(RS.cardiologyHasbledCreate),
    idempotencyGuard,
    async (req, res) => {
        try {
            const result = engine.hasBled(req.validated);
            const q = `
                INSERT INTO cardiology_assessments
                  (tenant_id, patient_id, encounter_id, assessed_by,
                   assessment_type, score, risk, payload, recommendations)
                VALUES ($1,$2,$3,$4,'hasbled',$5,$6,$7,$8)
                RETURNING id`;
            const params = [
                req.tenantId, req.validated.patient_id,
                req.validated.encounter_id || null,
                req.userId,
                result.score, result.risk,
                req.validated, JSON.stringify([{
                    action: result.recommendation,
                    urgency: result.risk === 'high' ? 'urgent' : 'routine',
                    cite: result.cite
                }])
            ];
            const { rows } = await db.query(q, params);
            res.status(201).json({ id: rows[0].id, ...result });
        } catch (err) {
            console.error('POST /api/cardiology/assessments/hasbled', err);
            res.status(500).json({ error: 'internal_error' });
        }
    }
);

// ============================================================
// POST /api/cardiology/assessments/hf-class
// ============================================================
router.post('/assessments/hf-class',
    requireAuth,
    requireTenantScope,
    requireRole('doctor'),
    validateBody(RS.cardiologyHfClassCreate),
    idempotencyGuard,
    async (req, res) => {
        try {
            const result = engine.classifyHeartFailure(req.validated);
            const q = `
                INSERT INTO cardiology_assessments
                  (tenant_id, patient_id, encounter_id, assessed_by,
                   assessment_type, score, risk, payload, recommendations)
                VALUES ($1,$2,$3,$4,'hf_class',$5,$6,$7,$8)
                RETURNING id`;
            const params = [
                req.tenantId, req.validated.patient_id,
                req.validated.encounter_id || null,
                req.userId,
                req.validated.nyha_class,
                result.accaha_stage || 'unknown',
                req.validated,
                JSON.stringify(result.recommended_therapy.map(t => ({
                    action: `${t.drug} (${t.evidence})`,
                    urgency: 'routine',
                    cite: 'ACC-AHA-HF-2022'
                })))
            ];
            const { rows } = await db.query(q, params);
            res.status(201).json({ id: rows[0].id, ...result });
        } catch (err) {
            if (err.message && err.message.includes('classifyHeartFailure')) {
                return res.status(400).json({ error: 'invalid_input', detail: err.message });
            }
            console.error('POST /api/cardiology/assessments/hf-class', err);
            res.status(500).json({ error: 'internal_error' });
        }
    }
);

// ============================================================
// POST /api/cardiology/troponin/interpret
// ============================================================
router.post('/troponin/interpret',
    requireAuth,
    requireTenantScope,
    requireRole('doctor'),
    validateBody(RS.cardiologyTroponinInterpretCreate),
    idempotencyGuard,
    async (req, res) => {
        try {
            const result = engine.interpretTroponin(req.validated);
            const q = `
                INSERT INTO cardiology_assessments
                  (tenant_id, patient_id, encounter_id, assessed_by,
                   assessment_type, score, risk, payload, recommendations)
                VALUES ($1,$2,$3,$4,'troponin',$5,$6,$7,$8)
                RETURNING id`;
            const params = [
                req.tenantId, req.validated.patient_id,
                req.validated.encounter_id || null,
                req.userId,
                Math.round(result.acs_probability * 100),
                result.interpretation,
                req.validated, JSON.stringify([{
                    action: result.recommendation,
                    urgency: result.interpretation === 'rule_in_acs' ? 'urgent' : 'routine',
                    cite: result.cite
                }])
            ];
            const { rows } = await db.query(q, params);
            res.status(201).json({ id: rows[0].id, ...result });
        } catch (err) {
            if (err.message && err.message.startsWith('interpretTroponin:')) {
                return res.status(400).json({ error: 'invalid_input', detail: err.message });
            }
            console.error('POST /api/cardiology/troponin/interpret', err);
            res.status(500).json({ error: 'internal_error' });
        }
    }
);

// ============================================================
// POST /api/cardiology/ecg
// Create ECG report + STEMI check
// ============================================================
router.post('/ecg',
    requireAuth,
    requireTenantScope,
    requireRole('doctor'),
    validateBody(RS.cardiologyEcgCreate),
    idempotencyGuard,
    async (req, res) => {
        try {
            const stemi = engine.detectStemi({
                st_elevation_mm: req.validified?.st_elevation_mm ?? req.validated.st_elevation_mm,
                leads: req.validated.leads
            });
            const q = `
                INSERT INTO cardiology_ecg_reports
                  (tenant_id, patient_id, encounter_id, recorded_at,
                   rhythm, rate_bpm, pr_interval_ms, qrs_duration_ms,
                   qt_interval_ms, qtc_ms, interpretation, st_changes,
                   is_stemi, stemi_territory, file_url, signed_by, signed_at)
                VALUES ($1,$2,$3,$4,$5,$6,$7,$8,$9,$10,$11,$12,$13,$14,$15,$16,$17)
                RETURNING id`;
            const params = [
                req.tenantId, req.validated.patient_id,
                req.validated.encounter_id || null,
                req.validated.recorded_at,
                req.validated.rhythm, req.validated.rate_bpm,
                req.validated.pr_interval_ms || null,
                req.validated.qrs_duration_ms || null,
                req.validated.qt_interval_ms || null,
                req.validated.qtc_ms || null,
                req.validated.interpretation || null,
                JSON.stringify(req.validated.st_changes || {}),
                stemi.is_stemi,
                stemi.territory || null,
                req.validated.file_url || null,
                req.validated.signed_by || null,
                req.validated.signed_at || null
            ];
            const { rows } = await db.query(q, params);
            res.status(201).json({
                id: rows[0].id,
                stemi_detection: stemi
            });
        } catch (err) {
            if (err.message && err.message.startsWith('detectStemi:')) {
                return res.status(400).json({ error: 'invalid_input', detail: err.message });
            }
            console.error('POST /api/cardiology/ecg', err);
            res.status(500).json({ error: 'internal_error' });
        }
    }
);

// ============================================================
// GET /api/cardiology/assessments?patient_id=&type=
// ============================================================
router.get('/assessments',
    requireAuth,
    requireTenantScope,
    requireRole('doctor'),
    async (req, res) => {
        try {
            const patientId = req.query.patient_id;
            const type = req.query.type;
            if (!patientId) return res.status(400).json({ error: 'patient_id required' });
            const params = [req.tenantId, patientId];
            let q = `SELECT id, assessment_type, score, risk, recommendations, created_at
                     FROM cardiology_assessments
                     WHERE tenant_id=$1 AND patient_id=$2`;
            if (type) {
                params.push(type);
                q += ` AND assessment_type=$${params.length}`;
            }
            q += ` ORDER BY created_at DESC LIMIT 200`;
            const { rows } = await db.query(q, params);
            res.json({ assessments: rows });
        } catch (err) {
            console.error('GET /api/cardiology/assessments', err);
            res.status(500).json({ error: 'internal_error' });
        }
    }
);

// ============================================================
// GET /api/cardiology/icd10 (static lookup for UI dropdowns)
// ============================================================
router.get('/icd10',
    requireAuth,
    requireTenantScope,
    async (req, res) => {
        res.json({ codes: engine.CARDIOLOGY_ICD10 });
    }
);

// ============================================================
// POST /api/cardiology/procedures
// ============================================================
router.post('/procedures',
    requireAuth,
    requireTenantScope,
    requireRole('doctor'),
    validateBody(RS.cardiologyProcedureCreate),
    idempotencyGuard,
    async (req, res) => {
        try {
            const q = `
                INSERT INTO cardiology_procedures
                  (tenant_id, patient_id, encounter_id, procedure_type, procedure_date,
                   operator, indication, findings, complications, cci_score,
                   contrast_used_ml, fluoroscopy_min, stent_count, stent_types,
                   successful, notes)
                VALUES ($1,$2,$3,$4,$5,$6,$7,$8,$9,$10,$11,$12,$13,$14,$15,$16)
                RETURNING id`;
            const params = [
                req.tenantId, req.validated.patient_id,
                req.validated.encounter_id || null,
                req.validated.procedure_type, req.validated.procedure_date,
                req.validated.operator || null,
                req.validated.indication || null,
                req.validated.findings || null,
                req.validated.complications || null,
                req.validated.cci_score || null,
                req.validated.contrast_used_ml || null,
                req.validated.fluoroscopy_min || null,
                req.validated.stent_count || null,
                req.validated.stent_types || null,
                req.validated.successful !== false,
                req.validated.notes || null
            ];
            const { rows } = await db.query(q, params);
            res.status(201).json({ id: rows[0].id });
        } catch (err) {
            console.error('POST /api/cardiology/procedures', err);
            res.status(500).json({ error: 'internal_error' });
        }
    }
);

module.exports = router;
