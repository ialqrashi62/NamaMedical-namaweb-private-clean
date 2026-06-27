-- ============================================================
-- e16_02_supply_chain_up.sql
-- E16 — NEW supply-chain tables: batches (lot/expiry/FEFO), movements ledger
--   (transactional issue/receive/adjust/transfer), purchase orders + PO items,
--   goods-receipt notes (GRN) + GRN items, and periodic stock counts.
-- CANDIDATE ONLY — DO NOT EXECUTE ON PRODUCTION WITHOUT EXPLICIT DDL APPROVAL (DB gate).
--
-- جداول جديدة كلياً => tenant_id INTEGER NOT NULL REFERENCES tenants(id) منذ الإنشاء + FORCE RLS
--   بالقالب القانوني + FK للكيان الأب (inventory_items / purchase_orders / goods_receipts).
--   NOT مُضافة إلى bootstrap في db_postgres.js (هجرة مرشّحة فقط).
-- idempotent: CREATE TABLE/INDEX IF NOT EXISTS + DROP/CREATE POLICY IF EXISTS. BEGIN;…COMMIT;
--
-- قيود حرجة على مستوى DB (دفاع في العمق فوق منطق الخادم):
--   - inventory_batches.qty_on_hand >= 0  => يستحيل أن يصبح المخزون سالباً حتى لو أخطأ الكود.
--   - حركة المخزون qty_delta <> 0 ونوعها ضمن قائمة بيضاء.
-- ============================================================
BEGIN;

-- ===== inventory_batches: lot/expiry per item (FEFO source of truth) =====
CREATE TABLE IF NOT EXISTS inventory_batches (
    id              SERIAL PRIMARY KEY,
    item_id         INTEGER NOT NULL REFERENCES inventory_items(id) ON DELETE CASCADE,
    lot_number      TEXT DEFAULT '',
    expiry_date     DATE,
    qty_received    INTEGER NOT NULL DEFAULT 0,
    qty_on_hand     INTEGER NOT NULL DEFAULT 0,
    unit_cost       REAL DEFAULT 0,
    received_at     TIMESTAMP DEFAULT now(),
    status          TEXT NOT NULL DEFAULT 'active',
    tenant_id       INTEGER NOT NULL REFERENCES tenants(id) ON DELETE CASCADE,
    facility_id     INTEGER,
    created_at      TIMESTAMP DEFAULT now(),
    CONSTRAINT chk_inv_batches_qty_on_hand_nonneg CHECK (qty_on_hand >= 0),
    CONSTRAINT chk_inv_batches_status CHECK (status IN ('active','quarantine','expired','depleted'))
);
CREATE INDEX IF NOT EXISTS idx_inv_batches_tenant_id ON inventory_batches (tenant_id);
CREATE INDEX IF NOT EXISTS idx_inv_batches_fefo ON inventory_batches (tenant_id, item_id, expiry_date);
ALTER TABLE inventory_batches ENABLE ROW LEVEL SECURITY;
ALTER TABLE inventory_batches FORCE ROW LEVEL SECURITY;
DROP POLICY IF EXISTS rls_inv_batches_tenant_isolation ON inventory_batches;
CREATE POLICY rls_inv_batches_tenant_isolation ON inventory_batches
    FOR ALL
    USING (tenant_id = NULLIF(current_setting('app.tenant_id', true), '')::integer)
    WITH CHECK (tenant_id = NULLIF(current_setting('app.tenant_id', true), '')::integer);

-- ===== inventory_movements: append-only transactional stock ledger =====
CREATE TABLE IF NOT EXISTS inventory_movements (
    id              SERIAL PRIMARY KEY,
    item_id         INTEGER NOT NULL REFERENCES inventory_items(id) ON DELETE CASCADE,
    batch_id        INTEGER REFERENCES inventory_batches(id) ON DELETE SET NULL,
    movement_type   TEXT NOT NULL,
    qty_delta       INTEGER NOT NULL,
    balance_after   INTEGER,
    ref_table       TEXT DEFAULT '',
    ref_id          INTEGER,
    reason          TEXT DEFAULT '',
    created_by      TEXT DEFAULT '',
    created_at      TIMESTAMP DEFAULT now(),
    tenant_id       INTEGER NOT NULL REFERENCES tenants(id) ON DELETE CASCADE,
    facility_id     INTEGER,
    CONSTRAINT chk_inv_mov_type CHECK (movement_type IN
        ('receive','issue','adjust_in','adjust_out','transfer_in','transfer_out')),
    CONSTRAINT chk_inv_mov_qty_nonzero CHECK (qty_delta <> 0)
);
CREATE INDEX IF NOT EXISTS idx_inv_mov_tenant_id ON inventory_movements (tenant_id);
CREATE INDEX IF NOT EXISTS idx_inv_mov_item ON inventory_movements (tenant_id, item_id, created_at);
ALTER TABLE inventory_movements ENABLE ROW LEVEL SECURITY;
ALTER TABLE inventory_movements FORCE ROW LEVEL SECURITY;
DROP POLICY IF EXISTS rls_inv_mov_tenant_isolation ON inventory_movements;
CREATE POLICY rls_inv_mov_tenant_isolation ON inventory_movements
    FOR ALL
    USING (tenant_id = NULLIF(current_setting('app.tenant_id', true), '')::integer)
    WITH CHECK (tenant_id = NULLIF(current_setting('app.tenant_id', true), '')::integer);

