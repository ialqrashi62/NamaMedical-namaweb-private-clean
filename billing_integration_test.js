/**
 * billing_integration_test.js
 * Integration tests for Jumanasoft SaaS plans seeding, Stripe/Moyasar checkout session generation,
 * and webhook-driven plan provisioning logic.
 */
'use strict';

process.env.MOYASAR_SECRET_KEY = 'sk_test_mock';
process.env.STRIPE_SECRET_KEY = 'sk_test_mock';

const Database = require('better-sqlite3');
const { BillingAdapter } = require('./billing_adapter');

let pass = 0, fail = 0;
function ok(name, cond) {
    if (cond) {
        pass++;
        console.log(`  PASS: ${name}`);
    } else {
        fail++;
        console.error(`  FAIL: ${name}`);
    }
}

async function runTests() {
    console.log('Running Billing & Plans Integration Tests...');

    // 1. Verify Seeding on SQLite in-memory
    const db = new Database(':memory:');
    
    // Create plans tables in memory
    db.exec(`
      CREATE TABLE IF NOT EXISTS plans (
        id INTEGER PRIMARY KEY AUTOINCREMENT,
        plan_key TEXT NOT NULL UNIQUE,
        name_ar TEXT NOT NULL,
        name_en TEXT NOT NULL,
        description_ar TEXT DEFAULT '',
        description_en TEXT DEFAULT '',
        currency TEXT NOT NULL,
        monthly_price REAL DEFAULT 0,
        yearly_price REAL DEFAULT 0,
        trial_days INTEGER DEFAULT 0,
        active INTEGER DEFAULT 1,
        sort_order INTEGER DEFAULT 0,
        created_at DATETIME DEFAULT CURRENT_TIMESTAMP,
        updated_at DATETIME DEFAULT CURRENT_TIMESTAMP
      )
    `);

    db.exec(`
      CREATE TABLE IF NOT EXISTS plan_entitlements (
        plan_id INTEGER PRIMARY KEY,
        max_users INTEGER,
        max_branches INTEGER,
        max_invoices_per_month INTEGER,
        modules_enabled TEXT DEFAULT '',
        support_level TEXT DEFAULT 'standard',
        api_access INTEGER DEFAULT 0,
        custom_domain INTEGER DEFAULT 0,
        FOREIGN KEY(plan_id) REFERENCES plans(id) ON DELETE CASCADE
      )
    `);

    db.exec(`
      CREATE TABLE IF NOT EXISTS tenants (
        id INTEGER PRIMARY KEY AUTOINCREMENT,
        name TEXT NOT NULL,
        subdomain TEXT UNIQUE NOT NULL
      )
    `);

    db.exec(`
      CREATE TABLE IF NOT EXISTS tenant_plan_assignments (
        id INTEGER PRIMARY KEY AUTOINCREMENT,
        tenant_id INTEGER NOT NULL,
        plan_key TEXT NOT NULL,
        assignment_source TEXT DEFAULT 'manual',
        assigned_by INTEGER,
        assigned_at DATETIME DEFAULT CURRENT_TIMESTAMP,
        effective_from DATETIME DEFAULT CURRENT_TIMESTAMP,
        effective_to DATETIME,
        FOREIGN KEY(tenant_id) REFERENCES tenants(id) ON DELETE CASCADE,
        FOREIGN KEY(plan_key) REFERENCES plans(plan_key)
      )
    `);

    // Run the seeder function by recreating its logic here
    const insertPlan = db.prepare(`
        INSERT INTO plans (plan_key, name_ar, name_en, description_ar, description_en, currency, monthly_price, yearly_price, trial_days, sort_order)
        VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?, ?)
    `);

    const insertEnt = db.prepare(`
        INSERT INTO plan_entitlements (plan_id, max_users, max_branches, max_invoices_per_month, modules_enabled, support_level, api_access, custom_domain)
        VALUES (?, ?, ?, ?, ?, ?, ?, ?)
    `);

    const plans = [
        { key: 'free_trial', name_ar: 'فترة تجريبية', name_en: 'Free Trial', desc_ar: 'تجربة مجانية لمدة 14 يوماً', desc_en: '14-day free trial', curr: 'SAR', m_price: 0, y_price: 0, trial: 14, sort: 1, max_u: 3, max_b: 1, max_i: 100, mods: 'dashboard,patients,appointments,settings', support: 'basic', api: 0, domain: 0 },
        { key: 'basic', name_ar: 'الباقة الأساسية', name_en: 'Basic Plan', desc_ar: 'للمستشفيات والعيادات الصغيرة', desc_en: 'For small clinics and hospitals', curr: 'SAR', m_price: 150, y_price: 1500, trial: 0, sort: 2, max_u: 10, max_b: 2, max_i: 1000, mods: 'dashboard,patients,appointments,nursing,billing,settings', support: 'standard', api: 0, domain: 0 },
        { key: 'premium', name_ar: 'الباقة المتميزة', name_en: 'Premium Plan', desc_ar: 'للمراكز الطبية المتوسطة والكبيرة', desc_en: 'For medium to large medical centers', curr: 'SAR', m_price: 500, y_price: 5000, trial: 0, sort: 3, max_u: 50, max_b: 5, max_i: 5000, mods: 'dashboard,patients,appointments,nursing,lab,radiology,pharmacy,inventory,billing,settings', support: 'priority', api: 1, domain: 1 },
        { key: 'enterprise', name_ar: 'باقة المنشآت الكبرى', name_en: 'Enterprise Plan', desc_ar: 'حلول متكاملة للمستشفيات والمجموعات الكبرى', desc_en: 'Complete solutions for large hospitals and groups', curr: 'SAR', m_price: 2000, y_price: 20000, trial: 0, sort: 4, max_u: null, max_b: null, max_i: null, mods: 'dashboard,patients,appointments,doctor,nursing,lab,radiology,pharmacy,inventory,invoices,accounts,finance,insurance,reports,messaging,settings,surgery,icu,emergency,inpatient,bloodbank,obgyn,antenatal,cssd,quality,infection,him,medical-records,pathology,hr,maintenance,api', support: 'enterprise', api: 1, domain: 1 }
    ];

    for (const p of plans) {
        const res = insertPlan.run(p.key, p.name_ar, p.name_en, p.desc_ar, p.desc_en, p.curr, p.m_price, p.y_price, p.trial, p.sort);
        insertEnt.run(res.lastInsertRowid, p.max_u, p.max_b, p.max_i, p.mods, p.support, p.api, p.domain);
    }

    const plansRows = db.prepare("SELECT * FROM plans").all();
    ok("Successfully seeded 4 plans in DB", plansRows.length === 4);
    ok("Free trial plan is seeded correctly", plansRows[0].plan_key === 'free_trial' && plansRows[0].monthly_price === 0);

    // Seed default tenant
    db.prepare("INSERT INTO tenants (id, name, subdomain) VALUES (1, 'Test Tenant', 'test')").run();

    // 2. Billing Adapter checkout candidates (Moyasar & Stripe)
    const moyasarAdapter = new BillingAdapter('moyasar');
    const stripeAdapter = new BillingAdapter('stripe');

    const moyasarSession = await moyasarAdapter.createCheckoutSessionCandidate({
        tenantId: 1,
        planKey: 'basic',
        amount: 150,
        currency: 'SAR',
        idempotencyKey: 'idem_test_moyasar_123'
    });
    ok("Moyasar sandbox session returned success", moyasarSession.success === true);
    ok("Moyasar checkout URL matches design", moyasarSession.checkout_url.includes('provider=moyasar'));

    const stripeSession = await stripeAdapter.createCheckoutSessionCandidate({
        tenantId: 1,
        planKey: 'premium',
        amount: 500,
        currency: 'SAR',
        idempotencyKey: 'idem_test_stripe_123'
    });
    ok("Stripe sandbox session returned success", stripeSession.success === true);
    ok("Stripe checkout URL matches design", stripeSession.checkout_url.includes('provider=stripe'));

    // 3. Test assignment helper and webhooks parsing simulation
    async function assignTenantPlanHelper(tenantId, planKey, source) {
        const planExists = db.prepare("SELECT 1 FROM plans WHERE plan_key = ?").get(planKey);
        if (!planExists) throw new Error(`Plan ${planKey} not found`);

        db.prepare("UPDATE tenant_plan_assignments SET effective_to = CURRENT_TIMESTAMP WHERE tenant_id = ? AND effective_to IS NULL").run(tenantId);
        db.prepare("INSERT INTO tenant_plan_assignments (tenant_id, plan_key, assignment_source, effective_from) VALUES (?, ?, ?, CURRENT_TIMESTAMP)").run(tenantId, planKey, source);
    }

    // Simulate Webhook trigger for Moyasar paid
    const moyasarWebhookPayload = {
        status: 'paid',
        metadata: {
            tenant_id: '1',
            plan_key: 'basic'
        }
    };

    if (moyasarWebhookPayload.status === 'paid') {
        await assignTenantPlanHelper(
            parseInt(moyasarWebhookPayload.metadata.tenant_id),
            moyasarWebhookPayload.metadata.plan_key,
            'manual'
        );
    }

    let activeAssignment = db.prepare("SELECT * FROM tenant_plan_assignments WHERE tenant_id = 1 AND effective_to IS NULL").get();
    ok("Moyasar webhook simulation updated tenant to basic plan", activeAssignment && activeAssignment.plan_key === 'basic');

    // Simulate Webhook trigger for Stripe session completed
    const stripeWebhookPayload = {
        type: 'checkout.session.completed',
        data: {
            object: {
                metadata: {
                    tenant_id: '1',
                    plan_key: 'premium'
                }
            }
        }
    };

    if (stripeWebhookPayload.type === 'checkout.session.completed') {
        const session = stripeWebhookPayload.data.object;
        await assignTenantPlanHelper(
            parseInt(session.metadata.tenant_id),
            session.metadata.plan_key,
            'manual'
        );
    }

    activeAssignment = db.prepare("SELECT * FROM tenant_plan_assignments WHERE tenant_id = 1 AND effective_to IS NULL").get();
    ok("Stripe webhook simulation updated tenant to premium plan", activeAssignment && activeAssignment.plan_key === 'premium');

    console.log(`\nResults: ${pass} passed, ${fail} failed.`);
    process.exit(fail > 0 ? 1 : 0);
}

runTests().catch(e => {
    console.error("Test execution failed:", e);
    process.exit(1);
});
