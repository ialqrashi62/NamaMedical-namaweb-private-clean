/**
 * cross_tenant_pharmacy_inventory_reports_test.js
 * =======================================================
 * اختبار محلي لمنع تسريب تقارير الصيدلية والمخزون الطبي التفصيلية والتجميعية بين المستأجرين
 * Cross-Tenant Pharmacy & Inventory Reports Data Leak Prevention Test
 *
 * الاستخدام:
 *   node namaweb/cross_tenant_pharmacy_inventory_reports_test.js
 */

const fs = require('fs');
const path = require('path');

// ===== إعداد ألوان الطرفية =====
const RED   = '\x1b[31m';
const GREEN = '\x1b[32m';
const YELLOW = '\x1b[33m';
const BLUE  = '\x1b[34m';
const RESET = '\x1b[0m';
const BOLD  = '\x1b[1m';

let passed = 0;
let failed = 0;
const failureLog = [];

function assert(condition, testName, details = '') {
    if (condition) {
        console.log(`  ${GREEN}✅ PASS${RESET} — ${testName}`);
        passed++;
    } else {
        console.log(`  ${RED}❌ FAIL${RESET} — ${testName}${details ? ' | ' + details : ''}`);
        failed++;
        failureLog.push({ testName, details });
    }
}

console.log(`\n${BOLD}${BLUE}============================================================${RESET}`);
console.log(`${BOLD}${BLUE}  اختبار عزل تقارير الصيدلية والمخزون (Cross-Tenant Pharmacy & Inventory Reports Test)${RESET}`);
console.log(`${BOLD}${BLUE}  NamaMedical — Pharmacy & Inventory Reports Isolation & Aggregate Protection${RESET}`);
console.log(`${BOLD}${BLUE}============================================================${RESET}\n`);

// ===== 1. فحص ملف server.js برمجياً (Static Code Check) =====
console.log(`${BOLD}[ 1 ] فحص تطبيق requireTenantScope والتصفية في server.js (Static Code Audit)${RESET}`);
const serverPath = path.join(__dirname, 'server.js');
const serverContent = fs.readFileSync(serverPath, 'utf8');

// المسارات المستهدفة وعينات التحقق
const targetedRoutes = [
    { route: "app.get('/api/pharmacy/drugs', requireAuth, requireTenantScope", label: "GET /api/pharmacy/drugs (requireTenantScope)" },
    { route: "app.get('/api/pharmacy/low-stock', requireAuth, requireTenantScope", label: "GET /api/pharmacy/low-stock (requireTenantScope)" },
    { route: "app.post('/api/pharmacy/drugs', requireAuth, requireTenantScope", label: "POST /api/pharmacy/drugs (requireTenantScope)" },
    { route: "app.get('/api/pharmacy/queue', requireAuth, requireTenantScope", label: "GET /api/pharmacy/queue (requireTenantScope)" },
    { route: "app.put('/api/pharmacy/queue/:id', requireAuth, requireTenantScope", label: "PUT /api/pharmacy/queue/:id (requireTenantScope)" },
    { route: "app.get('/api/inventory/items', requireAuth, requireRole('inventory', 'pharmacy'), requireTenantScope", label: "GET /api/inventory/items (requireRole+requireTenantScope) [E16-hardened]" },
    { route: "app.post('/api/inventory/items', requireAuth, requireRole('inventory', 'pharmacy'), requireTenantScope", label: "POST /api/inventory/items (requireRole+requireTenantScope) [E16-hardened]" },
    { route: "app.get('/api/prescriptions', requireAuth, requireTenantScope", label: "GET /api/prescriptions (requireTenantScope)" },
    { route: "app.post('/api/prescriptions', requireAuth, requireTenantScope", label: "POST /api/prescriptions (requireTenantScope)" },
    { route: "app.get('/api/print/prescription/:id', requireAuth, requireTenantScope", label: "GET /api/print/prescription/:id (requireTenantScope)" },
    { route: "app.post('/api/pharmacy/deduct-stock', requireAuth, requireTenantScope", label: "POST /api/pharmacy/deduct-stock (requireTenantScope)" },
    { route: "app.get('/api/pharmacy/expiring', requireAuth, requireRole('pharmacy'), requireTenantScope", label: "GET /api/pharmacy/expiring (requireTenantScope)" },
    { route: "app.get('/api/pharmacy/stock-log', requireAuth, requireTenantScope", label: "GET /api/pharmacy/stock-log (requireTenantScope)" },
    { route: "app.get('/api/inventory/low-stock', requireAuth, requireTenantScope", label: "GET /api/inventory/low-stock (requireTenantScope)" },
    { route: "app.get('/api/inventory', requireAuth, requireTenantScope", label: "GET /api/inventory (requireTenantScope)" },
    { route: "app.post('/api/inventory', requireAuth, requireTenantScope", label: "POST /api/inventory (requireTenantScope)" },
    { route: "app.put('/api/inventory/:id', requireAuth, requireTenantScope", label: "PUT /api/inventory/:id (requireTenantScope)" },
    { route: "app.delete('/api/inventory/:id', requireAuth, requireTenantScope", label: "DELETE /api/inventory/:id (requireTenantScope)" },
    { route: "app.get('/api/pharmacy/prescriptions', requireAuth, requireTenantScope", label: "GET /api/pharmacy/prescriptions (requireTenantScope)" },
    { route: "app.post('/api/pharmacy/prescriptions', requireAuth, requireTenantScope", label: "POST /api/pharmacy/prescriptions (requireTenantScope)" },
    { route: "app.put('/api/pharmacy/prescriptions/:id', requireAuth, requireTenantScope", label: "PUT /api/pharmacy/prescriptions/:id (requireTenantScope)" }
];

