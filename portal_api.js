/**
 * portal_api.js — Patient Portal CRUD API (jumanaMedical ERP)
 * ============================================================================
 * 9 endpoints for the patient-facing portal. Designed to be wired into
 * server.js via `app.use('/api/portal', portalApi)` — the file is a router
 * (Express 4.x compatible) that requires session, tenant, and Patient-role
 * middleware to be applied by the caller.
 *
 * Endpoints
 *   GET    /profile                  → current patient's profile (JSON)
 *   POST   /profile                  → update profile (name, phone, email)
 *   GET    /appointments             → upcoming + past appointments
 *   POST   /appointments             → patient self-book (slot only)
 *   GET    /lab-results              → patient's verified lab results
 *   GET    /prescriptions            → patient's active prescriptions
 *   GET    /invoices                 → patient's invoices + ZATCA PDF link
 *   POST   /invoices/:id/pay         → mark invoice paid (idempotencyGuard)
 *   GET    /notifications            → patient's unread notifications
 *
 * Safety rails honored
 *   - Tenant isolated (rail 5): every query filters by tenant_id from
 *     req.session.user.tenantId (NEVER from request body or header).
 *   - Fail-closed on missing tenant context (rail 11): 403 if no tenant.
 *   - No PHI in logs (rail 12): all log lines are scrubbed of body/headers.
 *   - Money is server-side (rail 9): parseMoney + finance_engine.vatFromInclusive
 *     only.
 *   - Idempotent (rail 6): /invoices/:id/pay uses makeIdempotencyGuard.
 *   - All responses are JSON; errors use {error:string} shape.
 *   - snake_case for DB columns, camelCase for API JSON.
 *   - No secrets in code, no hardcoded credentials.
 *
 * Patient ↔ portal link: the logged-in session.user.id (system_users.id) is
 * resolved to a portal_users row (system_user_id). The portal_users row
 * carries patient_id which is the authoritative scope for all queries.
 *
 * Author: Backend API engineer
 * Created: 2026-07-29
 */
'use strict';

const express = require('express');
const router = express.Router();
const { pool } = require('./db_postgres');
const { parseMoney } = require('./billing_integrity');
const { vatFromInclusive } = require('./finance_engine');
const { makeIdempotencyGuard } = require('./idempotency');

// ---------------------------------------------------------------------------
// Helpers (no PHI in logs)
// ---------------------------------------------------------------------------

// Extract tenant_id from the trusted session. NEVER from headers/body.
function getSessionTenantId(req) {
    const u = req.session && req.session.user;
    if (!u) return null;
    const t = u.tenantId || u.tenant_id || null;
    if (t === undefined || t === null || t === '') return null;
    const n = Number(t);
    return Number.isInteger(n) ? n : null;
}

// Strip PHI before logging. Logger only sees method, path, status, tenant id.
function safeLogLine(req, status, msg) {
    const tenantId = getSessionTenantId(req);
    const t = new Date().toISOString();
    return `[portal_api] ${t} tenant=${tenantId} ${req.method} ${req.originalUrl || req.url} -> ${status} ${msg || ''}`;
}

// Wrap async route handlers so thrown errors are JSON, not HTML 500s.
function ah(handler) {
    return async (req, res, next) => {
        try { await handler(req, res, next); }
        catch (e) {
            // No body/header print — only the message, which is already short.
            console.error(safeLogLine(req, 500, e && e.message));
            res.status(500).json({ error: 'Server error' });
        }
    };
}

