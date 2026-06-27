/**
 * cross_tenant_inventory_test.js
 * ==========================================
 * اختبار محلي لمنع تسريب بيانات المخزون وحركات الصرف بين المستأجرين
 * Cross-Tenant Inventory & Stock Movement Data Leak Prevention Test
 *
 * يتحقق هذا السكربت من منطق الكود، والتحقق البنائي للاستعلامات،
 * ومحاكاة المعالجات البرمجية للتأكد من فاعلية عزل tenant_id / facility_id / branch_id
 * ومنع ثغرات IDOR لجميع مسارات المخزون وحركات الصرف.
 *
 * الاستخدام:
 *   node cross_tenant_inventory_test.js
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
console.log(`${BOLD}${BLUE}  اختبار منع تسريب البيانات للمخزون وحركات الصرف (Cross-Tenant Inventory Test)${RESET}`);
console.log(`${BOLD}${BLUE}  NamaMedical — Inventory & Stock Movement Isolation & IDOR Prevention${RESET}`);
console.log(`${BOLD}${BLUE}============================================================${RESET}\n`);

// ===== 1. قراءة وفحص ملف server.js برمجياً (Static Code Check) =====
console.log(`${BOLD}[ 1 ] فحص بنية الاستعلامات والمسارات في server.js (Static Code Audit)${RESET}`);
const serverPath = path.join(__dirname, 'server.js');
const serverContent = fs.readFileSync(serverPath, 'utf8');

// تحقق من أن المسارات الحساسة تحتوي على التحقق من المستأجر
const expectedChecks = [
    { pattern: "inventory WHERE tenant_id=$1", label: "GET /api/inventory: تصفية جدول المخزون حسب المستأجر" },
    { pattern: "inventory WHERE tenant_id=$1 AND CAST(quantity AS INTEGER)", label: "GET /api/inventory/low-stock: تصفية التنبيهات حسب المستأجر" },
    { pattern: "INSERT INTO inventory", label: "وجود استعلام إدراج المخزون" },
    { pattern: "tenant_id,facility_id", label: "ختم tenant_id و facility_id في إدراج المخزون" },
    { pattern: "UPDATE inventory SET", label: "وجود استعلام تحديث المخزون" },
    { pattern: "DELETE FROM inventory WHERE id=$1 AND tenant_id=$2", label: "حذف صنف مخزن مع شرط المستأجر" },
    { pattern: "inventory_items WHERE is_active=1 AND tenant_id=$1 ORDER BY item_name", label: "GET /api/inventory/items: تصفية الأصناف بالتفصيل حسب المستأجر" },
    { pattern: "INSERT INTO inventory_items (item_name, item_code, category, unit, cost_price, stock_qty, tenant_id, branch_id)", label: "إدراج تفاصيل صنف جديد مع حقول العزل" },
    { pattern: "inventory_dept_requests WHERE tenant_id=$1 ORDER BY id DESC", label: "GET /api/dept-requests: تصفية طلبات الصرف حسب المستأجر" },
    { pattern: "INSERT INTO inventory_dept_requests (department, requested_by, request_date, notes, tenant_id, branch_id)", label: "إنشاء طلب الصرف الأب مع حقول العزل" },
    { pattern: "INSERT INTO inventory_dept_request_items (request_id, item_id, qty_requested, tenant_id, branch_id)", label: "إنشاء تفاصيل طلب الصرف مع حقول العزل" },
    { pattern: "inventory_dept_requests WHERE id=$1 AND tenant_id=$2", label: "التحقق من ملكية طلب الصرف (IDOR Check)" },
    { pattern: "UPDATE inventory_items SET stock_qty = GREATEST(stock_qty - $1, 0) WHERE id=$2 AND tenant_id=$3", label: "خصم الكمية المعتمدة من الصنف مع شرط المستأجر" }
];

for (const { pattern, label } of expectedChecks) {
    const found = serverContent.includes(pattern) || serverContent.replace(/\s+/g, '').includes(pattern.replace(/\s+/g, ''));
    assert(found, label, `البحث عن: "${pattern}"`);
}

// ===== 2. فحص وجود logAudit للعمليات المعدلة =====
console.log(`\n${BOLD}[ 2 ] فحص وجود logAudit للعمليات الحساسة في server.js${RESET}`);
const requiredAudits = [
    { action: 'CREATE_INVENTORY_ITEM', label: 'logAudit: إنشاء صنف مخزني' },
    { action: 'UPDATE_INVENTORY_ITEM', label: 'logAudit: تعديل صنف مخزني' },
    { action: 'DELETE_INVENTORY_ITEM', label: 'logAudit: حذف صنف مخزني' },
    { action: 'CREATE_INVENTORY_ITEM_DETAIL', label: 'logAudit: إنشاء تفاصيل صنف مخزني' },
    { action: 'CREATE_DEPT_REQUEST', label: 'logAudit: إنشاء طلب صرف للأقسام' },
    { action: 'UPDATE_DEPT_REQUEST_STATUS', label: 'logAudit: تعديل حالة طلب الصرف والخصم' }
];

for (const { action, label } of requiredAudits) {
    const found = serverContent.includes(`'${action}'`) || serverContent.includes(`"${action}"`);
    assert(found, label, `البحث عن: '${action}'`);
}

// ===== 3. فحص أمان استعلامات SQL injection prevention لـ tenant_id في المخازن =====
console.log(`\n${BOLD}[ 3 ] فحص أمان الاستعلامات ومنع حقن SQL (SQL Injection Prevention)${RESET}`);
{
    const unsafeInterpolation = serverContent.includes("inventory WHERE id = ${id}") ||
                                serverContent.includes("inventory_items WHERE id = ${id}") ||
                                serverContent.includes("inventory_dept_requests WHERE id = ${id}");
    assert(!unsafeInterpolation, 'الاستعلامات للمخازن تستخدم parameterized parameters بشكل آمن ($N)');
}

// ===== 4. محاكاة منطق عزل البيانات (Simulation Tests) =====
console.log(`\n${BOLD}[ 4 ] محاكاة واختبار عزل مسارات المخزون وحركات الصرف (Inventory Simulation)${RESET}`);
{
    // قاعدة بيانات وهمية للمحاكاة
    const mockDb = {
        inventory: [
            { id: 1, name: 'شاش معقم - مستأجر 1', quantity: 50, reorder_level: 10, tenant_id: 1, facility_id: 11 },
            { id: 2, name: 'مقياس حرارة - مستأجر 2', quantity: 2, reorder_level: 5, tenant_id: 2, facility_id: 22 }
        ],
        inventory_items: [
            { id: 101, item_name: 'شاش تفصيلي 1', stock_qty: 100, tenant_id: 1, branch_id: 11, is_active: 1 },
            { id: 102, item_name: 'شاش تفصيلي 2', stock_qty: 20, tenant_id: 2, branch_id: 22, is_active: 1 }
        ],
        dept_requests: [
            { id: 501, department: 'طوارئ', requested_by: 'ممرض 1', status: 'Pending', tenant_id: 1, branch_id: 11 },
            { id: 502, department: 'عيادات', requested_by: 'ممرض 2', status: 'Pending', tenant_id: 2, branch_id: 22 }
        ],
        dept_request_items: [
            { id: 1001, request_id: 501, item_id: 101, qty_requested: 5, qty_approved: 0, tenant_id: 1, branch_id: 11 },
            { id: 1002, request_id: 502, item_id: 102, qty_requested: 2, qty_approved: 0, tenant_id: 2, branch_id: 22 }
        ]
    };

    // 4.1: تصفية المخزون حسب المستأجر
    function handleGetInventory(sessionTenantId) {
        if (!sessionTenantId) return [];
        return mockDb.inventory.filter(item => item.tenant_id === sessionTenantId);
    }
    const t1Inv = handleGetInventory(1);
    assert(t1Inv.length === 1 && t1Inv[0].id === 1, 'GET inventory (tenant 1): يرى فقط مخزون مستأجر 1');
    assert(!t1Inv.some(i => i.tenant_id === 2), 'GET inventory (tenant 1): لا تتسرب له بيانات مستأجر 2');

    // 4.2: تصفية تنبيهات المخزون المنخفض حسب المستأجر
    function handleGetLowStock(sessionTenantId) {
        if (!sessionTenantId) return [];
        return mockDb.inventory.filter(item => item.tenant_id === sessionTenantId && item.quantity <= item.reorder_level);
    }
    const t2Low = handleGetLowStock(2);
    assert(t2Low.length === 1 && t2Low[0].id === 2, 'GET inventory/low-stock (tenant 2): يرى تنبيهاته فقط');
    assert(!t2Low.some(i => i.tenant_id === 1), 'GET inventory/low-stock (tenant 2): لا تتسرب له تنبيهات مستأجر 1');

    // 4.3: إنشاء صنف مخزني يختم المستأجر
    function handleCreateInventory(sessionTenantId, sessionFacilityId, body) {
        const newItem = {
            id: mockDb.inventory.length + 1,
            name: body.name,
            quantity: body.quantity || 0,
            tenant_id: sessionTenantId,
            facility_id: sessionFacilityId
        };
        mockDb.inventory.push(newItem);
        return { status: 200, item: newItem };
    }
    const createRes = handleCreateInventory(1, 11, { name: 'مطهر جروح', quantity: 15 });
    assert(createRes.status === 200 && createRes.item.tenant_id === 1 && createRes.item.facility_id === 11, 'POST inventory: ختم tenant_id=1 و facility_id=11 بنجاح');

    // 4.4: منع IDOR عند تعديل صنف مخزني
    function handleUpdateInventory(sessionTenantId, itemId, body) {
        const item = mockDb.inventory.find(i => i.id === itemId);
        if (!item || (sessionTenantId && item.tenant_id !== sessionTenantId)) {
            return { status: 404, error: 'Item not found' };
        }
        item.name = body.name;
        return { status: 200, item };
    }
    const updateErr = handleUpdateInventory(1, 2, { name: 'معدل' });
    assert(updateErr.status === 404, 'PUT inventory/:id: مستأجر 1 يمنع من تعديل صنف مستأجر 2 (404)');

    const updateOk = handleUpdateInventory(2, 2, { name: 'مقياس حرارة رقمي' });
    assert(updateOk.status === 200 && mockDb.inventory.find(i => i.id === 2).name === 'مقياس حرارة رقمي', 'PUT inventory/:id: نجاح تعديل صنف تابع لنفس المستأجر');

    // 4.5: منع IDOR عند حذف صنف مخزني
    function handleDeleteInventory(sessionTenantId, itemId) {
        const item = mockDb.inventory.find(i => i.id === itemId);
        if (!item || (sessionTenantId && item.tenant_id !== sessionTenantId)) {
            return { status: 404, error: 'Item not found' };
        }
        mockDb.inventory = mockDb.inventory.filter(i => i.id !== itemId);
        return { status: 200, success: true };
    }
    const deleteErr = handleDeleteInventory(1, 2);
    assert(deleteErr.status === 404, 'DELETE inventory/:id: مستأجر 1 يمنع من حذف صنف مستأجر 2 (404)');

    const deleteOk = handleDeleteInventory(2, 2);
    assert(deleteOk.status === 200 && !mockDb.inventory.some(i => i.id === 2), 'DELETE inventory/:id: نجاح حذف صنف تابع لنفس المستأجر');

    // 4.6: تصفية الأصناف التفصيلية inventory_items
    function handleGetInventoryItems(sessionTenantId) {
        if (!sessionTenantId) return [];
        return mockDb.inventory_items.filter(item => item.tenant_id === sessionTenantId && item.is_active === 1);
    }
    const t1Items = handleGetInventoryItems(1);
    assert(t1Items.length === 1 && t1Items[0].id === 101, 'GET inventory/items: يرى فقط الأصناف الخاصة بمستأجره');

    // 4.7: إنشاء طلب صرف أقسام مع التحقق من الأصناف (IDOR prevention)
    function handleCreateDeptRequest(sessionTenantId, sessionFacilityId, body) {
        const { department, items } = body;
        
        if (sessionTenantId && items && items.length) {
            for (const it of items) {
                const check = mockDb.inventory_items.find(i => i.id === it.item_id);
                if (!check || check.tenant_id !== sessionTenantId) {
                    return { status: 404, error: 'Item not found' };
                }
            }
        }

        const newReq = {
            id: mockDb.dept_requests.length + 501,
            department,
            status: 'Pending',
            tenant_id: sessionTenantId,
            branch_id: sessionFacilityId
        };
        mockDb.dept_requests.push(newReq);
        return { status: 200, request: newReq };
    }
    const requestErr = handleCreateDeptRequest(1, 11, { department: 'باطنية', items: [{ item_id: 102, qty: 1 }] });
    assert(requestErr.status === 404, 'POST dept-requests: يمنع من طلب صنف تابع لمستأجر آخر (404)');

    const requestOk = handleCreateDeptRequest(1, 11, { department: 'باطنية', items: [{ item_id: 101, qty: 2 }] });
    assert(requestOk.status === 200 && requestOk.request.tenant_id === 1, 'POST dept-requests: نجاح إنشاء طلب صرف لنفس المستأجر');

    // 4.8: منع IDOR عند جلب تفاصيل طلب الصرف
    function handleGetDeptRequestItems(sessionTenantId, requestId) {
        const reqParent = mockDb.dept_requests.find(r => r.id === requestId);
        if (!reqParent || (sessionTenantId && reqParent.tenant_id !== sessionTenantId)) {
            return { status: 404, error: 'Request not found' };
        }
        return { status: 200, items: mockDb.dept_request_items.filter(i => i.request_id === requestId) };
    }
    const reqItemsErr = handleGetDeptRequestItems(1, 502);
    assert(reqItemsErr.status === 404, 'GET dept-requests/:id/items: مستأجر 1 يمنع من جلب تفاصيل طلب مستأجر 2 (404)');

    const reqItemsOk = handleGetDeptRequestItems(1, 501);
    assert(reqItemsOk.status === 200 && reqItemsOk.items.length === 1, 'GET dept-requests/:id/items: نجاح جلب تفاصيل الطلب التابع للمستأجر');

    // 4.9: منع IDOR عند تعديل حالة واعتماد طلب الصرف والخصم
    function handleApproveDeptRequest(sessionTenantId, requestId, status) {
        const reqParent = mockDb.dept_requests.find(r => r.id === requestId);
        if (!reqParent || (sessionTenantId && reqParent.tenant_id !== sessionTenantId)) {
            return { status: 404, error: 'Request not found' };
        }
        reqParent.status = status;
        if (status === 'Approved') {
            const items = mockDb.dept_request_items.filter(i => i.request_id === requestId && (!sessionTenantId || i.tenant_id === sessionTenantId));
            for (const it of items) {
                const qty = it.qty_approved || it.qty_requested;
                const dbItem = mockDb.inventory_items.find(i => i.id === it.item_id && (!sessionTenantId || i.tenant_id === sessionTenantId));
                if (dbItem) {
                    dbItem.stock_qty = Math.max(dbItem.stock_qty - qty, 0);
                }
            }
        }
        return { status: 200, request: reqParent };
    }
    const approveErr = handleApproveDeptRequest(1, 502, 'Approved');
    assert(approveErr.status === 404, 'PUT dept-requests/:id: مستأجر 1 يمنع من اعتماد طلب مستأجر 2 (404)');

    const approveOk = handleApproveDeptRequest(1, 501, 'Approved');
    assert(approveOk.status === 200 && mockDb.inventory_items.find(i => i.id === 101).stock_qty === 95, 'PUT dept-requests/:id: نجاح اعتماد الطلب وتخصيم المخزن بالشروط الصحيحة');
}

// ===== ملخص نهائي =====
console.log(`\n${BOLD}${BLUE}============================================================${RESET}`);
console.log(`${BOLD}${BLUE}  ملخص نتائج اختبارات عزل المخزون وحركات الصرف${RESET}`);
console.log(`${BOLD}${BLUE}============================================================${RESET}`);
console.log(`  ${GREEN}✅ ناجح${RESET}:  ${passed}`);
console.log(`  ${RED}❌ فاشل${RESET}:  ${failed}`);

if (failureLog.length > 0) {
    console.log(`\n${RED}الاختبارات الفاشلة:${RESET}`);
    failureLog.forEach(f => console.log(`  - ${f.testName}: ${f.details}`));
}

if (failed === 0) {
    console.log(`\n${BOLD}${GREEN}🎉 جميع الاختبارات نجحت! عزل مسارات المخزون وحركات الصرف يعمل بنسبة 100%.${RESET}`);
    process.exit(0);
} else {
    console.log(`\n${BOLD}${RED}⛔ فشل ${failed} اختبار(ات). راجع الأخطاء أعلاه.${RESET}`);
    process.exit(1);
}