-- ===== purchase_orders: draft -> approved -> partially_received -> received | cancelled =====
CREATE TABLE IF NOT EXISTS purchase_orders (
    id              SERIAL PRIMARY KEY,
    po_number       TEXT DEFAULT '',
    supplier_id     INTEGER,
    supplier_name   TEXT DEFAULT '',
    status          TEXT NOT NULL DEFAULT 'draft',
    total_amount    REAL DEFAULT 0,
    notes           TEXT DEFAULT '',
    created_by      TEXT DEFAULT '',
    approved_by     TEXT DEFAULT '',
    approved_at     TIMESTAMP,
    created_at      TIMESTAMP DEFAULT now(),
    tenant_id       INTEGER NOT NULL REFERENCES tenants(id) ON DELETE CASCADE,
    facility_id     INTEGER,
    CONSTRAINT chk_po_status CHECK (status IN
        ('draft','approved','partially_received','received','cancelled'))
);
CREATE INDEX IF NOT EXISTS idx_po_tenant_id ON purchase_orders (tenant_id);
ALTER TABLE purchase_orders ENABLE ROW LEVEL SECURITY;
ALTER TABLE purchase_orders FORCE ROW LEVEL SECURITY;
DROP POLICY IF EXISTS rls_po_tenant_isolation ON purchase_orders;
CREATE POLICY rls_po_tenant_isolation ON purchase_orders
    FOR ALL
    USING (tenant_id = NULLIF(current_setting('app.tenant_id', true), '')::integer)
    WITH CHECK (tenant_id = NULLIF(current_setting('app.tenant_id', true), '')::integer);

-- ===== purchase_order_items =====
CREATE TABLE IF NOT EXISTS purchase_order_items (
    id              SERIAL PRIMARY KEY,
    po_id           INTEGER NOT NULL REFERENCES purchase_orders(id) ON DELETE CASCADE,
    item_id         INTEGER NOT NULL REFERENCES inventory_items(id) ON DELETE CASCADE,
    qty_ordered     INTEGER NOT NULL DEFAULT 0,
    qty_received    INTEGER NOT NULL DEFAULT 0,
    unit_cost       REAL DEFAULT 0,
    tenant_id       INTEGER NOT NULL REFERENCES tenants(id) ON DELETE CASCADE,
    facility_id     INTEGER,
    CONSTRAINT chk_po_items_qty_ordered_pos CHECK (qty_ordered > 0),
    CONSTRAINT chk_po_items_qty_received_nonneg CHECK (qty_received >= 0)
);
CREATE INDEX IF NOT EXISTS idx_po_items_tenant_id ON purchase_order_items (tenant_id);
CREATE INDEX IF NOT EXISTS idx_po_items_po ON purchase_order_items (tenant_id, po_id);
ALTER TABLE purchase_order_items ENABLE ROW LEVEL SECURITY;
ALTER TABLE purchase_order_items FORCE ROW LEVEL SECURITY;
DROP POLICY IF EXISTS rls_po_items_tenant_isolation ON purchase_order_items;
CREATE POLICY rls_po_items_tenant_isolation ON purchase_order_items
    FOR ALL
    USING (tenant_id = NULLIF(current_setting('app.tenant_id', true), '')::integer)
    WITH CHECK (tenant_id = NULLIF(current_setting('app.tenant_id', true), '')::integer);