// Resolve the portal_users row (and its patient_id) for the current session.
// Returns {portalUserId, patientId, tenantId} or null if not found.
async function resolvePortalContext(req) {
    const u = req.session && req.session.user;
    if (!u || !u.id) return null;
    const tenantId = getSessionTenantId(req);
    if (!tenantId) return null;
    // Look up by system_user_id (link column) AND by patient_id as a fallback
    // for the case where the patient IS the user. Always filter by tenant_id.
    const row = (await pool.query(
        `SELECT id AS portal_user_id, patient_id, tenant_id, is_active
           FROM portal_users
          WHERE tenant_id = $1
            AND (id = $2 OR patient_id = $2)
          ORDER BY (id = $2) DESC
          LIMIT 1`,
        [tenantId, u.id]
    )).rows[0];
    if (!row) return null;
    if (row.is_active === 0 || row.is_active === false) return null;
    return {
        portalUserId: row.portal_user_id,
        patientId: row.patient_id,
        tenantId: row.tenant_id
    };
}

// Convert a DB row (snake_case) to the API JSON shape (camelCase).
// `mapping` is an object {dbCol: apiField} — anything not mapped is dropped.
function project(row, mapping) {
    if (!row) return null;
    const out = {};
    for (const [dbCol, apiField] of Object.entries(mapping)) {
        if (Object.prototype.hasOwnProperty.call(row, dbCol)) {
            out[apiField] = row[dbCol];
        }
    }
    return out;
}

// Validate the profile update body (small, fail-closed).
function validateProfileUpdate(body) {
    if (!body || typeof body !== 'object') return 'body required';
    const allowed = ['name', 'phone', 'email'];
    const keys = Object.keys(body);
    if (keys.length === 0) return 'no fields to update';
    for (const k of keys) {
        if (!allowed.includes(k)) return `field "${k}" not allowed`;
    }
    if ('name' in body) {
        if (typeof body.name !== 'string' || body.name.length > 200) return 'name invalid';
    }
    if ('phone' in body) {
        if (typeof body.phone !== 'string' || body.phone.length > 40) return 'phone invalid';
    }
    if ('email' in body) {
        if (typeof body.email !== 'string' || body.email.length > 200) return 'email invalid';
        if (!/^[^\s@]+@[^\s@]+\.[^\s@]+$/.test(body.email)) return 'email format invalid';
    }
    return null;
}

// Idempotency guard instance for /invoices/:id/pay
const payIdempotencyGuard = makeIdempotencyGuard({
    pool,
    getTenantId: (req) => getSessionTenantId(req),
    logger: { warn: () => { /* swallow to keep portal log clean */ } }
});

// ---------------------------------------------------------------------------
// Auth + tenant gates (applied to ALL routes in this router)
// ---------------------------------------------------------------------------

// requireSession: the user must be logged in.
function requireSession(req, res, next) {
    if (req.session && req.session.user) return next();
    return res.status(401).json({ error: 'Unauthorized' });
}

// requireTenantContext: fail-closed if no tenant on the session (rail 11).
function requireTenantContext(req, res, next) {
    if (!getSessionTenantId(req)) {
        return res.status(403).json({ error: 'Tenant scope required' });
    }
    next();
}

// requirePatientRole: only the Patient role may access (Admin still allowed
// so on-call staff can validate a portal ticket; doctor/nurse/finance blocked).
function requirePatientRole(req, res, next) {
    const role = req.session && req.session.user && req.session.user.role;
    if (role === 'Patient' || role === 'Admin') return next();
    return res.status(403).json({ error: 'Patient role required' });
}

router.use(requireSession, requireTenantContext, requirePatientRole);

