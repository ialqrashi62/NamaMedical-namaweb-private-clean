-- ============================================================
-- ex_01_orders_up.sql
-- E-X1 UNIFIED ORDERS — foundational migration (1 of group EX).
-- CANDIDATE ONLY — DO NOT EXECUTE ON PRODUCTION WITHOUT EXPLICIT DDL APPROVAL (DB gate).
--
-- الهدف: إنشاء طبقة أوامر موحّدة (orders/order_items/order_sets) تعمم نمط الكتابة المزدوجة
--   الموجود حالياً (lab_radiology_orders / prescriptions + pharmacy_prescriptions_queue).
--   type ∈ (lab, rad, med, consult). encounter_id قابل للـ NULL لأنه لا يوجد جدول encounters بعد
--   (الأقرب visit_lifecycle)؛ ربط الأوامر اليوم على patient_id مثل بقية النظام.
--   كل جدول: tenant_id NOT NULL REFERENCES tenants(id) + ENABLE+FORCE RLS + سياسة عزل tenant_id
--   (نفس قالب الـ 150 سياسة) + فهرس tenant_id.
--
-- idempotent: CREATE TABLE IF NOT EXISTS + DROP POLICY IF EXISTS + CREATE INDEX IF NOT EXISTS.
-- ============================================================
BEGIN;

-- ---------- order_sets (reusable order templates; created BEFORE orders for FK target) ----------
CREATE TABLE IF NOT EXISTS order_sets (
    id SERIAL PRIMARY KEY,
    tenant_id INTEGER NOT NULL REFERENCES tenants(id) ON DELETE CASCADE,
    name TEXT NOT NULL,
    items_json TEXT NOT NULL DEFAULT '[]',
    created_at TIMESTAMP DEFAULT CURRENT_TIMESTAMP
);

CREATE INDEX IF NOT EXISTS idx_order_sets_tenant_id ON order_sets (tenant_id);

ALTER TABLE order_sets ENABLE ROW LEVEL SECURITY;
ALTER TABLE order_sets FORCE ROW LEVEL SECURITY;
DROP POLICY IF EXISTS rls_order_sets_tenant_isolation ON order_sets;
CREATE POLICY rls_order_sets_tenant_isolation ON order_sets
    FOR ALL
    USING (tenant_id = NULLIF(current_setting('app.tenant_id', true), '')::integer)
    WITH CHECK (tenant_id = NULLIF(current_setting('app.tenant_id', true), '')::integer);

-- ---------- orders (unified order header) ----------
CREATE TABLE IF NOT EXISTS orders (
    id SERIAL PRIMARY KEY,
    tenant_id INTEGER NOT NULL REFERENCES tenants(id) ON DELETE CASCADE,
    facility_id INTEGER,
    encounter_id INTEGER,                                  -- nullable: no encounters table yet (E1/E2)
    patient_id INTEGER NOT NULL,
    type TEXT NOT NULL,
    status TEXT NOT NULL DEFAULT 'pending',
    ordered_by INTEGER,
    order_set_id INTEGER REFERENCES order_sets(id) ON DELETE SET NULL,
    created_at TIMESTAMP DEFAULT CURRENT_TIMESTAMP,
    CONSTRAINT chk_orders_type CHECK (type IN ('lab', 'rad', 'med', 'consult')),
    CONSTRAINT chk_orders_status CHECK (status IN ('pending', 'active', 'completed', 'cancelled'))
);

-- idempotent: ensure the status CHECK exists even when the table pre-dates this migration
-- (CREATE TABLE IF NOT EXISTS skips the inline constraint on an existing table). DROP then ADD.
ALTER TABLE orders DROP CONSTRAINT IF EXISTS chk_orders_status;
ALTER TABLE orders ADD CONSTRAINT chk_orders_status CHECK (status IN ('pending', 'active', 'completed', 'cancelled'));

CREATE INDEX IF NOT EXISTS idx_orders_tenant_id ON orders (tenant_id);
CREATE INDEX IF NOT EXISTS idx_orders_patient_id ON orders (patient_id);
CREATE INDEX IF NOT EXISTS idx_orders_encounter_id ON orders (encounter_id);

ALTER TABLE orders ENABLE ROW LEVEL SECURITY;
ALTER TABLE orders FORCE ROW LEVEL SECURITY;
DROP POLICY IF EXISTS rls_orders_tenant_isolation ON orders;
CREATE POLICY rls_orders_tenant_isolation ON orders
    FOR ALL
    USING (tenant_id = NULLIF(current_setting('app.tenant_id', true), '')::integer)
    WITH CHECK (tenant_id = NULLIF(current_setting('app.tenant_id', true), '')::integer);

-- ---------- order_items (line items of an order) ----------
CREATE TABLE IF NOT EXISTS order_items (
    id SERIAL PRIMARY KEY,
    tenant_id INTEGER NOT NULL REFERENCES tenants(id) ON DELETE CASCADE,
    order_id INTEGER NOT NULL REFERENCES orders(id) ON DELETE CASCADE,
    catalog_ref TEXT,
    qty INTEGER NOT NULL DEFAULT 1,
    instructions TEXT,
    created_at TIMESTAMP DEFAULT CURRENT_TIMESTAMP
);

CREATE INDEX IF NOT EXISTS idx_order_items_tenant_id ON order_items (tenant_id);
CREATE INDEX IF NOT EXISTS idx_order_items_order_id ON order_items (order_id);

ALTER TABLE order_items ENABLE ROW LEVEL SECURITY;
ALTER TABLE order_items FORCE ROW LEVEL SECURITY;
DROP POLICY IF EXISTS rls_order_items_tenant_isolation ON order_items;
CREATE POLICY rls_order_items_tenant_isolation ON order_items
    FOR ALL
    USING (tenant_id = NULLIF(current_setting('app.tenant_id', true), '')::integer)
    WITH CHECK (tenant_id = NULLIF(current_setting('app.tenant_id', true), '')::integer);

COMMIT;