-- ===== goods_receipts (GRN header): one receipt event against a PO =====
CREATE TABLE IF NOT EXISTS goods_receipts (
    id              SERIAL PRIMARY KEY,
    grn_number      TEXT DEFAULT '',
    po_id           INTEGER NOT NULL REFERENCES purchase_orders(id) ON DELETE CASCADE,
    received_by     TEXT DEFAULT '',
    received_at     TIMESTAMP DEFAULT now(),
    notes           TEXT DEFAULT '',
    tenant_id       INTEGER NOT NULL REFERENCES tenants(id) ON DELETE CASCADE,
    facility_id     INTEGER
);
CREATE INDEX IF NOT EXISTS idx_grn_tenant_id ON goods_receipts (tenant_id);
CREATE INDEX IF NOT EXISTS idx_grn_po ON goods_receipts (tenant_id, po_id);
ALTER TABLE goods_receipts ENABLE ROW LEVEL SECURITY;
ALTER TABLE goods_receipts FORCE ROW LEVEL SECURITY;
DROP POLICY IF EXISTS rls_grn_tenant_isolation ON goods_receipts;
CREATE POLICY rls_grn_tenant_isolation ON goods_receipts
    FOR ALL
    USING (tenant_id = NULLIF(current_setting('app.tenant_id', true), '')::integer)
    WITH CHECK (tenant_id = NULLIF(current_setting('app.tenant_id', true), '')::integer);

-- ===== goods_receipt_items: per-line received qty (creates a batch + movement) =====
CREATE TABLE IF NOT EXISTS goods_receipt_items (
    id              SERIAL PRIMARY KEY,
    grn_id          INTEGER NOT NULL REFERENCES goods_receipts(id) ON DELETE CASCADE,
    po_item_id      INTEGER REFERENCES purchase_order_items(id) ON DELETE SET NULL,
    item_id         INTEGER NOT NULL REFERENCES inventory_items(id) ON DELETE CASCADE,
    batch_id        INTEGER REFERENCES inventory_batches(id) ON DELETE SET NULL,
    qty_received    INTEGER NOT NULL DEFAULT 0,
    lot_number      TEXT DEFAULT '',
    expiry_date     DATE,
    unit_cost       REAL DEFAULT 0,
    tenant_id       INTEGER NOT NULL REFERENCES tenants(id) ON DELETE CASCADE,
    facility_id     INTEGER,
    CONSTRAINT chk_grn_items_qty_pos CHECK (qty_received > 0)
);
CREATE INDEX IF NOT EXISTS idx_grn_items_tenant_id ON goods_receipt_items (tenant_id);
CREATE INDEX IF NOT EXISTS idx_grn_items_grn ON goods_receipt_items (tenant_id, grn_id);
ALTER TABLE goods_receipt_items ENABLE ROW LEVEL SECURITY;
ALTER TABLE goods_receipt_items FORCE ROW LEVEL SECURITY;
DROP POLICY IF EXISTS rls_grn_items_tenant_isolation ON goods_receipt_items;
CREATE POLICY rls_grn_items_tenant_isolation ON goods_receipt_items
    FOR ALL
    USING (tenant_id = NULLIF(current_setting('app.tenant_id', true), '')::integer)
    WITH CHECK (tenant_id = NULLIF(current_setting('app.tenant_id', true), '')::integer);

-- ===== inventory_stock_counts: periodic count / reconciliation =====
CREATE TABLE IF NOT EXISTS inventory_stock_counts (
    id              SERIAL PRIMARY KEY,
    item_id         INTEGER NOT NULL REFERENCES inventory_items(id) ON DELETE CASCADE,
    batch_id        INTEGER REFERENCES inventory_batches(id) ON DELETE SET NULL,
    system_qty      INTEGER NOT NULL DEFAULT 0,
    counted_qty     INTEGER NOT NULL DEFAULT 0,
    difference      INTEGER NOT NULL DEFAULT 0,
    reconciled      INTEGER NOT NULL DEFAULT 0,
    counted_by      TEXT DEFAULT '',
    count_date      TIMESTAMP DEFAULT now(),
    notes           TEXT DEFAULT '',
    tenant_id       INTEGER NOT NULL REFERENCES tenants(id) ON DELETE CASCADE,
    facility_id     INTEGER
);
CREATE INDEX IF NOT EXISTS idx_stock_counts_tenant_id ON inventory_stock_counts (tenant_id);
ALTER TABLE inventory_stock_counts ENABLE ROW LEVEL SECURITY;
ALTER TABLE inventory_stock_counts FORCE ROW LEVEL SECURITY;
DROP POLICY IF EXISTS rls_stock_counts_tenant_isolation ON inventory_stock_counts;
CREATE POLICY rls_stock_counts_tenant_isolation ON inventory_stock_counts
    FOR ALL
    USING (tenant_id = NULLIF(current_setting('app.tenant_id', true), '')::integer)
    WITH CHECK (tenant_id = NULLIF(current_setting('app.tenant_id', true), '')::integer);

COMMIT;