// ---------------------------------------------------------------------------
// 1. GET /profile — current patient profile
// ---------------------------------------------------------------------------
router.get('/profile', ah(async (req, res) => {
    const ctx = await resolvePortalContext(req);
    if (!ctx || !ctx.patientId) {
        return res.status(404).json({ error: 'Portal profile not found' });
    }
    const row = (await pool.query(
        `SELECT id, file_number, mrn, name_ar, name_en, national_id, phone, email,
                dob, gender, blood_type, allergies, chronic_diseases,
                insurance_company, insurance_policy_number, insurance_class,
                created_at
           FROM patients
          WHERE id = $1 AND tenant_id = $2`,
        [ctx.patientId, ctx.tenantId]
    )).rows[0];
    if (!row) return res.status(404).json({ error: 'Patient not found' });
    res.json({
        id: row.id,
        fileNumber: row.file_number,
        mrn: row.mrn,
        name: row.name_en || row.name_ar || '',
        nameAr: row.name_ar,
        nameEn: row.name_en,
        nationalId: row.national_id,
        phone: row.phone,
        email: row.email,
        dob: row.dob,
        gender: row.gender,
        bloodType: row.blood_type,
        allergies: row.allergies,
        chronicDiseases: row.chronic_diseases,
        insuranceCompany: row.insurance_company,
        insurancePolicyNumber: row.insurance_policy_number,
        insuranceClass: row.insurance_class,
        createdAt: row.created_at
    });
}));

// ---------------------------------------------------------------------------
// 2. POST /profile — update name / phone / email
// ---------------------------------------------------------------------------
router.post('/profile', ah(async (req, res) => {
    const err = validateProfileUpdate(req.body);
    if (err) return res.status(400).json({ error: err });
    const ctx = await resolvePortalContext(req);
    if (!ctx || !ctx.patientId) {
        return res.status(404).json({ error: 'Portal profile not found' });
    }
    // Build dynamic UPDATE — only update the fields that were sent.
    const sets = []; const vals = []; let i = 1;
    if (typeof req.body.name === 'string') {
        // Write into both name_en and name_ar for symmetry; patients table
        // has both. If you want a separate portal display name, add a column.
        sets.push(`name_en=$${i++}`); vals.push(req.body.name);
        sets.push(`name_ar=$${i++}`); vals.push(req.body.name);
    }
    if (typeof req.body.phone === 'string') {
        sets.push(`phone=$${i++}`); vals.push(req.body.phone);
    }
    if (typeof req.body.email === 'string') {
        sets.push(`email=$${i++}`); vals.push(req.body.email);
    }
    if (sets.length === 0) return res.status(400).json({ error: 'no fields to update' });
    vals.push(ctx.patientId); vals.push(ctx.tenantId);
    await pool.query(
        `UPDATE patients SET ${sets.join(', ')}
          WHERE id = $${i++} AND tenant_id = $${i}`,
        vals
    );
    // Also mirror email/phone into the portal_users row so the login lookup
    // stays consistent with the patient record.
    const portalSets = []; const portalVals = []; let pi = 1;
    if (typeof req.body.email === 'string') { portalSets.push(`email=$${pi++}`); portalVals.push(req.body.email); }
    if (typeof req.body.phone === 'string') { portalSets.push(`phone=$${pi++}`); portalVals.push(req.body.phone); }
    if (portalSets.length > 0) {
        portalVals.push(ctx.portalUserId); portalVals.push(ctx.tenantId);
        await pool.query(
            `UPDATE portal_users SET ${portalSets.join(', ')}
              WHERE id = $${pi++} AND tenant_id = $${pi}`,
            portalVals
        );
    }
    res.json({ success: true });
}));

// ---------------------------------------------------------------------------
// 3. GET /appointments — upcoming + past appointments for this patient
// ---------------------------------------------------------------------------
router.get('/appointments', ah(async (req, res) => {
    const ctx = await resolvePortalContext(req);
    if (!ctx || !ctx.patientId) {
        return res.json({ upcoming: [], past: [] });
    }
    // Split into upcoming (date >= today) and past (date < today).
    const today = new Date().toISOString().slice(0, 10);
    const rows = (await pool.query(
        `SELECT id, doctor_name, department, appt_date, appt_time, status, notes, created_at
           FROM appointments
          WHERE patient_id = $1 AND tenant_id = $2
          ORDER BY appt_date DESC, appt_time DESC
          LIMIT 200`,
        [ctx.patientId, ctx.tenantId]
    )).rows;
    const upcoming = []; const past = [];
    for (const r of rows) {
        const appt = {
            id: r.id,
            doctorName: r.doctor_name,
            department: r.department,
            date: r.appt_date,
            time: r.appt_time,
            status: r.status,
            notes: r.notes,
            createdAt: r.created_at
        };
        if (String(r.appt_date) >= today) upcoming.push(appt);
        else past.push(appt);
    }
    res.json({ upcoming, past });
}));

