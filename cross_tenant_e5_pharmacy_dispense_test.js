/**
 * cross_tenant_e5_pharmacy_dispense_test.js
 * ============================================================================
 * اختبار عزل المستأجرين لمسارات E5 (الدفعات + التحقق + الصرف FEFO + الأدوية المراقبة)
 * Cross-Tenant isolation test for E5 pharmacy (batches + verify + FEFO dispense + controlled).
 *
 * DB-free / HTTP-free / no PHI. Run: node cross_tenant_e5_pharmacy_dispense_test.js
 *
 * Three layers (matching the house style):
 *   [1] Static code audit  — every E5 query carries an explicit tenant_id predicate; routes are
 *       role-gated + tenant-scoped; audits present; no unsafe string interpolation.
 *   [2] Migration audit     — each new table is tenant_id NOT NULL + FK tenants + ENABLE+FORCE RLS
 *       + canonical isolation policy; up/validate/down are idempotent; down drops its own indexes.
 *   [3] Simulation          — tenant 1 cannot read/verify/dispense/receive against tenant 2 rows
 *       (404), FEFO never crosses tenants, null-tenant is fail-closed (no rows), controlled
 *       dispense across tenants is blocked.
 */
const fs = require('fs');
const path = require('path');

const RED = '\x1b[31m', GREEN = '\x1b[32m', BLUE = '\x1b[34m', RESET = '\x1b[0m', BOLD = '\x1b[1m';
let passed = 0, failed = 0;
const failureLog = [];
function assert(cond, name, details = '') {
    if (cond) { console.log(`  ${GREEN}✅ PASS${RESET} — ${name}`); passed++; }
    else { console.log(`  ${RED}❌ FAIL${RESET} — ${name}${details ? ' | ' + details : ''}`); failed++; failureLog.push({ name, details }); }
}

console.log(`\n${BOLD}${BLUE}============================================================${RESET}`);
console.log(`${BOLD}${BLUE}  E5 Pharmacy — Cross-Tenant Isolation (batches/verify/FEFO/controlled)${RESET}`);
console.log(`${BOLD}${BLUE}============================================================${RESET}\n`);

const server = fs.readFileSync(path.join(__dirname, 'server.js'), 'utf8');
const sNoWs = server.replace(/\s+/g, '');

// ============================================================================
// [1] STATIC CODE AUDIT
// ============================================================================
console.log(`${BOLD}[ 1 ] فحص بنية استعلامات E5 (Static Code Audit)${RESET}`);
const staticChecks = [
    { pattern: 'FROM drug_batches', label: 'drug_batches استعلام موجود' },
    { pattern: 'WHERE b.tenant_id=$1', label: 'GET /api/pharmacy/batches: تصفية حسب tenant_id' },
    { pattern: 'INSERT INTO drug_batches (tenant_id, branch_id', label: 'POST batches: ختم tenant_id/branch_id عند الاستلام' },
    { pattern: 'WHERE id=$1 AND tenant_id=$2', label: 'VERIFY: التحقق من ملكية عنصر الطابور (IDOR)' },
    { pattern: 'WHERE tenant_id=$1 AND drug_id=$2 AND qty_on_hand > 0 AND expiry_date >= CURRENT_DATE', label: 'FEFO: استعلام الدفعات بمسند tenant_id صريح + استبعاد المنتهية' },
    { pattern: "FROM pharmacy_drug_catalog WHERE barcode=$1 AND tenant_id=$2", label: 'DISPENSE: حل الباركود مقيّد بالمستأجر (IDOR)' },
    { pattern: "FROM pharmacy_drug_catalog WHERE id=$1 AND tenant_id=$2", label: 'DISPENSE: حل drug_id مقيّد بالمستأجر (IDOR)' },
    { pattern: 'INSERT INTO pharmacy_dispense (tenant_id, branch_id', label: 'سجل الصرف يختم tenant_id/branch_id' },
    { pattern: 'INSERT INTO controlled_drug_log (tenant_id, branch_id', label: 'سجل المراقبة يختم tenant_id/branch_id' },
    { pattern: 'FROM patients WHERE id=$1 AND tenant_id=$2', label: 'قراءة حساسية المريض مقيّدة بالمستأجر' },
    { pattern: "set_config('app.tenant_id'", label: 'معاملة الصرف تربط app.tenant_id على عميل واحد (RLS داخل المعاملة)' },
];
for (const { pattern, label } of staticChecks) {
    const found = server.includes(pattern) || sNoWs.includes(pattern.replace(/\s+/g, ''));
    assert(found, label, `البحث عن: "${pattern}"`);
}

