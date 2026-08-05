/**
 * portal_api_test.js — Unit tests for the Patient Portal API router
 * ============================================================================
 * Run with:  node portal_api_test.js
 *
 * DB-free wherever possible. We test the pure helpers (validateProfileUpdate,
 * project), the route-level guards (auth, tenant, role), the happy paths
 * (with a tiny fake `pg` pool), and assert all 9 endpoints are registered.
 *
 * Mocks: a tiny fake `pg` pool is injected via the require cache so we
 * never touch the real DB. The cache is busted before each test that
 * builds an app so the freshly-installed fake pool is what the router
 * picks up.
 */
'use strict';

const test = require('node:test');
const assert = require('node:assert/strict');

// ----- Fake pg pool ----------------------------------------------------------
function makeFakePool(plan) {
    return {
        async query(sql, params) {
            const key = Object.keys(plan).find(k => sql.includes(k));
            if (!key) {
                throw new Error('fake-pool: no plan for SQL: ' + sql.slice(0, 80));
            }
            const r = plan[key](params || []);
            return { rows: r.rows || [], rowCount: (r.rows || []).length };
        }
    };
}

function installFakePool(plan) {
    const fake = makeFakePool(plan);
    const dbPath = require.resolve('./db_postgres');
    require.cache[dbPath] = {
        id: dbPath, filename: dbPath, loaded: true,
        exports: { pool: fake, query: fake.query.bind(fake), getPool: () => fake }
    };
    return fake;
}

// Drop cached module entries so the next require('./portal_api') re-evaluates
// `const { pool } = require('./db_postgres')` against the freshly injected
// fake pool. Without this, the router would keep its initial reference to
// the real pool from the first require (the test runner caches across tests).
function clearCaches() {
    delete require.cache[require.resolve('./portal_api')];
    delete require.cache[require.resolve('./db_postgres')];
    delete require.cache[require.resolve('./billing_integrity')];
    delete require.cache[require.resolve('./finance_engine')];
    delete require.cache[require.resolve('./idempotency')];
}

// ----- Fake session middleware ----------------------------------------------
function fakeSession(user) {
    return (req, _res, next) => {
        req.session = { user };
        next();
    };
}

// ----- Build a minimal Express app wrapping the router ----------------------
function buildApp({ user, poolPlan }) {
    clearCaches();
    installFakePool(poolPlan || {});
    const router = require('./portal_api');
    const express = require('express');
    const app = express();
    app.use(express.json());
    app.use(fakeSession(user));
    app.use('/api/portal', router);
    return app;
}

// ----- Tiny HTTP request helper (no supertest, no deps) --------------------
async function call(app, method, path, body) {
    return new Promise((resolve, reject) => {
        const http = require('http');
        const server = app.listen(0, () => {
            const { port } = server.address();
            const data = body ? JSON.stringify(body) : null;
            const req = http.request({
                method, host: '127.0.0.1', port, path,
                headers: {
                    'Content-Type': 'application/json',
                    'Content-Length': data ? Buffer.byteLength(data) : 0
                }
            }, (res) => {
                let buf = '';
                res.on('data', c => buf += c);
                res.on('end', () => {
                    server.close();
                    let json = null;
                    try { json = JSON.parse(buf); } catch { /* leave null */ }
                    resolve({ status: res.statusCode, body: json });
                });
            });
            req.on('error', reject);
            if (data) req.write(data);
            req.end();
        });
    });
}

// ============================================================================
// 1. Module exports the router
// ============================================================================
test('portal_api module exports an Express router with a function stack', () => {
    clearCaches();
    installFakePool({});
    const router = require('./portal_api');
    assert.equal(typeof router, 'function', 'router is a function (Express)');
    assert.ok(Array.isArray(router.stack), 'router has a stack of layers');
});

// ============================================================================
// 2. Unauthenticated requests are rejected (401)
// ============================================================================
test('unauthenticated GET /profile returns 401', async () => {
    const express = require('express');
    clearCaches();
    installFakePool({});
    const router = require('./portal_api');
    const app = express();
    app.use(express.json());
    app.use('/api/portal', router);
    const r = await call(app, 'GET', '/api/portal/profile');
    assert.equal(r.status, 401);
    assert.equal(r.body.error, 'Unauthorized');
});

// ============================================================================
// 3. Missing tenant context is fail-closed (403) — AGENTS.md rail 11
// ============================================================================
test('authenticated user with no tenantId is rejected with 403', async () => {
    const app = buildApp({ user: { id: 1, role: 'Patient' /* no tenantId */ } });
    const r = await call(app, 'GET', '/api/portal/profile');
    assert.equal(r.status, 403);
    assert.equal(r.body.error, 'Tenant scope required');
});

