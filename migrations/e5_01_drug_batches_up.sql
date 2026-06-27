-- ============================================================
-- e5_01_drug_batches_up.sql
-- E5 PHARMACY — Per-lot drug batches for FEFO (First-Expired-First-Out) dispensing.
-- CANDIDATE ONLY — DO NOT EXECUTE ON PRODUCTION WITHOUT EXPLICIT DDL APPROVAL (DB gate).
--
-- الهدف: ترقية مخزون الصيدلية من رصيد مسطح (pharmacy_drug_catalog.stock_qty + expiry_date نصي واحد)
--   إلى دفعات/تشغيلات لكل دواء (drug_batches) بتاريخ صلاحية DATE حقيقي لكل دفعة، حتى يصرف النظام
--   من أقرب دفعة غير منتهية الصلاحية أولاً (FEFO) ولا يصرف أبداً من دفعة منتهية.
--   نفس قالب الـ FORCE RLS: tenant_id NOT NULL REFERENCES tenants(id) + ENABLE+FORCE RLS
--   + سياسة عزل tenant_id + فهرس tenant_id + فهرس (drug_id, expiry_date) لاختيار FEFO.
--
-- idempotent: CREATE TABLE IF NOT EXISTS + DROP POLICY IF EXISTS + CREATE INDEX IF NOT EXISTS
--   + DROP/ADD CONSTRAINT IF EXISTS للقيود (تحترم الجداول السابقة).
-- ============================================================
BEGIN;

CREATE TABLE IF NOT EXISTS drug_batches (
    id SERIAL PRIMARY KEY,
    tenant_id INTEGER NOT NULL REFERENCES tenants(id) ON DELETE CASCADE,
    branch_id INTEGER,
    drug_id INTEGER NOT NULL,                              -- -> pharmacy_drug_catalog.id (no hard FK: catalog managed out-of-band)
    drug_name TEXT,                                        -- denormalized for logs/audit when catalog row absent
    lot TEXT,                                              -- batch / lot number (supplier)
    expiry_date DATE NOT NULL,                             -- real DATE per lot (FEFO key); never dispense when < CURRENT_DATE
    qty_received INTEGER NOT NULL DEFAULT 0,
    qty_on_hand INTEGER NOT NULL DEFAULT 0,                -- decremented FEFO on dispense; never below 0
    cost_price NUMERIC(12,2) DEFAULT 0,
    supplier_id INTEGER,
    received_at TIMESTAMP DEFAULT CURRENT_TIMESTAMP,
    created_at TIMESTAMP DEFAULT CURRENT_TIMESTAMP,
    CONSTRAINT chk_drug_batches_qty CHECK (qty_on_hand >= 0 AND qty_received >= 0)
);

-- idempotent: ensure the qty CHECK exists even when the table pre-dates this migration
ALTER TABLE drug_batches DROP CONSTRAINT IF EXISTS chk_drug_batches_qty;
ALTER TABLE drug_batches ADD CONSTRAINT chk_drug_batches_qty CHECK (qty_on_hand >= 0 AND qty_received >= 0);

CREATE INDEX IF NOT EXISTS idx_drug_batches_tenant_id ON drug_batches (tenant_id);
-- FEFO selection index: per tenant + drug, ordered by earliest expiry first.
CREATE INDEX IF NOT EXISTS idx_drug_batches_fefo ON drug_batches (tenant_id, drug_id, expiry_date);

ALTER TABLE drug_batches ENABLE ROW LEVEL SECURITY;
ALTER TABLE drug_batches FORCE ROW LEVEL SECURITY;
DROP POLICY IF EXISTS rls_drug_batches_tenant_isolation ON drug_batches;
CREATE POLICY rls_drug_batches_tenant_isolation ON drug_batches
    FOR ALL
    USING (tenant_id = NULLIF(current_setting('app.tenant_id', true), '')::integer)
    WITH CHECK (tenant_id = NULLIF(current_setting('app.tenant_id', true), '')::integer);

COMMIT;