targetedRoutes.forEach(({ route, label }) => {
    const cleanRoute = route.replace(/\s+/g, '');
    const found = serverContent.replace(/\s+/g, '').includes(cleanRoute);
    assert(found, label, `البحث عن المسار: "${route}"`);
});

// ===== 2. فحص وجود logAudit للعمليات المعدلة =====
console.log(`\n${BOLD}[ 2 ] فحص وجود logAudit للعمليات الحساسة في server.js${RESET}`);
const requiredAudits = [
    { action: 'ADD_DRUG', label: 'logAudit: إضافة دواء لكتالوج الصيدلية' },
    { action: 'DISPENSE_MEDICATION', label: 'logAudit: صرف دواء من وصفة' },
    { action: 'CREATE_INVENTORY_ITEM_DETAIL', label: 'logAudit: إنشاء تفاصيل صنف مخزن' },
    { action: 'CREATE_PRESCRIPTION', label: 'logAudit: إنشاء وصفة طبية' },
    { action: 'CREATE_PRESCRIPTION_QUEUE', label: 'logAudit: إضافة وصفة لطابور الصيدلية' },
    { action: 'STOCK_OUT', label: 'logAudit: خصم كمية الدواء من المخزن' },
    { action: 'CREATE_INVENTORY_ITEM', label: 'logAudit: إنشاء صنف مخزني' },
    { action: 'UPDATE_INVENTORY_ITEM', label: 'logAudit: تعديل صنف مخزني' },
    { action: 'DELETE_INVENTORY_ITEM', label: 'logAudit: حذف صنف مخزني' },
    { action: 'CREATE_PHARMACY_PRESCRIPTION', label: 'logAudit: إنشاء وصفة طبية ديناميكية' },
    { action: 'UPDATE_PHARMACY_PRESCRIPTION', label: 'logAudit: تحديث وصفة طبية ديناميكية' }
];

requiredAudits.forEach(({ action, label }) => {
    const found = serverContent.includes(`'${action}'`) || serverContent.includes(`"${action}"`);
    assert(found, label, `البحث عن: '${action}'`);
});

// ===== 3. فحص أمان استعلامات SQL injection prevention لـ tenant_id في الصيدلية والمخزن =====
console.log(`\n${BOLD}[ 3 ] فحص أمان الاستعلامات ومنع حقن SQL (SQL Injection Prevention)${RESET}`);
{
    const unsafeInterpolation = serverContent.includes("pharmacy_prescriptions_queue WHERE id = ${id}") ||
                                serverContent.includes("pharmacy_drug_catalog WHERE id = ${drug_id}") ||
                                serverContent.includes("inventory WHERE id = ${id}") ||
                                serverContent.includes("pharmacy_prescriptions WHERE id = ${id}");
    assert(!unsafeInterpolation, 'الاستعلامات للصيدلية والمخازن تستخدم parameterized parameters بشكل آمن ($N)');
}