// ============================================================================
// 4. Non-Patient role is rejected (403)
// ============================================================================
test('non-Patient role (Doctor) is rejected with 403', async () => {
    const app = buildApp({ user: { id: 1, role: 'Doctor', tenantId: 1 } });
    const r = await call(app, 'GET', '/api/portal/profile');
    assert.equal(r.status, 403);
    assert.equal(r.body.error, 'Patient role required');
});

// ============================================================================
// 5. Portal profile not found when portal_users lookup misses
// ============================================================================
test('GET /profile returns 404 when no portal user is linked to session user', async () => {
    const app = buildApp({
        user: { id: 42, role: 'Patient', tenantId: 1 },
        poolPlan: {
            'FROM portal_users': () => ({ rows: [] })
        }
    });
    const r = await call(app, 'GET', '/api/portal/profile');
    assert.equal(r.status, 404);
    assert.equal(r.body.error, 'Portal profile not found');
});

// ============================================================================
// 6. GET /profile happy-path returns camelCase patient shape
// ============================================================================
test('GET /profile returns camelCase patient fields from a tenant-scoped SELECT', async () => {
    const app = buildApp({
        user: { id: 7, role: 'Patient', tenantId: 1 },
        poolPlan: {
            'FROM portal_users': () => ({ rows: [{ portal_user_id: 11, patient_id: 99, tenant_id: 1, is_active: 1 }] }),
            'FROM patients': () => ({ rows: [{
                id: 99, file_number: 1234, mrn: 'MRN-001234',
                name_ar: 'محمد', name_en: 'Mohammed', national_id: '1234567890',
                phone: '0500000000', email: 'm@example.com', dob: '1990-01-01',
                gender: 'M', blood_type: 'O+', allergies: 'none', chronic_diseases: '',
                insurance_company: '', insurance_policy_number: '', insurance_class: '',
                created_at: new Date().toISOString()
            }] })
        }
    });
    const r = await call(app, 'GET', '/api/portal/profile');
    assert.equal(r.status, 200);
    assert.equal(r.body.id, 99);
    assert.equal(r.body.fileNumber, 1234);
    assert.equal(r.body.name, 'Mohammed');
    assert.equal(r.body.nameAr, 'محمد');
    assert.equal(r.body.phone, '0500000000');
    assert.equal(r.body.email, 'm@example.com');
});

// ============================================================================
// 7. POST /profile rejects unknown fields (fail-closed input validation)
// ============================================================================
test('POST /profile rejects unknown fields with 400', async () => {
    const app = buildApp({ user: { id: 7, role: 'Patient', tenantId: 1 } });
    const r = await call(app, 'POST', '/api/portal/profile', { dob: '1990-01-01' });
    assert.equal(r.status, 400);
    assert.match(r.body.error, /not allowed/);
});

// ============================================================================
// 8. POST /profile rejects invalid email format
// ============================================================================
test('POST /profile rejects an invalid email format', async () => {
    const app = buildApp({ user: { id: 7, role: 'Patient', tenantId: 1 } });
    const r = await call(app, 'POST', '/api/portal/profile', { email: 'not-an-email' });
    assert.equal(r.status, 400);
    assert.match(r.body.error, /email/);
});

// ============================================================================
// 9. POST /profile accepts a valid {name, phone, email} and runs the UPDATE
// ============================================================================
test('POST /profile with valid fields returns 200 and runs the UPDATE', async () => {
    const calls = [];
    const app = buildApp({
        user: { id: 7, role: 'Patient', tenantId: 1 },
        poolPlan: {
            'FROM portal_users': () => ({ rows: [{ portal_user_id: 11, patient_id: 99, tenant_id: 1, is_active: 1 }] }),
            'UPDATE patients': (params) => { calls.push(['UPDATE patients', params]); return { rows: [] }; },
            'UPDATE portal_users': (params) => { calls.push(['UPDATE portal_users', params]); return { rows: [] }; }
        }
    });
    const r = await call(app, 'POST', '/api/portal/profile', {
        name: 'New Name', phone: '0501112222', email: 'new@example.com'
    });
    assert.equal(r.status, 200);
    assert.equal(r.body.success, true);
    const table = calls.map(c => c[0]);
    assert.ok(table.includes('UPDATE patients'), 'UPDATE patients ran');
    assert.ok(table.includes('UPDATE portal_users'), 'UPDATE portal_users ran');
});

