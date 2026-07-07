/**
 * orders.js — E-X1 unified orders thin server module (additive).
 *
 * mountOrderRoutes(app, { pool, requireAuth, requireTenantScope, getRequestTenantContext, logAudit, requirePermission })
 *
 * Exposes:
 *   POST /api/orders        — create one order header + its line items in ONE transaction, tenant-scoped, audited.
 *   GET  /api/orders        — list orders for the tenant; optional ?encounter_id= and ?patient_id= filters.
 *
 * Routing-by-type is intentionally a STUB: it records type ∈ {lab,rad,med,consult} on the order row and
 * leaves the per-department dispatch (lab_radiology_orders / prescriptions+pharmacy_prescriptions_queue)
 * to the existing handlers — this module does NOT implement lab/rad/pharmacy internals.
 *
 * Tenant isolation: orders/order_items/order_sets are under FORCE RLS. The transaction uses a dedicated
 * client from pool.connect(); the db_postgres pool.query wrapper that auto-binds app.tenant_id does NOT
 * apply to a raw client, so we set_config('app.tenant_id', ...) on the client ourselves (and reset it in
 * finally), exactly mirroring db_postgres.js. tenant_id/facility_id are stamped from the trusted session.
 *
 * Mounted AFTER all existing routes and BEFORE the SPA catch-all (server.js wiring).
 */
'use strict';

const VALID_TYPES = ['lab', 'rad', 'med', 'consult'];
const VALID_STATUSES = ['pending', 'active', 'completed', 'cancelled'];