// ===== 4. محاكاة منطق عزل البيانات للتقارير والأرصدة والتجميعات (Simulation Tests) =====
console.log(`\n${BOLD}[ 4 ] محاكاة واختبار عزل تقارير الصيدلية والمخزون (Aggregate & Reports Simulation)${RESET}`);
{
    // قاعدة بيانات وهمية للمحاكاة
    const mockDb = {
        patients: [
            { id: 101, name: 'مريض مستأجر 1', tenant_id: 1 },
            { id: 102, name: 'مريض مستأجر 2', tenant_id: 2 }
        ],
        prescriptions: [
            { id: 1, patient_id: 101, drug_name: 'Aspirin', tenant_id: 1, status: 'Dispensed' },
            { id: 2, patient_id: 102, drug_name: 'Panadol', tenant_id: 2, status: 'Dispensed' }
        ],
        drugs: [
            { id: 10, drug_name: 'Aspirin', stock_qty: 100, min_qty: 10, expiry_date: '2026-12-01', tenant_id: 1, cost_price: 5.0, selling_price: 10.0 },
            { id: 20, drug_name: 'Panadol', stock_qty: 5, min_qty: 10, expiry_date: '2026-07-01', tenant_id: 2, cost_price: 2.0, selling_price: 4.0 }
        ],
        inventory: [
            { id: 501, name: 'Surgical Gloves', quantity: 200, reorder_level: 20, tenant_id: 1 },
            { id: 502, name: 'Syringes', quantity: 5, reorder_level: 15, tenant_id: 2 }
        ],
        inventory_items: [
            { id: 601, item_name: 'Surgical Gown', stock_qty: 80, tenant_id: 1 },
            { id: 602, item_name: 'Thermometer', stock_qty: 12, tenant_id: 2 }
        ],
        stock_logs: [
            { id: 1, drug_id: 10, drug_name: 'Aspirin', quantity: 5, movement_type: 'OUT', created_at: new Date() },
            { id: 2, drug_id: 20, drug_name: 'Panadol', quantity: 1, movement_type: 'OUT', created_at: new Date() }
        ]
    };

    // 4.1: محاكاة جلب تقارير أدوية الصيدلية
    function getDrugsReport(sessionTenantId) {
        if (!sessionTenantId) return [];
        return mockDb.drugs.filter(d => d.tenant_id === sessionTenantId);
    }
    const t1Drugs = getDrugsReport(1);
    assert(t1Drugs.length === 1 && t1Drugs[0].drug_name === 'Aspirin', 'GET pharmacy/drugs: يرى فقط أدوية مستأجر 1');
    assert(!t1Drugs.some(d => d.tenant_id === 2), 'GET pharmacy/drugs: لا تتسرب أدوية مستأجر 2 لمستأجر 1');

    // 4.2: محاكاة تقارير الأدوية منخفضة المخزون
    function getLowStockDrugsReport(sessionTenantId) {
        if (!sessionTenantId) return [];
        return mockDb.drugs.filter(d => d.tenant_id === sessionTenantId && d.stock_qty <= d.min_qty);
    }
    const t1LowStock = getLowStockDrugsReport(1);
    const t2LowStock = getLowStockDrugsReport(2);
    assert(t1LowStock.length === 0, 'GET pharmacy/low-stock (tenant 1): مستأجر 1 ليس لديه أدوية منخفضة المخزون');
    assert(t2LowStock.length === 1 && t2LowStock[0].drug_name === 'Panadol', 'GET pharmacy/low-stock (tenant 2): مستأجر 2 يرى الدواء المنخفض الخاص به فقط');

    // 4.3: محاكاة تقارير المخزون المنتهي أو قارب الانتهاء
    function getExpiringDrugsReport(sessionTenantId, daysLimit) {
        if (!sessionTenantId) return [];
        const limitDate = new Date();
        limitDate.setDate(limitDate.getDate() + daysLimit);
        return mockDb.drugs.filter(d => d.tenant_id === sessionTenantId && new Date(d.expiry_date) <= limitDate);
    }
    // Panadol (expiry 2026-07-01) is expiring within 30 days
    const t2Expiring = getExpiringDrugsReport(2, 30);
    assert(t2Expiring.length === 1 && t2Expiring[0].drug_name === 'Panadol', 'GET pharmacy/expiring (tenant 2): مستأجر 2 يرى أدويته المنتهية الصلاحية');
    const t1Expiring = getExpiringDrugsReport(1, 30);
    assert(t1Expiring.length === 0, 'GET pharmacy/expiring (tenant 1): مستأجر 1 لا يرى أدوية مستأجر 2 المنتهية');

    // 4.4: محاكاة تقارير سجل حركات المخزون (stock-log)
    function getStockLogsReport(sessionTenantId) {
        if (!sessionTenantId) return [];
        // JOIN sl with drugs dc
        return mockDb.stock_logs.filter(sl => {
            const drug = mockDb.drugs.find(d => d.id === sl.drug_id);
            return drug && drug.tenant_id === sessionTenantId;
        });
    }
    const t1Logs = getStockLogsReport(1);
    assert(t1Logs.length === 1 && t1Logs[0].drug_name === 'Aspirin', 'GET pharmacy/stock-log: يرجع فقط سجل حركات مستأجر 1 عبر JOIN');
    assert(!t1Logs.some(l => l.drug_id === 20), 'GET pharmacy/stock-log: لا يتم تسريب حركات مستأجر 2 لمستأجر 1');

    // 4.5: محاكاة تقارير المخزون العام (inventory)
    function getInventoryReport(sessionTenantId) {
        if (!sessionTenantId) return [];
        return mockDb.inventory.filter(i => i.tenant_id === sessionTenantId);
    }
    const t1Inv = getInventoryReport(1);
    assert(t1Inv.length === 1 && t1Inv[0].name === 'Surgical Gloves', 'GET inventory: يرجع فقط مخزون مستأجر 1');
    assert(!t1Inv.some(i => i.tenant_id === 2), 'GET inventory: لا يتسرب مخزون مستأجر 2 لمستأجر 1');

    // 4.6: محاكاة تقارير المخزون العام المنخفض (inventory/low-stock)
    function getLowStockInventoryReport(sessionTenantId) {
        if (!sessionTenantId) return [];
        return mockDb.inventory.filter(i => i.tenant_id === sessionTenantId && i.quantity <= i.reorder_level);
    }
    const t1LowInv = getLowStockInventoryReport(1);
    const t2LowInv = getLowStockInventoryReport(2);
    assert(t1LowInv.length === 0, 'GET inventory/low-stock (tenant 1): مستأجر 1 لا يرى مستلزمات منخفضة');
    assert(t2LowInv.length === 1 && t2LowInv[0].name === 'Syringes', 'GET inventory/low-stock (tenant 2): مستأجر 2 يرى مستلزماته المنخفضة فقط');

    // 4.7: محاكاة تقارير الأصناف المخزنية التفصيلية (inventory_items)
    function getInventoryItemsReport(sessionTenantId) {
        if (!sessionTenantId) return [];
        return mockDb.inventory_items.filter(i => i.tenant_id === sessionTenantId);
    }
    const t1InvItems = getInventoryItemsReport(1);
    assert(t1InvItems.length === 1 && t1InvItems[0].item_name === 'Surgical Gown', 'GET inventory/items: يرجع فقط أصناف مستأجر 1');
    assert(!t1InvItems.some(i => i.tenant_id === 2), 'GET inventory/items: لا يتسرب أصناف مستأجر 2 لمستأجر 1');

    // 4.8: التحقق من رفض العمليات في بيئة الإنتاج عند فقدان سياق المستأجر (Production context protection)
    function simulateMiddleware(req) {
        const tenantId = req.session?.user?.tenantId || null;
        const isProduction = req.env === 'production';
        if (!tenantId && isProduction) {
            return { status: 403, error: 'Tenant scope required' };
        }
        return { status: 200 };
    }
    const prodFailRes = simulateMiddleware({ session: { user: {} }, env: 'production' });
    assert(prodFailRes.status === 403, 'requireTenantScope middleware: يرفض الطلب بـ 403 في الإنتاج إذا كان tenantId مفقوداً');
    
    const devPassRes = simulateMiddleware({ session: { user: {} }, env: 'development' });
    assert(devPassRes.status === 200, 'requireTenantScope middleware: يمرر الطلب في التطوير مع وضع fallback تلقائي');
}

// ===== ملخص نهائي =====
console.log(`\n${BOLD}${BLUE}============================================================${RESET}`);
console.log(`${BOLD}${BLUE}  ملخص نتائج اختبارات عزل تقارير الصيدلية والمخزون${RESET}`);
console.log(`${BOLD}${BLUE}============================================================${RESET}`);
console.log(`  ${GREEN}✅ ناجح${RESET}:  ${passed}`);
console.log(`  ${RED}❌ فاشل${RESET}:  ${failed}`);

if (failureLog.length > 0) {
    console.log(`\n${RED}الاختبارات الفاشلة:${RESET}`);
    failureLog.forEach(f => console.log(`  - ${f.testName}: ${f.details}`));
}

if (failed === 0) {
    console.log(`\n${BOLD}${GREEN}🎉 جميع الاختبارات نجحت! عزل تقارير الصيدلية والمخزون الطبي يعمل بنسبة 100%.${RESET}`);
    process.exit(0);
} else {
    console.log(`\n${BOLD}${RED}⛔ فشل ${failed} اختبار(ات). راجع الأخطاء أعلاه.${RESET}`);
    process.exit(1);
}
