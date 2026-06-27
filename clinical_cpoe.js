/**
 * clinical_cpoe.js — E1 Doctor Station server module (additive).
 *
 * mountClinicalRoutes(app, {
 *     pool, requireAuth, requireTenantScope, getRequestTenantContext, logAudit,
 *     requireRole,            // optional: existing server.js role guard
 *     requirePermission,      // optional: rbac.js matrix guard (E-X2)
 *     cds                     // the ./cds engine (injected for testability)
 * })
 *
 * Exposes (all guarded by requireAuth + requireTenantScope, tenant-stamped, audited):
 *   PROBLEM LIST (e1_01 problems table)
 *     GET   /api/problems?patient_id=        — list tenant problems
 *     POST  /api/problems                    — add a coded problem
 *     PATCH /api/problems/:id                — update status/description (active<->resolved)
 *
 *   CLINICAL NOTES — SOAP (e1_02 clinical_notes table)
 *     POST  /api/clinical-notes              — create a SOAP note (draft)
 *     POST  /api/clinical-notes/:id/sign     — sign + lock (integrity hash; mirrors medical_records)
 *     GET   /api/clinical-notes?patient_id=  — list notes for a patient
 *
 *   CPOE — creates an order THROUGH the E-X unified `orders` table (ex_01_orders), NOT a new table.
 *     POST  /api/cpoe/order                  — CDS-gated order creation, single transaction.
 *
 * CDS GATE (clinical safety): POST /api/cpoe/order runs cds.evaluateOrder(...) BEFORE inserting.
 *   - A CRITICAL alert (interaction/allergy/overdose) HARD-STOPS with HTTP 422 and the alerts,
 *     UNLESS req.body.override_reason is a non-empty string — in which case the order proceeds
 *     and the override is AUDITED (CDS_OVERRIDE) with the reason + the critical alert messages.
 *   - WARNING alerts do not 422; if an override_reason is supplied it is audited.
 *   - FAIL-SAFE: cds.js surfaces warnings (not silent passes) when rule data is missing/uncertain.
 *
 * Tenant isolation: problems / clinical_notes / orders / order_items are all under FORCE RLS.
 *   The CPOE transaction uses a dedicated pool.connect() client and binds app.tenant_id itself
 *   (set_config) because the db_postgres pool.query auto-bind wrapper does NOT cover raw clients
 *   — exactly mirroring orders.js. tenant_id/facility_id are stamped from the trusted session.
 *
 * Mounted AFTER all existing routes and BEFORE the SPA catch-all (server.js wiring).
 */
'use strict';

const ORDER_TYPES = ['lab', 'rad', 'med', 'consult'];
const ORDER_STATUSES = ['pending', 'active', 'completed', 'cancelled'];
const PROBLEM_STATUSES = ['active', 'resolved'];