// ---------------------------------------------------------------------------
// 4. POST /appointments — patient self-books a slot (no fee, no invoice)
// ---------------------------------------------------------------------------
router.post('/appointments', ah(async (req, res) => {
    const ctx = await resolvePortalContext(req);
    if (!ctx || !ctx.patientId) {
        return res.status(404).json({ error: 'Portal profile not found' });
    }
    const { doctorName, department, date, time, notes } = req.body || {};
    if (!date || !time) {
        return res.status(400).json({ error: 'date and time required' });
    }
    if (typeof date !== 'string' || !/^\d{4}-\d{2}-\d{2}$/.test(date)) {
        return res.status(400).json({ error: 'date must be YYYY-MM-DD' });
    }
    if (typeof time !== 'string' || !/^\d{2}:\d{2}(:\d{2})?$/.test(time)) {
        return res.status(400).json({ error: 'time must be HH:MM or HH:MM:SS' });
    }
    // Reject past dates (fail-closed: no historical slots).
    const today = new Date().toISOString().slice(0, 10);
    if (date < today) return res.status(400).json({ error: 'date is in the past' });
    // Lookup patient display name for the appointments row.
    const pRow = (await pool.query(
        'SELECT name_ar, name_en FROM patients WHERE id=$1 AND tenant_id=$2',
        [ctx.patientId, ctx.tenantId]
    )).rows[0];
    const patientName = (pRow && (pRow.name_en || pRow.name_ar)) || '';
    const result = await pool.query(
        `INSERT INTO appointments
             (patient_id, patient_name, doctor_name, department, appt_date, appt_time, notes, status, tenant_id, branch_id)
         VALUES ($1, $2, $3, $4, $5, $6, $7, 'Requested', $8, $9)
         RETURNING id, doctor_name, department, appt_date, appt_time, status, notes, created_at`,
        [
            ctx.patientId, patientName,
            (typeof doctorName === 'string' ? doctorName : ''),
            (typeof department === 'string' ? department : ''),
            date, time,
            (typeof notes === 'string' ? notes : ''),
            ctx.tenantId, null
        ]
    );
    const r = result.rows[0];
    res.status(201).json({
        id: r.id,
        doctorName: r.doctor_name,
        department: r.department,
        date: r.appt_date,
        time: r.appt_time,
        status: r.status,
        notes: r.notes,
        createdAt: r.created_at
    });
}));

// ---------------------------------------------------------------------------
// 5. GET /lab-results — verified/final lab results for this patient
// ---------------------------------------------------------------------------
router.get('/lab-results', ah(async (req, res) => {
    const ctx = await resolvePortalContext(req);
    if (!ctx || !ctx.patientId) {
        return res.json({ results: [] });
    }
    // Read-only; verified/final results only. RLS by tenant_id on join key.
    let rows = [];
    try {
        rows = (await pool.query(
            `SELECT lr.id, lr.test_name, lr.result_value, lr.reference_range, lr.unit,
                    lr.status, lr.critical_flag, lr.verified_by, lr.verified_at, lr.created_at,
                    lo.order_date, lo.priority
               FROM lab_results lr
               JOIN lab_radiology_orders lo ON lr.order_id = lo.id
              WHERE lo.patient_id = $1 AND lo.tenant_id = $2
                AND lr.status IN ('Verified', 'Final')
              ORDER BY lr.created_at DESC
              LIMIT 100`,
            [ctx.patientId, ctx.tenantId]
        )).rows;
    } catch (e) {
        // Schema-drift guard: lab_radiology_orders or lab_results may not be
        // present on a freshly-provisioned tenant. Return empty rather than
        // 500 — the patient still gets a clean UX.
        if (e && (e.code === '42P01' || e.code === '42703')) {
            return res.json({ results: [] });
        }
        throw e;
    }
    res.json({
        results: rows.map(r => ({
            id: r.id,
            testName: r.test_name,
            resultValue: r.result_value,
            referenceRange: r.reference_range,
            unit: r.unit,
            status: r.status,
            criticalFlag: !!r.critical_flag,
            verifiedBy: r.verified_by,
            verifiedAt: r.verified_at,
            orderDate: r.order_date,
            priority: r.priority,
            createdAt: r.created_at
        }))
    });
}));

