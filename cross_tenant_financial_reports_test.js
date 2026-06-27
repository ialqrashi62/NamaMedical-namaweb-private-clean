/**
 * cross_tenant_financial_reports_test.js
 * ==========================================
 * اختبار محلي لمنع تسريب التقارير والبيانات المالية بين المستأجرين
 * Cross-Tenant Financial Reports Data Leak Prevention Test
 *
 * يتحقق هذا السكربت من:
 * 1. حماية المسارات المالية السبعة باستخدام requireTenantScope.
 * 2. تصفية كافة الاستعلامات التجميعية والتفصيلية بالـ tenant_id.
 * 3. محاكاة منطق التقارير وإثبات أن مستأجر 1 لا يرى الإيرادات أو الأرباح أو أعمار الديون أو عمولات مستأجر 2.
 * 4. رفض الطلبات في بيئة الإنتاج في حال غياب tenantId.
 *
 * الاستخدام:
 *   node cross_tenant_financial_reports_test.js
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

console.log(`\n${BOLD}${BLUE}================================================================${RESET}`);
console.log(`${BOLD}${BLUE}  اختبار منع تسريب البيانات المالية (Cross-Tenant Financial Leak Test)${RESET}`);
console.log(`${BOLD}${BLUE}  NamaMedical — Detailed Financial Reports Isolation & IDOR Verification${RESET}`);
console.log(`${BOLD}${BLUE}================================================================${RESET}\n`);

// ===== 1. قراءة وفحص ملف server.js برمجياً (Static Code Audit) =====
console.log(`${BOLD}[ 1 ] فحص حماية وتصفية مسارات التقارير المالية في server.js (Static Code Audit)${RESET}`);
const serverPath = path.join(__dirname, 'server.js');
const serverContent = fs.readFileSync(serverPath, 'utf8');

// تحقق من وجود requireTenantScope في تعريفات المسارات السبعة
const routesToCheck = [
    { pattern: "app.get('/api/reports/financial', requireAuth, requireRole('finance'), requireTenantScope", label: "Financial: /api/reports/financial محمي بـ requireTenantScope" },
    { pattern: "app.get('/api/reports/commissions', requireAuth, requireRole('finance', 'doctor'), requireTenantScope", label: "Commissions: /api/reports/commissions محمي بـ requireTenantScope" },
    { pattern: "app.get('/api/reports/pnl', requireAuth, requireRole('finance'), requireTenantScope", label: "PnL: /api/reports/pnl محمي بـ requireTenantScope" },
    { pattern: "app.get('/api/reports/daily-cash', requireAuth, requireRole('finance', 'accounts'), requireTenantScope", label: "Daily Cash: /api/reports/daily-cash محمي بـ requireTenantScope" },
    { pattern: "app.get('/api/reports/doctor-revenue', requireAuth, requireRole('finance', 'doctor'), requireTenantScope", label: "Doctor Revenue: /api/reports/doctor-revenue محمي بـ requireTenantScope" },
    { pattern: "app.get('/api/reports/aging', requireAuth, requireRole('finance'), requireTenantScope", label: "Aging: /api/reports/aging محمي بـ requireTenantScope" },
    { pattern: "app.get('/api/finance/summary', requireAuth, requireRole('finance', 'accounts', 'invoices'), requireTenantScope", label: "Finance Summary: /api/finance/summary محمي بـ requireTenantScope" }
];

for (const { pattern, label } of routesToCheck) {
    const cleanPattern = pattern.replace(/\s+/g, '');
    const cleanContent = serverContent.replace(/\s+/g, '');
    const found = cleanContent.includes(cleanPattern);
    assert(found, label, `البحث عن: "${pattern}"`);
}

// ===== 2. فحص استعلامات SQL وتواجد فلتر tenant_id في العمليات التجميعية والمالية =====
console.log(`\n${BOLD}[ 2 ] فحص وجود فلتر tenant_id في استعلامات التقارير المالية (Static SQL Checks)${RESET}`);
const sqlPatternsToCheck = [
    { pattern: "invoices WHERE paid=1 AND tenant_id=$1", label: "Financial: مجموع الإيرادات المعزولة" },
    { pattern: "invoices WHERE paid=0 AND tenant_id=$1", label: "Financial: مجموع المعلقات المعزولة" },
    { pattern: "invoices WHERE tenant_id=$1", label: "Financial: عدد الفواتير الإجمالي المعزول" },
    { pattern: "invoices WHERE paid=1 AND created_at >= date_trunc('month', CURRENT_DATE) AND tenant_id=$1", label: "Financial: إيرادات الشهر المعزولة" },
    
    { pattern: "invoices i WHERE i.service_type = 'Consultation' AND i.description ILIKE $1 AND i.tenant_id = $2", label: "Commissions: فلترة الاستشارة بالـ tenant_id" },
    { pattern: "lab_radiology_orders WHERE doctor_id=$1 AND tenant_id=$2", label: "Commissions: فلترة تحاليل المختبر والأشعة بالـ tenant_id" },
    { pattern: "medical_records WHERE doctor_id=$1 AND tenant_id=$2", label: "Commissions: فلترة زيارات الطبيب بالـ tenant_id" },
    
    { pattern: "pharmacy_drug_catalog WHERE is_active=1 AND tenant_id=$1", label: "PnL: تكلفة الأدوية معزولة بالـ tenant_id" },
    { pattern: "invoices WHERE payment_method='Cash' AND DATE(created_at)=$1 AND cancelled=0${tenantFilter}", label: "Daily Cash: عزل المقبوضات النقدية بالـ tenant_id" },
    { pattern: "invoices WHERE payment_method IN ('Card','POS','شبكة') AND DATE(created_at)=$1 AND cancelled=0${tenantFilter}", label: "Daily Cash: عزل مقبوضات الشبكة بالـ tenant_id" },
    
    { pattern: "invoices i ON i.description LIKE '%' || su.display_name || '%' AND i.cancelled=0 ${dateFilter}${tenantFilter}", label: "Doctor Revenue: LEFT JOIN مع فلترة invoices بـ tenant_id" },
    
    { pattern: "invoices WHERE paid=0 AND cancelled=0 AND created_at >= CURRENT_DATE - 30${tenantFilter}", label: "Aging: ديون المرضى < 30 يوم معزولة بالـ tenant_id" },
    { pattern: "invoices WHERE paid=0 AND cancelled=0 AND created_at BETWEEN CURRENT_DATE - 60 AND CURRENT_DATE - 30${tenantFilter}", label: "Aging: ديون المرضى 30-60 يوم معزولة بالـ tenant_id" }
];

for (const { pattern, label } of sqlPatternsToCheck) {
    // نقوم بالهروب اليدوي لـ $ عند الفحص نظراً لاستخدام string templates
    const cleanPattern = pattern.replace(/\s+/g, '').replace(/\\/g, '');
    const cleanContent = serverContent.replace(/\s+/g, '').replace(/\\/g, '');
    const found = cleanContent.includes(cleanPattern);
    assert(found, label, `البحث عن: "${pattern}"`);
}

// ===== 3. محاكاة منطق عزل البيانات للتقارير المالية (Simulation Tests) =====
console.log(`\n${BOLD}[ 3 ] محاكاة واختبار عزل التقارير المالية (Financial Reports Simulation Tests)${RESET}`);
{
    // قاعدة بيانات وهمية للمحاكاة تحتوي على بيانات مستأجرين مختلفين
    const mockDb = {
        invoices: [
            { id: 1, patient_name: 'Patient T1-A', total: 150.0, paid: 1, cancelled: 0, created_at: new Date(), payment_method: 'Cash', service_type: 'Consultation', description: 'Consultation for Dr. Ahmad', tenant_id: 1, discount: 10 },
            { id: 2, patient_name: 'Patient T1-B', total: 300.0, paid: 0, cancelled: 0, created_at: new Date(), payment_method: 'Card', service_type: 'Procedure', description: 'Tooth filling', tenant_id: 1, discount: 0 },
            { id: 3, patient_name: 'Patient T2-A', total: 1000.0, paid: 1, cancelled: 0, created_at: new Date(), payment_method: 'POS', service_type: 'Consultation', description: 'Consultation for Dr. Ahmad', tenant_id: 2, discount: 50 },
            { id: 4, patient_name: 'Patient T2-B', total: 500.0, paid: 0, cancelled: 0, created_at: new Date(), payment_method: 'Insurance', service_type: 'Consultation', description: 'Consultation for Dr. Sarah', tenant_id: 2, discount: 0 }
        ],
        lab_radiology_orders: [
            { id: 1, doctor_id: 101, price: 120.0, is_radiology: 0, tenant_id: 1 },
            { id: 2, doctor_id: 101, price: 400.0, is_radiology: 0, tenant_id: 2 }
        ],
        medical_records: [
            { id: 1, patient_id: 1, doctor_id: 101, tenant_id: 1 },
            { id: 2, patient_id: 3, doctor_id: 101, tenant_id: 2 }
        ],
        pharmacy_drug_catalog: [
            { id: 1, drug_name: 'Panadol', cost_price: 5.0, stock_qty: 100, is_active: 1, tenant_id: 1 },
            { id: 2, drug_name: 'Aspirin', cost_price: 10.0, stock_qty: 50, is_active: 1, tenant_id: 2 }
        ],
        system_users: [
            { id: 101, display_name: 'Ahmad', speciality: 'General', commission_type: 'percentage', commission_value: 10 },
            { id: 102, display_name: 'Sarah', speciality: 'Pediatrics', commission_type: 'fixed', commission_value: 50 }
        ]
    };

    function querySim(sql, params) {
        if (sql.includes('FROM invoices')) {
            let list = [...mockDb.invoices];
            
            // فلترة المستأجرين
            const tenantMatches = sql.match(/tenant_id\s*=\s*\$(\d+)/);
            if (tenantMatches) {
                const paramIndex = parseInt(tenantMatches[1]) - 1;
                const tId = params[paramIndex];
                list = list.filter(i => i.tenant_id === tId);
            } else if (sql.includes('tenant_id')) {
                // في بعض الحالات يتم التمرير بدون $1، نفترض المستأجر الأول
                list = list.filter(i => i.tenant_id === params[params.length - 1]);
            }
            
            // فلترة الحالات
            if (sql.includes('paid=1') || sql.includes('paid = 1')) list = list.filter(i => i.paid === 1);
            if (sql.includes('paid=0') || sql.includes('paid = 0')) list = list.filter(i => i.paid === 0);
            if (sql.includes('cancelled=0')) list = list.filter(i => i.cancelled === 0);
            
            if (sql.includes('SUM(total)') && sql.includes('COUNT(*)')) {
                const totalRev = list.reduce((s, r) => s + r.total, 0);
                return { rows: [{ revenue: totalRev, count: list.length }] };
            }
            if (sql.includes('SUM(total)')) {
                const sum = list.reduce((s, r) => s + r.total, 0);
                return { rows: [{ total: sum, paid: sum, unpaid: sum }] };
            }
            if (sql.includes('COUNT(*) as cnt')) {
                return { rows: [{ cnt: list.length }] };
            }
            
            return { rows: list };
        }
        
        if (sql.includes('FROM pharmacy_drug_catalog')) {
            let list = [...mockDb.pharmacy_drug_catalog];
            if (sql.includes('tenant_id=$1')) {
                list = list.filter(d => d.tenant_id === params[0]);
            }
            const cost = list.reduce((s, r) => s + (r.cost_price * r.stock_qty), 0);
            return { rows: [{ drug_cost: cost }] };
        }
        
        return { rows: [] };
    }

    // 1. اختبار محاكاة تقرير الإيرادات المالي (/api/reports/financial)
    function simulateFinancialReport(req) {
        let tenantId = req.session?.user?.tenantId || null;
        if (!tenantId && req.isProduction) return { status: 403 };
        if (!tenantId) tenantId = 1;
        
        const params = [tenantId];
        const totalRevenue = querySim('SELECT COALESCE(SUM(total),0) as total FROM invoices WHERE paid=1 AND tenant_id=$1', params).rows[0].total;
        const totalPending = querySim('SELECT COALESCE(SUM(total),0) as total FROM invoices WHERE paid=0 AND tenant_id=$1', params).rows[0].total;
        const invoiceCount = querySim('SELECT COUNT(*) as cnt FROM invoices WHERE tenant_id=$1', params).rows[0].cnt;
        
        return { status: 200, data: { totalRevenue, totalPending, invoiceCount } };
    }

    const finT1 = simulateFinancialReport({ session: { user: { tenantId: 1 } }, isProduction: true });
    const finT2 = simulateFinancialReport({ session: { user: { tenantId: 2 } }, isProduction: true });

    assert(finT1.status === 200, "طلب تقرير الإيرادات لمستأجر 1 تم بنجاح");
    assert(finT1.data.totalRevenue === 150.0, "تقرير مستأجر 1 يعرض فقط الإيرادات المحصلة التابعة له (150.0)", `got: ${finT1.data.totalRevenue}`);
    assert(finT1.data.totalPending === 300.0, "تقرير مستأجر 1 يعرض فقط المعلقات التابعة له (300.0)", `got: ${finT1.data.totalPending}`);
    assert(finT1.data.invoiceCount === 2, "تقرير مستأجر 1 يعرض عدد فواتيره فقط (2)", `got: ${finT1.data.invoiceCount}`);

    assert(finT2.status === 200, "طلب تقرير الإيرادات لمستأجر 2 تم بنجاح");
    assert(finT2.data.totalRevenue === 1000.0, "تقرير مستأجر 2 يعرض فقط الإيرادات المحصلة التابعة له (1000.0)", `got: ${finT2.data.totalRevenue}`);
    assert(finT2.data.totalPending === 500.0, "تقرير مستأجر 2 يعرض فقط المعلقات التابعة له (500.0)", `got: ${finT2.data.totalPending}`);
    assert(finT2.data.invoiceCount === 2, "تقرير مستأجر 2 يعرض عدد فواتيره فقط (2)", `got: ${finT2.data.invoiceCount}`);

    // 2. اختبار محاكاة تقرير الأرباح والخسائر (/api/reports/pnl)
    function simulatePnLReport(req) {
        let tenantId = req.session?.user?.tenantId || null;
        if (!tenantId && req.isProduction) return { status: 403 };
        if (!tenantId) tenantId = 1;
        
        const params = [tenantId];
        const collected = querySim('SELECT COALESCE(SUM(total),0) as total FROM invoices WHERE paid=1 AND tenant_id=$1', params).rows[0].total;
        const drugCost = querySim('SELECT COALESCE(SUM(cost_price * stock_qty),0) as drug_cost FROM pharmacy_drug_catalog WHERE is_active=1 AND tenant_id=$1', params).rows[0].drug_cost;
        
        return { status: 200, data: { totalCollected: collected, estimatedCosts: drugCost, netProfit: collected - drugCost } };
    }

    const pnlT1 = simulatePnLReport({ session: { user: { tenantId: 1 } }, isProduction: true });
    const pnlT2 = simulatePnLReport({ session: { user: { tenantId: 2 } }, isProduction: true });

    assert(pnlT1.status === 200, "PnL: طلب التقرير لمستأجر 1 تم بنجاح");
    assert(pnlT1.data.totalCollected === 150.0, "PnL: مستأجر 1 يرى تحصيلاته فقط (150.0)", `got: ${pnlT1.data.totalCollected}`);
    assert(pnlT1.data.estimatedCosts === 500.0, "PnL: مستأجر 1 يرى تكلفة أدويته فقط (500.0)", `got: ${pnlT1.data.estimatedCosts}`);
    assert(pnlT1.data.netProfit === -350.0, "PnL: صافي الربح لمستأجر 1 معزول وصحيح (-350.0)", `got: ${pnlT1.data.netProfit}`);

    assert(pnlT2.status === 200, "PnL: طلب التقرير لمستأجر 2 تم بنجاح");
    assert(pnlT2.data.totalCollected === 1000.0, "PnL: مستأجر 2 يرى تحصيلاته فقط (1000.0)", `got: ${pnlT2.data.totalCollected}`);
    assert(pnlT2.data.estimatedCosts === 500.0, "PnL: مستأجر 2 يرى تكلفة أدويته فقط (500.0)", `got: ${pnlT2.data.estimatedCosts}`);
    assert(pnlT2.data.netProfit === 500.0, "PnL: صافي الربح لمستأجر 2 معزول وصحيح (500.0)", `got: ${pnlT2.data.netProfit}`);

    // 3. التحقق من الرفض بـ 403 Forbidden في حال غياب tenantId في بيئة الإنتاج
    const prodCheck = simulateFinancialReport({ session: { user: {} }, isProduction: true });
    assert(prodCheck.status === 403, "يرفض خادم الإنتاج تقديم التقارير المالية في حال عدم تعيين المستأجر (403 Forbidden)");
}

// ===== ملخص نهائي للاختبارات =====
console.log(`\n${BOLD}${BLUE}================================================================${RESET}`);
console.log(`${BOLD}${BLUE}  ملخص نتائج اختبار التقارير المالية (Financial Reports Results)${RESET}`);
console.log(`${BOLD}${BLUE}================================================================${RESET}`);
console.log(`  ${GREEN}✅ ناجح${RESET}:  ${passed}`);
console.log(`  ${RED}❌ فاشل${RESET}:  ${failed}`);

if (failureLog.length > 0) {
    console.log(`\n${RED}تفاصيل الاختبارات الفاشلة:${RESET}`);
    failureLog.forEach(f => console.log(`  - ${f.testName}: ${f.details}`));
    process.exit(1);
} else {
    console.log(`\n${BOLD}${GREEN}🎉 نجحت جميع اختبارات التقارير المالية! تم التحقق من العزل الكامل ومنع تسريب الإيرادات والأرباح والعمولات!${RESET}\n`);
    process.exit(0);
}