function mountOrderRoutes(app, deps) {
    const {
        pool,
        requireAuth,
        requireTenantScope,
        getRequestTenantContext,
        logAudit,
        // optional: additive RBAC matrix guard; if absent, route relies on requireAuth + requireTenantScope.
        requirePermission,
    } = deps || {};

    if (!app || !pool || typeof requireAuth !== 'function' || typeof requireTenantScope !== 'function' ||
        typeof getRequestTenantContext !== 'function') {
        throw new Error('mountOrderRoutes requires { app, pool, requireAuth, requireTenantScope, getRequestTenantContext }');
    }

    const audit = typeof logAudit === 'function' ? logAudit : () => {};

    // Build the middleware chain additively: auth -> tenant scope -> (optional) permission guard.
    const createGuards = [requireAuth, requireTenantScope];
    const viewGuards = [requireAuth, requireTenantScope];
    if (typeof requirePermission === 'function') {
        createGuards.push(requirePermission('orders:create'));
        viewGuards.push(requirePermission('orders:view'));
    }

    function isMissingRelationError(e) {
        return e && (e.code === '42P01' || /relation .* does not exist/i.test(e.message || ''));
    }

    async function listLegacyOrders({ tenantId, patient_id }) {
        const rows = [];
        const params = [];
        const conds = [];
        if (tenantId) { params.push(tenantId); conds.push(`tenant_id = $${params.length}`); }
        if (patient_id) { params.push(patient_id); conds.push(`patient_id = $${params.length}`); }
        const where = conds.length ? ' WHERE ' + conds.join(' AND ') : '';

        const labRows = (await pool.query(
            `SELECT id, tenant_id, facility_id, patient_id,
                    CASE WHEN COALESCE(is_radiology,0)=1 THEN 'rad' ELSE 'lab' END AS type,
                    LOWER(COALESCE(NULLIF(status,''),'pending')) AS status,
                    created_at,
                    COALESCE(NULLIF(description,''), NULLIF(order_type,''), 'Legacy order') AS item_summary,
                    1::int AS item_count
             FROM lab_radiology_orders${where} ORDER BY id DESC`,
            params
        ).catch(e => {
            if (isMissingRelationError(e)) return { rows: [] };
            throw e;
        })).rows;
        rows.push(...labRows);

        const rxRows = (await pool.query(
            `SELECT id, tenant_id, facility_id, patient_id, 'med' AS type,
                    LOWER(COALESCE(NULLIF(status,''),'pending')) AS status,
                    created_at,
                    ('Medication #' || COALESCE(medication_id::text, id::text) || COALESCE(' - ' || NULLIF(dosage,''), '')) AS item_summary,
                    1::int AS item_count
             FROM prescriptions${where} ORDER BY id DESC`,
            params
        ).catch(e => {
            if (isMissingRelationError(e)) return { rows: [] };
            throw e;
        })).rows;
        rows.push(...rxRows);

        const mrRows = (await pool.query(
            `SELECT id, tenant_id, facility_id, patient_id,
                    CASE
                      WHEN diagnosis ILIKE '[CONSULT]%' THEN 'consult'
                      WHEN diagnosis ILIKE '[RAD]%' THEN 'rad'
                      WHEN diagnosis ILIKE '[MED]%' THEN 'med'
                      ELSE 'consult'
                    END AS type,
                    LOWER(COALESCE(NULLIF(emr_status,''),'pending')) AS status,
                    visit_date AS created_at,
                    COALESCE(NULLIF(diagnosis,''), NULLIF(notes,''), 'Clinical order') AS item_summary,
                    1::int AS item_count
             FROM medical_records${where ? where + ' AND' : ' WHERE'} (diagnosis LIKE '[%]%' OR notes LIKE '[%]%') ORDER BY id DESC`,
            params
        ).catch(e => {
            if (isMissingRelationError(e)) return { rows: [] };
            throw e;
        })).rows;
        rows.push(...mrRows);

        return rows.sort((a, b) => new Date(b.created_at || 0) - new Date(a.created_at || 0));
    }

    // ===== POST /api/orders — create order + items in ONE transaction =====
    app.post('/api/orders', ...createGuards, async (req, res) => {
        const { patient_id, type, encounter_id, order_set_id, status, items } = req.body || {};

        // Validate type against the same CHECK constraint the DB enforces.
        if (!VALID_TYPES.includes(type)) {
            return res.status(400).json({ error: 'Invalid order type', allowed: VALID_TYPES });
        }
        if (!patient_id) {
            return res.status(400).json({ error: 'patient_id is required' });
        }

        // Validate status against the same CHECK constraint the DB enforces; default to 'pending' if absent.
        const orderStatus = (status === undefined || status === null || status === '') ? 'pending' : status;
        if (!VALID_STATUSES.includes(orderStatus)) {
            return res.status(400).json({ error: 'Invalid order status', allowed: VALID_STATUSES });
        }

        const { tenantId, facilityId } = getRequestTenantContext(req);
        const orderedBy = req.session?.user?.id || null;
        const lineItems = Array.isArray(items) ? items : [];

        const client = await pool.connect();
        try {
            // FORCE RLS: a raw client is NOT covered by the pool.query tenant wrapper — bind it ourselves.
            await client.query("SELECT set_config('app.tenant_id', $1, false)", [tenantId ? String(tenantId) : '']);

            await client.query('BEGIN');

            // Defense-in-depth: confirm the patient belongs to this tenant before creating the order.
            if (tenantId) {
                const pcheck = await client.query('SELECT id FROM patients WHERE id=$1 AND tenant_id=$2', [patient_id, tenantId]);
                if (!pcheck.rows[0]) {
                    await client.query('ROLLBACK');
                    return res.status(404).json({ error: 'Patient not found' });
                }
            }

            // RLS-bypass defense (C1): the orders->order_sets FK is checked by PostgreSQL BYPASSING RLS,
            // so a caller could reference another tenant's order_set. Validate ownership in the SAME
            // transaction/client before the INSERT (mirrors the patient_id ownership check above).
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
                [tenantId || null, facilityId || null, encounter_id || null, patient_id, type,
                 orderStatus, orderedBy, order_set_id || null]
            );
            const order = orderRes.rows[0];

            for (const it of lineItems) {
                await client.query(
                    `INSERT INTO order_items (tenant_id, order_id, catalog_ref, qty, instructions)
                     VALUES ($1,$2,$3,$4,$5)`,
                    [tenantId || null, order.id, it.catalog_ref || null,
                     parseInt(it.qty, 10) > 0 ? parseInt(it.qty, 10) : 1, it.instructions || null]
                );
            }

            await client.query('COMMIT');

            // Routing-by-type STUB: the order is recorded; per-department dispatch is left to existing handlers.
            audit(orderedBy, req.session?.user?.display_name, 'CREATE_ORDER', 'Orders',
                `Created ${type} order #${order.id} for patient #${patient_id} (${lineItems.length} item(s))`, req.ip);

            return res.json({ ...order, items: lineItems.length, dispatch: 'recorded' });
        } catch (e) {
            try { await client.query('ROLLBACK'); } catch (_) { /* best effort */ }
            console.error('POST /api/orders error:', e.message);
            return res.status(500).json({ error: 'Server error' });
        } finally {
            try { await client.query("SELECT set_config('app.tenant_id', '', false)"); } catch (_) { /* reset best-effort */ }
            client.release();
        }
    });

    // ===== GET /api/orders — list tenant orders, optional ?encounter_id= / ?patient_id= =====
    app.get('/api/orders', ...viewGuards, async (req, res) => {
        try {
            const { tenantId } = getRequestTenantContext(req);
            const { encounter_id, patient_id } = req.query;

            const where = [];
            const params = [];
            if (tenantId) { params.push(tenantId); where.push(`tenant_id = $${params.length}`); }
            if (encounter_id) { params.push(encounter_id); where.push(`encounter_id = $${params.length}`); }
            if (patient_id) { params.push(patient_id); where.push(`patient_id = $${params.length}`); }

            const sql = `SELECT o.id, o.tenant_id, o.facility_id, o.encounter_id, o.patient_id, o.type, o.status,
                                o.ordered_by, o.order_set_id, o.created_at,
                                COALESCE(COUNT(oi.id), 0)::int AS item_count,
                                COALESCE(STRING_AGG(NULLIF(oi.catalog_ref, ''), ', ' ORDER BY oi.id), '') AS item_summary
                         FROM orders o
                         LEFT JOIN order_items oi ON oi.order_id = o.id AND (oi.tenant_id = o.tenant_id OR oi.tenant_id IS NULL)
                         ${where.length ? ' WHERE ' + where.map(w => 'o.' + w).join(' AND ') : ''}
                         GROUP BY o.id, o.tenant_id, o.facility_id, o.encounter_id, o.patient_id, o.type, o.status,
                                  o.ordered_by, o.order_set_id, o.created_at
                         ORDER BY o.id DESC`;
            const { rows } = await pool.query(sql, params);
            return res.json(rows);
        } catch (e) {
            if (isMissingRelationError(e)) {
                try {
                    const { tenantId } = getRequestTenantContext(req);
                    const rows = await listLegacyOrders({ tenantId, patient_id: req.query.patient_id });
                    return res.json(rows);
                } catch (fallbackErr) {
                    console.error('GET /api/orders legacy fallback error:', fallbackErr.message);
                }
            }
            console.error('GET /api/orders error:', e.message);
            return res.status(500).json({ error: 'Server error' });
        }
    });
}

module.exports = { mountOrderRoutes, VALID_TYPES, VALID_STATUSES };