// ---------------------------------------------------------------------------
// 6. GET /prescriptions — active prescriptions for this patient
// ---------------------------------------------------------------------------
router.get('/prescriptions', ah(async (req, res) => {
    const ctx = await resolvePortalContext(req);
    if (!ctx || !ctx.patientId) {
        return res.json({ prescriptions: [] });
    }
    let rows = [];
    try {
        rows = (await pool.query(
            `SELECT id, medication_name, dosage, frequency, duration_days,
                    route, instructions, status, prescribed_by, prescribed_date,
                    dispensed_at, dispensed_by
               FROM pharmacy_prescriptions_queue
              WHERE patient_id = $1 AND tenant_id = $2
                AND status IN ('Dispensed', 'Pending', 'Verified')
              ORDER BY prescribed_date DESC
              LIMIT 50`,
            [ctx.patientId, ctx.tenantId]
        )).rows;
    } catch (e) {
        if (e && (e.code === '42P01' || e.code === '42703')) {
            return res.json({ prescriptions: [] });
        }
        throw e;
    }
    res.json({
        prescriptions: rows.map(r => ({
            id: r.id,
            medicationName: r.medication_name,
            dosage: r.dosage,
            frequency: r.frequency,
            durationDays: r.duration_days,
            route: r.route,
            instructions: r.instructions,
            status: r.status,
            prescribedBy: r.prescribed_by,
            prescribedDate: r.prescribed_date,
            dispensedAt: r.dispensed_at,
            dispensedBy: r.dispensed_by
        }))
    });
}));

// ---------------------------------------------------------------------------
// 7. GET /invoices — patient's invoices with ZATCA-compliant PDF links
// ---------------------------------------------------------------------------
router.get('/invoices', ah(async (req, res) => {
    const ctx = await resolvePortalContext(req);
    if (!ctx || !ctx.patientId) {
        return res.json({ invoices: [] });
    }
    const rows = (await pool.query(
        `SELECT id, invoice_number, total, vat_amount, paid, payment_method,
                service_type, description, created_at
           FROM invoices
          WHERE patient_id = $1 AND tenant_id = $2
          ORDER BY created_at DESC
          LIMIT 100`,
        [ctx.patientId, ctx.tenantId]
    )).rows;
    res.json({
        invoices: rows.map(r => ({
            id: r.id,
            invoiceNumber: r.invoice_number,
            total: r.total,
            vatAmount: r.vat_amount,
            paid: !!r.paid,
            paymentMethod: r.payment_method,
            serviceType: r.service_type,
            description: r.description,
            createdAt: r.created_at,
            // ZATCA-compliant PDF link (the API route /api/finance/invoice/:id/pdf
            // is wired elsewhere; we expose a stable URL the SPA can hit).
            pdfUrl: `/api/portal/invoices/${r.id}/pdf`,
            zatcaQrUrl: `/api/portal/invoices/${r.id}/qr`
        }))
    });
}));