// role-gating + tenant-scoping on E5 write routes
assert(/app\.put\('\/api\/pharmacy\/queue\/:id\/verify',\s*requireAuth,\s*requireRole\('pharmacy'\),\s*requireTenantScope/.test(server),
    'VERIFY route: requireAuth + requireRole(pharmacy) + requireTenantScope');
assert(/app\.post\('\/api\/pharmacy\/dispense',\s*requireAuth,\s*requireRole\('pharmacy'\),\s*requireTenantScope/.test(server),
    'DISPENSE route: requireAuth + requireRole(pharmacy) + requireTenantScope');
assert(/app\.(get|post)\('\/api\/pharmacy\/batches',\s*requireAuth,\s*requireRole\('pharmacy'\),\s*requireTenantScope/.test(server),
    'BATCHES routes: requireAuth + requireRole(pharmacy) + requireTenantScope');

// audits present
console.log(`\n${BOLD}[ 1b ] فحص وجود logAudit للعمليات الحساسة${RESET}`);
for (const action of ['DISPENSE_FEFO', 'CONTROLLED_DISPENSE', 'CONTROLLED_WITNESS', 'CDS_BLOCK', 'CDS_OVERRIDE', 'RECEIVE_BATCH', 'PHARMACY_VERIFY']) {
    assert(server.includes(`'${action}'`) || server.includes(`"${action}"`), `logAudit: ${action}`);
}

// no unsafe interpolation in E5 queries
console.log(`\n${BOLD}[ 1c ] منع حقن SQL (parameterized only)${RESET}`);
{
    const unsafe = /FROM\s+drug_batches\s+WHERE[^$]*\$\{/.test(server) ||
        /FROM\s+pharmacy_dispense\s+WHERE[^$]*\$\{/.test(server) ||
        /FROM\s+controlled_drug_log\s+WHERE[^$]*\$\{/.test(server);
    assert(!unsafe, 'استعلامات E5 تستخدم بارامترات $N (لا توجد قوالب نصية خطيرة)');
}

// Wasfaty stub must be gated and must NOT make an external call
console.log(`\n${BOLD}[ 1d ] Wasfaty/NPHIES: stub مُسيّج بلا اتصال خارجي${RESET}`);
assert(server.includes("process.env.WASFATY_ENABLED") && server.includes('enabled: false'),
    'Wasfaty خلف WASFATY_ENABLED (معطّل افتراضياً => 503)');
assert(server.includes('external_call: false'), 'Wasfaty stub لا يجري أي اتصال خارجي (intent فقط)');

// ============================================================================
// [2] MIGRATION AUDIT — FORCE RLS canonical, tenant_id NOT NULL + FK, idempotent up/down.
// ============================================================================
console.log(`\n${BOLD}[ 2 ] فحص الترحيلات (FORCE RLS canonical + idempotent)${RESET}`);
const migDir = path.join(__dirname, 'migrations');
const tables = [
    { up: 'e5_01_drug_batches_up.sql', down: 'e5_01_drug_batches_down.sql', validate: 'e5_01_drug_batches_validate.sql', table: 'drug_batches', policy: 'rls_drug_batches_tenant_isolation', indexes: ['idx_drug_batches_tenant_id', 'idx_drug_batches_fefo'] },
    { up: 'e5_02_pharmacy_dispense_up.sql', down: 'e5_02_pharmacy_dispense_down.sql', validate: 'e5_02_pharmacy_dispense_validate.sql', table: 'pharmacy_dispense', policy: 'rls_pharmacy_dispense_tenant_isolation', indexes: ['idx_pharmacy_dispense_tenant_id'] },
    { up: 'e5_03_controlled_log_up.sql', down: 'e5_03_controlled_log_down.sql', validate: 'e5_03_controlled_log_validate.sql', table: 'controlled_drug_log', policy: 'rls_controlled_drug_log_tenant_isolation', indexes: ['idx_controlled_log_tenant_id'] },
];
for (const m of tables) {
    const up = fs.readFileSync(path.join(migDir, m.up), 'utf8');
    const down = fs.readFileSync(path.join(migDir, m.down), 'utf8');
    fs.readFileSync(path.join(migDir, m.validate), 'utf8'); // existence
    const upNoWs = up.replace(/\s+/g, ' ');
    assert(up.includes(`CREATE TABLE IF NOT EXISTS ${m.table}`), `${m.table}: CREATE TABLE IF NOT EXISTS (idempotent)`);
    assert(/tenant_id INTEGER NOT NULL REFERENCES tenants\(id\)/.test(up), `${m.table}: tenant_id INTEGER NOT NULL REFERENCES tenants(id)`);
    assert(up.includes(`ALTER TABLE ${m.table} ENABLE ROW LEVEL SECURITY`), `${m.table}: ENABLE ROW LEVEL SECURITY`);
    assert(up.includes(`ALTER TABLE ${m.table} FORCE ROW LEVEL SECURITY`), `${m.table}: FORCE ROW LEVEL SECURITY`);
    assert(up.includes(`DROP POLICY IF EXISTS ${m.policy}`), `${m.table}: DROP POLICY IF EXISTS (idempotent policy)`);
    assert(upNoWs.includes(`CREATE POLICY ${m.policy} ON ${m.table} FOR ALL USING (tenant_id = NULLIF(current_setting('app.tenant_id', true), '')::integer)`.replace(/\s+/g, ' ')),
        `${m.table}: canonical isolation policy (USING tenant_id = current_setting)`);
    assert(upNoWs.includes(`WITH CHECK (tenant_id = NULLIF(current_setting('app.tenant_id', true), '')::integer)`.replace(/\s+/g, ' ')),
        `${m.table}: policy WITH CHECK (write isolation)`);
    for (const idx of m.indexes) {
        assert(up.includes(`CREATE INDEX IF NOT EXISTS ${idx}`), `${m.table}: index ${idx} (idempotent)`);
        assert(down.includes(`DROP INDEX IF EXISTS ${idx}`), `${m.table}: down drops its own index ${idx}`);
    }
    assert(down.includes(`DROP POLICY IF EXISTS ${m.policy}`) && down.includes(`DROP TABLE IF EXISTS ${m.table}`),
        `${m.table}: down rolls back policy + table (idempotent IF EXISTS)`);
}
// FEFO selection index present (drug, expiry)
{
    const up01 = fs.readFileSync(path.join(migDir, 'e5_01_drug_batches_up.sql'), 'utf8');
    assert(up01.includes('idx_drug_batches_fefo ON drug_batches (tenant_id, drug_id, expiry_date)'),
        'drug_batches: FEFO index on (tenant_id, drug_id, expiry_date)');
}

// ============================================================================
// [3] SIMULATION — tenant isolation across the E5 handlers.
// ============================================================================
console.log(`\n${BOLD}[ 3 ] محاكاة عزل مسارات E5 (Simulation)${RESET}`);

const mockDb = {
    patients: [{ id: 101, tenant_id: 1, allergies: '' }, { id: 102, tenant_id: 2, allergies: 'Penicillin' }],
    queue: [
        { id: 50, patient_id: 101, medication_name: 'Paracetamol', status: 'Verified', tenant_id: 1 },
        { id: 60, patient_id: 102, medication_name: 'Amoxicillin', status: 'Verified', tenant_id: 2 },
    ],
    drugs: [
        { id: 10, drug_name: 'Paracetamol', barcode: 'BC-T1', tenant_id: 1, is_controlled: 0, stock_qty: 30 },
        { id: 20, drug_name: 'Amoxicillin', barcode: 'BC-T2', tenant_id: 2, is_controlled: 0, stock_qty: 30 },
        { id: 99, drug_name: 'Morphine', barcode: 'BC-T1-CTRL', tenant_id: 1, is_controlled: 1, schedule_class: 'CDII', stock_qty: 10 },
    ],
    batches: [
        { id: 1, drug_id: 10, tenant_id: 1, lot: 'A', expiry_date: '2026-09-01', qty_on_hand: 5 },
        { id: 2, drug_id: 10, tenant_id: 1, lot: 'B', expiry_date: '2026-12-01', qty_on_hand: 5 },
        { id: 3, drug_id: 20, tenant_id: 2, lot: 'X', expiry_date: '2026-09-01', qty_on_hand: 100 },
        { id: 9, drug_id: 99, tenant_id: 1, lot: 'M', expiry_date: '2027-01-01', qty_on_hand: 10 },
    ],
    dispense: [],
    controlled: [],
};
const TODAY = new Date('2026-06-26T00:00:00Z');
const expired = (d) => new Date(d + 'T00:00:00Z') < TODAY;

// fail-closed: null tenant => RLS yields nothing (simulate by returning empty set / 404)
function getBatches(tenantId, drugId) {
    if (!tenantId) return [];
    return mockDb.batches.filter(b => b.tenant_id === tenantId && (drugId == null || b.drug_id === drugId));
}
function verifyQueue(tenantId, queueId) {
    if (!tenantId) return { status: 403, error: 'tenant required' };
    const rx = mockDb.queue.find(q => q.id === queueId && q.tenant_id === tenantId);
    if (!rx) return { status: 404, error: 'Queue item not found' };
    return { status: 200, rx };
}
function resolveDrug(tenantId, { barcode, drug_id }) {
    if (!tenantId) return null;
    if (barcode) return mockDb.drugs.find(d => d.barcode === barcode && d.tenant_id === tenantId) || null;
    if (drug_id) return mockDb.drugs.find(d => d.id === drug_id && d.tenant_id === tenantId) || null;
    return null;
}
function dispense(tenantId, dispenserId, { prescription_id, barcode, drug_id, quantity, witness_user_id }) {
    if (!tenantId) return { status: 403 };
    const rx = mockDb.queue.find(q => q.id === prescription_id && q.tenant_id === tenantId);
    if (!rx) return { status: 404, error: 'Queue item not found' };
    if (rx.status !== 'Verified') return { status: 409, error: 'must be Verified' };
    const drug = resolveDrug(tenantId, { barcode, drug_id });
    if (!drug) return { status: 404, error: 'Drug not found' };
    const isControlled = !!(drug.is_controlled && Number(drug.is_controlled) > 0);
    if (isControlled && !witness_user_id) return { status: 422, requires_witness: true };
    if (isControlled && String(witness_user_id) === String(dispenserId)) return { status: 422, requires_witness: true };
    // FEFO within tenant only
    const valid = getBatches(tenantId, drug.id).filter(b => b.qty_on_hand > 0 && !expired(b.expiry_date))
        .sort((a, b) => (a.expiry_date < b.expiry_date ? -1 : a.expiry_date > b.expiry_date ? 1 : a.id - b.id));
    const avail = valid.reduce((s, b) => s + b.qty_on_hand, 0);
    if (avail < quantity) return { status: 409, error: 'Insufficient stock', available: avail };
    let remaining = quantity; const consumed = [];
    const before = drug.stock_qty;
    for (const b of valid) { if (remaining <= 0) break; const t = Math.min(remaining, b.qty_on_hand); b.qty_on_hand -= t; consumed.push({ batch_id: b.id, qty: t }); remaining -= t; }
    drug.stock_qty = Math.max(0, before - quantity);
    consumed.forEach(c => mockDb.dispense.push({ tenant_id: tenantId, prescription_id, drug_id: drug.id, drug_batch_id: c.batch_id, qty: c.qty }));
    if (isControlled) mockDb.controlled.push({ tenant_id: tenantId, drug_id: drug.id, qty: quantity, balance_before: before, balance_after: drug.stock_qty, dispensed_by: dispenserId, witnessed_by: witness_user_id });
    return { status: 200, consumed, isControlled };
}

// 3.1 batches: tenant 1 sees only its own batches
const t1Batches = getBatches(1, null);
assert(t1Batches.length === 3 && t1Batches.every(b => b.tenant_id === 1), 'GET batches (t1): يرى دفعات مستأجر 1 فقط');
assert(!t1Batches.some(b => b.tenant_id === 2), 'GET batches (t1): لا تتسرب دفعات مستأجر 2');

// 3.2 null tenant => fail-closed (no rows)
assert(getBatches(null, null).length === 0, 'GET batches (null tenant): fail-closed => صفر صفوف');

// 3.3 verify cross-tenant => 404
assert(verifyQueue(1, 60).status === 404, 'VERIFY: مستأجر 1 لا يستطيع التحقق من وصفة مستأجر 2 (404)');
assert(verifyQueue(1, 50).status === 200, 'VERIFY: مستأجر 1 يتحقق من وصفته (200)');
assert(verifyQueue(null, 50).status === 403, 'VERIFY (null tenant): fail-closed (403)');

// 3.4 dispense cross-tenant queue => 404
assert(dispense(1, 7, { prescription_id: 60, barcode: 'BC-T2', quantity: 1 }).status === 404,
    'DISPENSE: مستأجر 1 لا يصرف لوصفة مستأجر 2 (404)');

// 3.5 dispense cross-tenant DRUG (barcode belongs to t2) => Drug not found
assert(dispense(1, 7, { prescription_id: 50, barcode: 'BC-T2', quantity: 1 }).status === 404,
    'DISPENSE: باركود دواء مستأجر 2 لا يُحل ضمن مستأجر 1 (404 Drug not found)');

// 3.6 FEFO within tenant 1 only — earliest batch first, never the other tenant's
{
    const r = dispense(1, 7, { prescription_id: 50, barcode: 'BC-T1', quantity: 7 });
    assert(r.status === 200 && r.consumed.length === 2 && r.consumed[0].batch_id === 1 && r.consumed[0].qty === 5 && r.consumed[1].batch_id === 2 && r.consumed[1].qty === 2,
        'DISPENSE FEFO (t1): 7 وحدات => 5 من lot A ثم 2 من lot B داخل مستأجر 1 فقط');
    assert(mockDb.dispense.every(d => d.tenant_id === 1), 'DISPENSE: كل أسطر الصرف مختومة بـ tenant_id=1');
    assert(mockDb.batches.find(b => b.id === 3).qty_on_hand === 100, 'DISPENSE: دفعة مستأجر 2 لم تُمس إطلاقاً');
}

// 3.7 insufficient stock (only 1 left in tenant 1 paracetamol after prior) => 409
{
    const r = dispense(1, 7, { prescription_id: 50, barcode: 'BC-T1', quantity: 100 });
    assert(r.status === 409 && r.error === 'Insufficient stock', 'DISPENSE: نقص المخزون => 409');
}

// 3.8 controlled cross-tenant: tenant 2 cannot touch tenant 1 controlled drug
assert(resolveDrug(2, { barcode: 'BC-T1-CTRL' }) === null, 'CONTROLLED: مستأجر 2 لا يحل دواء مراقب لمستأجر 1');

// 3.9 controlled within tenant requires witness (fail-closed) then double-logs balances
{
    // need a Verified queue item for the controlled drug in tenant 1
    mockDb.queue.push({ id: 70, patient_id: 101, medication_name: 'Morphine', status: 'Verified', tenant_id: 1 });
    const noWit = dispense(1, 7, { prescription_id: 70, barcode: 'BC-T1-CTRL', quantity: 2 });
    assert(noWit.status === 422 && noWit.requires_witness, 'CONTROLLED (t1): بلا شاهد => 422 (fail-closed)');
    const sameWit = dispense(1, 7, { prescription_id: 70, barcode: 'BC-T1-CTRL', quantity: 2, witness_user_id: 7 });
    assert(sameWit.status === 422, 'CONTROLLED (t1): الشاهد نفس الصارف => 422');
    const okWit = dispense(1, 7, { prescription_id: 70, barcode: 'BC-T1-CTRL', quantity: 2, witness_user_id: 8 });
    assert(okWit.status === 200 && okWit.isControlled, 'CONTROLLED (t1): شاهد مختلف => صرف ينجح');
    const log = mockDb.controlled.find(c => c.tenant_id === 1);
    assert(log && log.balance_before === 10 && log.balance_after === 8 && log.witnessed_by === 8,
        'CONTROLLED: سجل مزدوج صحيح (قبل=10، بعد=8، الشاهد=8) ومختوم بالمستأجر');
}

// ============================================================================
// Summary
// ============================================================================
console.log(`\n${BOLD}${BLUE}============================================================${RESET}`);
console.log(`  ${GREEN}✅ ناجح${RESET}: ${passed}   ${RED}❌ فاشل${RESET}: ${failed}`);
if (failureLog.length) { console.log(`\n${RED}الاختبارات الفاشلة:${RESET}`); failureLog.forEach(f => console.log(`  - ${f.name}: ${f.details}`)); }
if (failed === 0) { console.log(`\n${BOLD}${GREEN}🎉 جميع اختبارات عزل E5 نجحت.${RESET}`); process.exit(0); }
else { console.log(`\n${BOLD}${RED}⛔ فشل ${failed} اختبار(ات).${RESET}`); process.exit(1); }