// ============================================================================
// 10. POST /appointments requires date and time
// ============================================================================
test('POST /appointments with missing date returns 400', async () => {
    const app = buildApp({
        user: { id: 7, role: 'Patient', tenantId: 1 },
        poolPlan: {
            'FROM portal_users': () => ({ rows: [{ portal_user_id: 11, patient_id: 99, tenant_id: 1, is_active: 1 }] })
        }
    });
    const r = await call(app, 'POST', '/api/portal/appointments', { time: '10:00' });
    assert.equal(r.status, 400);
    assert.match(r.body.error, /date and time/);
});

// ============================================================================
// 11. POST /appointments rejects past dates
// ============================================================================
test('POST /appointments with a past date returns 400', async () => {
    const app = buildApp({
        user: { id: 7, role: 'Patient', tenantId: 1 },
        poolPlan: {
            'FROM portal_users': () => ({ rows: [{ portal_user_id: 11, patient_id: 99, tenant_id: 1, is_active: 1 }] })
        }
    });
    const r = await call(app, 'POST', '/api/portal/appointments', { date: '2000-01-01', time: '10:00' });
    assert.equal(r.status, 400);
    assert.match(r.body.error, /past/);
});

// ============================================================================
// 12. POST /invoices/:id/pay rejects invoice that does not belong to patient
// ============================================================================
test('POST /invoices/123/pay returns 403 when invoice belongs to a different patient', async () => {
    const app = buildApp({
        user: { id: 7, role: 'Patient', tenantId: 1 },
        poolPlan: {
            'FROM portal_users': () => ({ rows: [{ portal_user_id: 11, patient_id: 99, tenant_id: 1, is_active: 1 }] }),
            'FROM invoices': () => ({ rows: [{ id: 123, total: 100, paid: 0, patient_id: 555 }] })
        }
    });
    const r = await call(app, 'POST', '/api/portal/invoices/123/pay', { paymentMethod: 'Card' });
    assert.equal(r.status, 403);
    assert.match(r.body.error, /does not belong/);
});

// ============================================================================
// 13. POST /invoices/:id/pay with an already-paid invoice returns alreadyPaid
// ============================================================================
test('POST /invoices/123/pay on a paid invoice returns alreadyPaid=true without mutating', async () => {
    let mutated = false;
    const app = buildApp({
        user: { id: 7, role: 'Patient', tenantId: 1 },
        poolPlan: {
            'FROM portal_users': () => ({ rows: [{ portal_user_id: 11, patient_id: 99, tenant_id: 1, is_active: 1 }] }),
            'FROM invoices': () => ({ rows: [{ id: 123, total: 100, paid: 1, patient_id: 99 }] }),
            'UPDATE invoices': () => { mutated = true; return { rows: [] }; }
        }
    });
    const r = await call(app, 'POST', '/api/portal/invoices/123/pay', {});
    assert.equal(r.status, 200);
    assert.equal(r.body.alreadyPaid, true);
    assert.equal(mutated, false, 'no UPDATE on already-paid invoice');
});

// ============================================================================
// 14. POST /invoices/:id/pay with a mismatched amount is rejected
// ============================================================================
test('POST /invoices/123/pay with mismatched amount returns 400', async () => {
    const app = buildApp({
        user: { id: 7, role: 'Patient', tenantId: 1 },
        poolPlan: {
            'FROM portal_users': () => ({ rows: [{ portal_user_id: 11, patient_id: 99, tenant_id: 1, is_active: 1 }] }),
            'FROM invoices': () => ({ rows: [{ id: 123, total: 100, paid: 0, patient_id: 99 }] })
        }
    });
    const r = await call(app, 'POST', '/api/portal/invoices/123/pay', { amount: 50 });
    assert.equal(r.status, 400);
    assert.match(r.body.error, /does not match/);
});

// ============================================================================
// 15. All 9 expected endpoints are registered on the router
// ============================================================================
test('all 9 expected endpoint paths are registered on the router', () => {
    clearCaches();
    installFakePool({});
    const router = require('./portal_api');
    const paths = [];
    router.stack.forEach(layer => {
        if (layer.route) {
            const methods = Object.keys(layer.route.methods).join(',').toUpperCase();
            paths.push(`${methods} ${layer.route.path}`);
        }
    });
    const expected = [
        'GET /profile',
        'POST /profile',
        'GET /appointments',
        'POST /appointments',
        'GET /lab-results',
        'GET /prescriptions',
        'GET /invoices',
        'POST /invoices/:id/pay',
        'GET /notifications'
    ];
    for (const e of expected) {
        assert.ok(paths.includes(e), `expected path missing: ${e} (have: ${paths.join(', ')})`);
    }
});