function mountClinicalRoutes(app, deps) {
    const {
        pool,
        requireAuth,
        requireTenantScope,
        getRequestTenantContext,
        logAudit,
        requireRole,
        requirePermission,
        cds,
    } = deps || {};

    if (!app || !pool || typeof requireAuth !== 'function' || typeof requireTenantScope !== 'function' ||
        typeof getRequestTenantContext !== 'function') {
        throw new Error('mountClinicalRoutes requires { app, pool, requireAuth, requireTenantScope, getRequestTenantContext }');
    }
    if (!cds || typeof cds.evaluateOrder !== 'function' || typeof cds.decide !== 'function') {
        throw new Error('mountClinicalRoutes requires the cds engine (evaluateOrder, decide)');
    }

    const audit = typeof logAudit === 'function' ? logAudit : () => {};

    // Build guard chains additively: auth -> tenant scope -> (optional) role -> (optional) permission.
    function chain(roleModule, permKey) {
        const g = [requireAuth, requireTenantScope];
        if (typeof requireRole === 'function' && roleModule) g.push(requireRole(roleModule));
        if (typeof requirePermission === 'function' && permKey) g.push(requirePermission(permKey));
        return g;
    }

    // ============================================================
    // PROBLEM LIST
    // ============================================================
    app.get('/api/problems', ...chain('doctor', 'problems:view'), async (req, res) => {
        try {
            const { tenantId } = getRequestTenantContext(req);
            // IMPORTANT-4: FAIL-CLOSED — never run an UNFILTERED clinical query. With no tenant context
            // there is no authoritative scope, so return zero rows rather than leaking every tenant's
            // problem list. The query below ALWAYS carries an explicit tenant_id predicate; RLS also enforces it.
            if (!tenantId) return res.json([]);
            const { patient_id } = req.query;
            const where = [];
            const params = [];
            params.push(tenantId); where.push(`tenant_id = $${params.length}`);
            if (patient_id) { params.push(patient_id); where.push(`patient_id = $${params.length}`); }
            const sql = `SELECT id, tenant_id, facility_id, patient_id, encounter_ref, icd10, snomed, description, status, onset_date, recorded_by, created_at
                         FROM problems WHERE ${where.join(' AND ')} ORDER BY id DESC`;
            const { rows } = await pool.query(sql, params);
            return res.json(rows);
        } catch (e) {
            console.error('GET /api/problems error:', e.message);
            return res.status(500).json({ error: 'Server error' });
        }
    });

    app.post('/api/problems', ...chain('doctor', 'problems:create'), async (req, res) => {
        try {
            const { patient_id, encounter_ref, icd10, snomed, description, status, onset_date } = req.body || {};
            if (!patient_id) return res.status(400).json({ error: 'patient_id is required' });
            if (!description || !String(description).trim()) return res.status(400).json({ error: 'description is required' });
            const st = (status === undefined || status === null || status === '') ? 'active' : status;
            if (!PROBLEM_STATUSES.includes(st)) return res.status(400).json({ error: 'Invalid status', allowed: PROBLEM_STATUSES });

            const { tenantId, facilityId } = getRequestTenantContext(req);
            const recordedBy = req.session?.user?.id || null;

            // Defense-in-depth: confirm patient belongs to this tenant (RLS also enforces it).
            if (tenantId && patient_id) {
                const pchk = (await pool.query('SELECT id FROM patients WHERE id=$1 AND tenant_id=$2', [patient_id, tenantId])).rows[0];
                if (!pchk) return res.status(404).json({ error: 'Patient not found' });
            }

            const r = await pool.query(
                `INSERT INTO problems (tenant_id, facility_id, patient_id, encounter_ref, icd10, snomed, description, status, onset_date, recorded_by)
                 VALUES ($1,$2,$3,$4,$5,$6,$7,$8,$9,$10) RETURNING *`,
                [tenantId || null, facilityId || null, patient_id, encounter_ref || null,
                 icd10 || null, snomed || null, String(description), st, onset_date || null, recordedBy]
            );
            audit(recordedBy, req.session?.user?.display_name, 'CREATE_PROBLEM', 'Doctor',
                `Added problem #${r.rows[0].id} for patient #${patient_id}: ${String(description).slice(0, 80)}`, req.ip);
            return res.json(r.rows[0]);
        } catch (e) {
            console.error('POST /api/problems error:', e.message);
            return res.status(500).json({ error: 'Server error' });
        }
    });

    app.patch('/api/problems/:id', ...chain('doctor', 'problems:update'), async (req, res) => {
        try {
            const id = parseInt(req.params.id, 10);
            const { status, description } = req.body || {};
            const { tenantId } = getRequestTenantContext(req);

            if (status !== undefined && !PROBLEM_STATUSES.includes(status)) {
                return res.status(400).json({ error: 'Invalid status', allowed: PROBLEM_STATUSES });
            }
            // Ownership check (RLS also enforces it).
            const chk = (await pool.query(
                tenantId ? 'SELECT id FROM problems WHERE id=$1 AND tenant_id=$2' : 'SELECT id FROM problems WHERE id=$1',
                tenantId ? [id, tenantId] : [id])).rows[0];
            if (!chk) return res.status(404).json({ error: 'Problem not found' });

            const sets = [];
            const params = [];
            if (status !== undefined) { params.push(status); sets.push(`status = $${params.length}`); }
            if (description !== undefined) { params.push(String(description)); sets.push(`description = $${params.length}`); }
            if (sets.length === 0) return res.status(400).json({ error: 'Nothing to update' });

            params.push(id);
            let sql = `UPDATE problems SET ${sets.join(', ')} WHERE id = $${params.length}`;
            if (tenantId) { params.push(tenantId); sql += ` AND tenant_id = $${params.length}`; }
            sql += ' RETURNING *';
            const r = await pool.query(sql, params);
            audit(req.session?.user?.id, req.session?.user?.display_name, 'UPDATE_PROBLEM', 'Doctor',
                `Updated problem #${id}` + (status ? ` -> ${status}` : ''), req.ip);
            return res.json(r.rows[0]);
        } catch (e) {
            console.error('PATCH /api/problems/:id error:', e.message);
            return res.status(500).json({ error: 'Server error' });
        }
    });

    // ============================================================
    // CLINICAL NOTES — SOAP
    // ============================================================
    app.get('/api/clinical-notes', ...chain('doctor', 'notes:view'), async (req, res) => {
        try {
            const { tenantId } = getRequestTenantContext(req);
            // IMPORTANT-4: FAIL-CLOSED — never run an UNFILTERED clinical query. With no tenant context,
            // return zero rows rather than leaking every tenant's notes. The query below ALWAYS carries
            // an explicit tenant_id predicate; RLS also enforces it.
            if (!tenantId) return res.json([]);
            const { patient_id } = req.query;
            const where = [];
            const params = [];
            params.push(tenantId); where.push(`tenant_id = $${params.length}`);
            if (patient_id) { params.push(patient_id); where.push(`patient_id = $${params.length}`); }
            const sql = `SELECT id, tenant_id, facility_id, patient_id, encounter_ref, type, subjective, objective, assessment, plan, author_id, emr_status, signed_by_user_id, signed_at, locked_at, created_at
                         FROM clinical_notes WHERE ${where.join(' AND ')} ORDER BY id DESC`;
            const { rows } = await pool.query(sql, params);
            return res.json(rows);
        } catch (e) {
            console.error('GET /api/clinical-notes error:', e.message);
            return res.status(500).json({ error: 'Server error' });
        }
    });

    app.post('/api/clinical-notes', ...chain('doctor', 'notes:create'), async (req, res) => {
        try {
            const { patient_id, encounter_ref, subjective, objective, assessment, plan } = req.body || {};
            if (!patient_id) return res.status(400).json({ error: 'patient_id is required' });
            const { tenantId, facilityId } = getRequestTenantContext(req);
            const authorId = req.session?.user?.id || null;

            if (tenantId && patient_id) {
                const pchk = (await pool.query('SELECT id FROM patients WHERE id=$1 AND tenant_id=$2', [patient_id, tenantId])).rows[0];
                if (!pchk) return res.status(404).json({ error: 'Patient not found' });
            }

            const r = await pool.query(
                `INSERT INTO clinical_notes (tenant_id, facility_id, patient_id, encounter_ref, type, subjective, objective, assessment, plan, author_id, emr_status)
                 VALUES ($1,$2,$3,$4,'SOAP',$5,$6,$7,$8,$9,'draft') RETURNING *`,
                [tenantId || null, facilityId || null, patient_id, encounter_ref || null,
                 subjective || null, objective || null, assessment || null, plan || null, authorId]
            );
            audit(authorId, req.session?.user?.display_name, 'CREATE_SOAP_NOTE', 'Doctor',
                `Created SOAP note #${r.rows[0].id} for patient #${patient_id}`, req.ip);
            return res.json(r.rows[0]);
        } catch (e) {
            console.error('POST /api/clinical-notes error:', e.message);
            return res.status(500).json({ error: 'Server error' });
        }
    });

    // Sign + lock a SOAP note (mirrors medical_records sign/lock at server.js:905).
    app.post('/api/clinical-notes/:id/sign', ...chain('doctor', 'notes:sign'), async (req, res) => {
        try {
            const crypto = require('crypto');
            const id = parseInt(req.params.id, 10);
            const { tenantId } = getRequestTenantContext(req);
            const actor = req.session?.user || {};
            const cur = (await pool.query(
                tenantId ? 'SELECT subjective, objective, assessment, plan, emr_status FROM clinical_notes WHERE id=$1 AND tenant_id=$2'
                         : 'SELECT subjective, objective, assessment, plan, emr_status FROM clinical_notes WHERE id=$1',
                tenantId ? [id, tenantId] : [id])).rows[0];
            if (!cur) return res.status(404).json({ error: 'Note not found' });
            if (cur.emr_status === 'locked') return res.status(409).json({ error: 'Note already locked' });
            const hash = crypto.createHash('sha256')
                .update(`${cur.subjective || ''}|${cur.objective || ''}|${cur.assessment || ''}|${cur.plan || ''}`)
                .digest('hex');
            const r = await pool.query(
                tenantId
                    ? "UPDATE clinical_notes SET emr_status='locked', signed_by_user_id=$1, signed_at=now(), locked_at=now(), integrity_hash=$2 WHERE id=$3 AND tenant_id=$4 AND emr_status<>'locked'"
                    : "UPDATE clinical_notes SET emr_status='locked', signed_by_user_id=$1, signed_at=now(), locked_at=now(), integrity_hash=$2 WHERE id=$3 AND emr_status<>'locked'",
                tenantId ? [actor.id, hash, id, tenantId] : [actor.id, hash, id]);
            if (r.rowCount === 0) return res.status(409).json({ error: 'Note already locked or not found' });
            audit(actor.id, actor.display_name, 'SIGN_LOCK_SOAP_NOTE', 'EMR', `Signed+locked clinical_note #${id}`, req.ip);
            return res.json({ success: true, id, emr_status: 'locked' });
        } catch (e) {
            console.error('POST /api/clinical-notes/:id/sign error:', e.message);
            return res.status(500).json({ error: 'Server error' });
        }
    });

    // ============================================================
    // CPOE — CDS-gated order creation through the E-X unified `orders` table
    // ============================================================
    app.post('/api/cpoe/order', ...chain('doctor', 'orders:create'), async (req, res) => {
        const { patient_id, type, encounter_ref, order_set_id, status, items, override_reason,
                dose } = req.body || {};
        // NOTE: req.body.active_meds is intentionally NOT read here — CRITICAL-2: the drug-drug
        // interaction list is derived SERVER-SIDE below; the client list is untrusted/ignored.

        // --- validation (mirrors orders.js CHECK constraints) ---
        if (!ORDER_TYPES.includes(type)) {
            return res.status(400).json({ error: 'Invalid order type', allowed: ORDER_TYPES });
        }
        if (!patient_id) return res.status(400).json({ error: 'patient_id is required' });
        const orderStatus = (status === undefined || status === null || status === '') ? 'pending' : status;
        if (!ORDER_STATUSES.includes(orderStatus)) {
            return res.status(400).json({ error: 'Invalid order status', allowed: ORDER_STATUSES });
        }

        const { tenantId, facilityId } = getRequestTenantContext(req);
        const orderedBy = req.session?.user?.id || null;
        const lineItems = Array.isArray(items) ? items : [];

        // --- CDS GATE (clinical safety) — runs BEFORE any DB write ---
        // Build the medication context for med orders: primary med = first line item's catalog_ref.
        let cdsResult = { alerts: [], hasCritical: false, blocked: false, requiresReason: false };
        let patientForCds = null;
        try {
            if (type === 'med') {
                // Pull the patient's recorded allergies (free text) and their active orders for duplicate check.
                if (tenantId && patient_id) {
                    patientForCds = (await pool.query('SELECT allergies FROM patients WHERE id=$1 AND tenant_id=$2', [patient_id, tenantId])).rows[0] || null;
                } else {
                    patientForCds = (await pool.query('SELECT allergies FROM patients WHERE id=$1', [patient_id])).rows[0] || null;
                }
            }
        } catch (e) {
            // FAIL-SAFE: if we cannot read the patient/allergies, do NOT silently pass — flag a warning.
            cdsResult.alerts.push({
                rule: 'allergy', severity: 'warning', message: 'Allergy data unavailable — verify manually',
                message_en: 'Allergy data unavailable — verify manually', message_ar: 'تعذّر جلب بيانات الحساسية — تأكد يدوياً',
                overridable: true, subjects: [], fail_safe: true,
            });
        }

        const primaryMed = lineItems[0] ? (lineItems[0].catalog_ref || lineItems[0].name) : (req.body.medication_name || null);

        // CRITICAL-2: do NOT trust client-supplied active_meds for the drug-drug interaction check —
        // it is spoofable (the client can omit a dangerous med to defeat the gate). Derive the
        // patient's CURRENT active medications SERVER-SIDE, scoped to this tenant: med-type orders
        // (orders.type='med' -> order_items.catalog_ref) that are pending/active, plus the pharmacy
        // prescriptions queue (not yet dispensed/cancelled). RLS also enforces isolation; the explicit
        // tenant_id predicate is defense-in-depth. FAIL-SAFE: a lookup failure surfaces a warning
        // (never a silent skip of the interaction check). The client `active_meds` is IGNORED.
        let serverActiveMeds = [];
        if (type === 'med') {
            try {
                const meds = [];
                const moSql = tenantId
                    ? "SELECT oi.catalog_ref FROM order_items oi JOIN orders o ON oi.order_id=o.id WHERE o.patient_id=$1 AND o.tenant_id=$2 AND o.type='med' AND o.status IN ('pending','active')"
                    : "SELECT oi.catalog_ref FROM order_items oi JOIN orders o ON oi.order_id=o.id WHERE o.patient_id=$1 AND o.type='med' AND o.status IN ('pending','active')";
                const moParams = tenantId ? [patient_id, tenantId] : [patient_id];
                for (const r of (await pool.query(moSql, moParams)).rows) {
                    if (r.catalog_ref) meds.push(String(r.catalog_ref));
                }
                const pqSql = tenantId
                    ? "SELECT medication_name FROM pharmacy_prescriptions_queue WHERE patient_id=$1 AND tenant_id=$2 AND COALESCE(status,'') NOT IN ('Dispensed','Cancelled','Rejected')"
                    : "SELECT medication_name FROM pharmacy_prescriptions_queue WHERE patient_id=$1 AND COALESCE(status,'') NOT IN ('Dispensed','Cancelled','Rejected')";
                const pqParams = tenantId ? [patient_id, tenantId] : [patient_id];
                try {
                    for (const r of (await pool.query(pqSql, pqParams)).rows) {
                        if (r.medication_name) meds.push(String(r.medication_name));
                    }
                } catch (e2) {
                    if (!/relation .* does not exist/i.test(e2.message || '')) throw e2;
                }
                const seen = new Set();
                serverActiveMeds = meds.filter(m => { const k = m.trim().toLowerCase(); if (!k || seen.has(k)) return false; seen.add(k); return true; });
            } catch (e) {
                // FAIL-SAFE: cannot enumerate current meds => interaction check inconclusive => warning.
                cdsResult.alerts.push({
                    rule: 'drug-drug', severity: 'warning', message: 'Active medications unavailable — interaction check inconclusive',
                    message_en: 'Active medications unavailable — interaction check inconclusive', message_ar: 'تعذّر جلب الأدوية الفعالة — فحص التداخل غير حاسم',
                    overridable: true, subjects: [], fail_safe: true,
                });
            }
        }

        let activeOrders = [];
        try {
            const aoSql = tenantId
                ? 'SELECT type, id FROM orders WHERE patient_id=$1 AND tenant_id=$2 AND status IN (\'pending\',\'active\')'
                : 'SELECT type, id FROM orders WHERE patient_id=$1 AND status IN (\'pending\',\'active\')';
            const aoParams = tenantId ? [patient_id, tenantId] : [patient_id];
            const aoRows = (await pool.query(aoSql, aoParams)).rows;
            // Attach catalog_ref of each existing order's first item for duplicate comparison.
            for (const o of aoRows) {
                const it = (await pool.query(
                    tenantId ? 'SELECT catalog_ref FROM order_items WHERE order_id=$1 AND tenant_id=$2 LIMIT 1' : 'SELECT catalog_ref FROM order_items WHERE order_id=$1 LIMIT 1',
                    tenantId ? [o.id, tenantId] : [o.id])).rows[0];
                activeOrders.push({ type: o.type, catalog_ref: it ? it.catalog_ref : null });
            }
        } catch (e) {
            // FAIL-SAFE: cannot enumerate active orders => duplicate check inconclusive => warning.
            cdsResult.alerts.push({
                rule: 'duplicate', severity: 'warning', message: 'Active orders unavailable — duplicate check inconclusive',
                message_en: 'Active orders unavailable — duplicate check inconclusive', message_ar: 'تعذّر جلب الأوامر الفعالة — فحص التكرار غير حاسم',
                overridable: true, subjects: [], fail_safe: true,
            });
        }

        const evald = cds.evaluateOrder({
            type,
            // allergy/dose/interaction only apply to medication orders; lab/rad/consult run duplicate only.
            med: (type === 'med') ? primaryMed : null,
            dose: (type === 'med') ? dose : undefined,
            patient: { allergies: patientForCds ? patientForCds.allergies : null },
            // CRITICAL-2: authoritative server-derived active meds (client `active_meds` is NOT trusted).
            activeMeds: serverActiveMeds,
            activeOrders,
            catalog_ref: primaryMed,
        });
        // merge engine alerts with any fail-safe alerts gathered above
        cdsResult.alerts = cdsResult.alerts.concat(evald.alerts);
        const decision = cds.decide(cdsResult.alerts, override_reason);

        if (!decision.allow) {
            // HARD-STOP: critical alert without override_reason. Audit the blocked attempt.
            audit(orderedBy, req.session?.user?.display_name, 'CDS_BLOCK', 'Doctor',
                `Blocked ${type} order for patient #${patient_id}: ${cdsResult.alerts.filter(a => a.severity === 'critical').map(a => a.message_en || a.message).join('; ').slice(0, 200)}`, req.ip);
            return res.status(422).json({
                error: 'CDS hard-stop',
                blocked: true,
                requires_override_reason: true,
                alerts: cdsResult.alerts,
            });
        }

        // --- DB write: create the order + items in ONE transaction (mirrors orders.js) ---
        const client = await pool.connect();
        try {
            // FORCE RLS: a raw client is NOT covered by the pool.query tenant wrapper — bind it ourselves.
            await client.query("SELECT set_config('app.tenant_id', $1, false)", [tenantId ? String(tenantId) : '']);
            await client.query('BEGIN');

            if (tenantId) {
                const pcheck = await client.query('SELECT id FROM patients WHERE id=$1 AND tenant_id=$2', [patient_id, tenantId]);
                if (!pcheck.rows[0]) {
                    await client.query('ROLLBACK');
                    return res.status(404).json({ error: 'Patient not found' });
                }
            }

            // RLS-bypass-via-FK defense: validate order_set ownership in-txn (mirrors orders.js C1).
            if (order_set_id && tenantId) {
                const setChk = await client.query('SELECT id FROM order_sets WHERE id=$1 AND tenant_id=$2', [order_set_id, tenantId]);
                if (setChk.rowCount === 0) {
                    await client.query('ROLLBACK');
                    return res.status(400).json({ error: 'Invalid order_set' });
                }
            }

            const orderRes = await client.query(
                `INSERT INTO orders (tenant_id, facility_id, encounter_id, patient_id, type, status, ordered_by, order_set_id)
                 VALUES ($1,$2,$3,$4,$5,$6,$7,$8) RETURNING id, type, status, patient_id, encounter_id`,
                [tenantId || null, facilityId || null, encounter_ref || null, patient_id, type,
                 orderStatus, orderedBy, order_set_id || null]
            );
            const order = orderRes.rows[0];

            for (const it of lineItems) {
                await client.query(
                    `INSERT INTO order_items (tenant_id, order_id, catalog_ref, qty, instructions)
                     VALUES ($1,$2,$3,$4,$5)`,
                    [tenantId || null, order.id, it.catalog_ref || it.name || null,
                     parseInt(it.qty, 10) > 0 ? parseInt(it.qty, 10) : 1, it.instructions || null]
                );
            }

            await client.query('COMMIT');

            audit(orderedBy, req.session?.user?.display_name, 'CREATE_ORDER', 'Doctor',
                `CPOE ${type} order #${order.id} for patient #${patient_id} (${lineItems.length} item(s))`, req.ip);

            // If a critical alert existed and an override_reason was supplied, AUDIT the override.
            const criticals = cdsResult.alerts.filter(a => a.severity === 'critical');
            if (criticals.length > 0 && decision.reason) {
                audit(orderedBy, req.session?.user?.display_name, 'CDS_OVERRIDE', 'Doctor',
                    `Override (CRITICAL) on ${type} order #${order.id} patient #${patient_id}. Reason: ${String(decision.reason).slice(0, 160)}. Alerts: ${criticals.map(a => a.message_en || a.message).join('; ').slice(0, 200)}`, req.ip);
            } else if (decision.reason && cdsResult.alerts.length > 0) {
                // override_reason supplied for warning-level alerts — audit it too.
                audit(orderedBy, req.session?.user?.display_name, 'CDS_OVERRIDE', 'Doctor',
                    `Override (WARNING) on ${type} order #${order.id} patient #${patient_id}. Reason: ${String(decision.reason).slice(0, 160)}`, req.ip);
            }

            return res.json({
                ...order,
                items: lineItems.length,
                dispatch: 'recorded',           // routing-by-type dispatch handled by existing dept handlers (stub, per E-X)
                cds_alerts: cdsResult.alerts,
                override_applied: !!(decision.reason && cdsResult.alerts.length > 0),
            });
        } catch (e) {
            try { await client.query('ROLLBACK'); } catch (_) { /* best effort */ }
            console.error('POST /api/cpoe/order error:', e.message);
            return res.status(500).json({ error: 'Server error' });
        } finally {
            try { await client.query("SELECT set_config('app.tenant_id', '', false)"); } catch (_) { /* reset best-effort */ }
            client.release();
        }
    });
}

module.exports = { mountClinicalRoutes, ORDER_TYPES, ORDER_STATUSES, PROBLEM_STATUSES };