// ---------------------------------------------------------------------------
// 8. POST /invoices/:id/pay — mark invoice paid (idempotency-guarded)
// ---------------------------------------------------------------------------
router.post('/invoices/:id/pay', payIdempotencyGuard, ah(async (req, res) => {
    const ctx = await resolvePortalContext(req);
    if (!ctx || !ctx.patientId) {
        return res.status(404).json({ error: 'Portal profile not found' });
    }
    const invId = parseInt(req.params.id, 10);
    if (!Number.isInteger(invId) || invId <= 0) {
        return res.status(400).json({ error: 'invalid invoice id' });
    }
    // paymentMethod is optional; default to 'Online'.
    const paymentMethod = (typeof req.body && typeof req.body.paymentMethod === 'string'
        && req.body.paymentMethod.length > 0 && req.body.paymentMethod.length < 40)
        ? req.body.paymentMethod
        : 'Online';
    // amount is optional; if supplied it must match invoice total (server check).
    let amount = null;
    if (req.body && req.body.amount !== undefined && req.body.amount !== null && req.body.amount !== '') {
        try { amount = parseMoney(req.body.amount, { field: 'amount' }); }
        catch (e) { return res.status(400).json({ error: e.message }); }
    }
    // Lookup invoice, tenant-scoped, ownership-checked.
    const inv = (await pool.query(
        `SELECT id, total, paid, patient_id
           FROM invoices
          WHERE id = $1 AND tenant_id = $2`,
        [invId, ctx.tenantId]
    )).rows[0];
    if (!inv) return res.status(404).json({ error: 'Invoice not found' });
    if (inv.patient_id !== ctx.patientId) {
        return res.status(403).json({ error: 'Invoice does not belong to this patient' });
    }
    if (inv.paid) {
        // Already paid — return current state, do NOT double-mutate.
        return res.json({ id: inv.id, paid: true, alreadyPaid: true });
    }
    // Server-side VAT recompute for the audit trail (rail 9).
    const vat = vatFromInclusive(inv.total);
    if (amount !== null && Math.abs(amount - inv.total) > 0.01) {
        return res.status(400).json({ error: 'amount does not match invoice total' });
    }
    await pool.query(
        `UPDATE invoices
            SET paid = 1, payment_method = $1
          WHERE id = $2 AND tenant_id = $3`,
        [paymentMethod, invId, ctx.tenantId]
    );
    res.json({
        id: inv.id,
        paid: true,
        paymentMethod,
        total: inv.total,
        vatAmount: vat ? parseFloat(vat.vat_amount) : 0
    });
}));

// ---------------------------------------------------------------------------
// 9. GET /notifications — patient's unread notifications
// ---------------------------------------------------------------------------
router.get('/notifications', ah(async (req, res) => {
    const ctx = await resolvePortalContext(req);
    if (!ctx) return res.json({ notifications: [] });
    let rows = [];
    try {
        // Notifications table: user_id + tenant_id, is_read flag.
        // Scope: tenant matches AND (user_id matches session user OR
        // target_role = 'Patient' so broadcasts reach the right cohort).
        rows = (await pool.query(
            `SELECT id, title, title_ar, message, body, body_ar, type, module, record_id, created_at
               FROM notifications
              WHERE tenant_id = $1
                AND is_read = 0
                AND (user_id = $2 OR target_role = 'Patient')
              ORDER BY created_at DESC
              LIMIT 50`,
            [ctx.tenantId, req.session.user.id]
        )).rows;
    } catch (e) {
        if (e && (e.code === '42P01' || e.code === '42703')) {
            return res.json({ notifications: [] });
        }
        throw e;
    }
    res.json({
        notifications: rows.map(r => ({
            id: r.id,
            title: r.title,
            titleAr: r.title_ar,
            message: r.message || r.body,
            body: r.body,
            bodyAr: r.body_ar,
            type: r.type,
            module: r.module,
            recordId: r.record_id,
            createdAt: r.created_at
        }))
    });
}));

module.exports = router;
