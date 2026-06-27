-- ============================================================
-- e16_01_inventory_cssd_rls_up.sql
-- E16 INVENTORY / SUPPLY CHAIN + CSSD — FORCE RLS + tenant_id on the four EXISTING
--   inventory/CSSD tables, plus the CSSD biological-indicator (BI) gate columns.
-- CANDIDATE ONLY — DO NOT EXECUTE ON PRODUCTION WITHOUT EXPLICIT DDL APPROVAL (DB gate).
--
-- الهدف: سدّ ثغرة العزل — هذه الجداول الأربعة (inventory_items, cssd_instrument_sets,
--   cssd_sterilization_cycles, cssd_load_items) قائمة سابقاً لكن بلا tenant_id ولا FORCE RLS.
--   نضيف tenant_id NOT NULL REFERENCES tenants(id) + facility_id + القالب القانوني للعزل،
--   ونضيف أعمدة بوّابة المؤشّر الحيوي (BI) إلى دورات التعقيم حتى يفرضها الخادم fail-CLOSED.
--
-- جداول قائمة سابقاً => ADD COLUMN IF NOT EXISTS + backfill dev (tenant_id=1) + SET NOT NULL
--   + DROP/ADD CONSTRAINT IF EXISTS + DROP POLICY IF EXISTS + CREATE INDEX IF NOT EXISTS. idempotent.
--   down يعكس الإضافات فقط (لا يُسقط هذه الجداول القائمة).
--   تحذير: UPDATE ... SET tenant_id=1 WHERE tenant_id IS NULL نمط dev — راجعه على بيانات حيّة متعددة المستأجرين.
-- ============================================================
BEGIN;

-- ===== inventory_items (canonical item master for batches/movements) =====
ALTER TABLE inventory_items ADD COLUMN IF NOT EXISTS tenant_id INTEGER;
ALTER TABLE inventory_items ADD COLUMN IF NOT EXISTS facility_id INTEGER;
ALTER TABLE inventory_items ADD COLUMN IF NOT EXISTS reorder_point INTEGER DEFAULT 0;
ALTER TABLE inventory_items ADD COLUMN IF NOT EXISTS created_at TIMESTAMP DEFAULT now();
ALTER TABLE inventory_items ADD COLUMN IF NOT EXISTS updated_at TIMESTAMP DEFAULT now();
UPDATE inventory_items SET tenant_id = 1 WHERE tenant_id IS NULL;
ALTER TABLE inventory_items ALTER COLUMN tenant_id SET NOT NULL;
ALTER TABLE inventory_items DROP CONSTRAINT IF EXISTS fk_inventory_items_tenant;
ALTER TABLE inventory_items ADD CONSTRAINT fk_inventory_items_tenant
    FOREIGN KEY (tenant_id) REFERENCES tenants(id) ON DELETE CASCADE;
CREATE INDEX IF NOT EXISTS idx_inventory_items_tenant_id ON inventory_items (tenant_id);
ALTER TABLE inventory_items ENABLE ROW LEVEL SECURITY;
ALTER TABLE inventory_items FORCE ROW LEVEL SECURITY;
DROP POLICY IF EXISTS rls_inventory_items_tenant_isolation ON inventory_items;
CREATE POLICY rls_inventory_items_tenant_isolation ON inventory_items
    FOR ALL
    USING (tenant_id = NULLIF(current_setting('app.tenant_id', true), '')::integer)
    WITH CHECK (tenant_id = NULLIF(current_setting('app.tenant_id', true), '')::integer);

-- ===== cssd_instrument_sets =====
ALTER TABLE cssd_instrument_sets ADD COLUMN IF NOT EXISTS tenant_id INTEGER;
ALTER TABLE cssd_instrument_sets ADD COLUMN IF NOT EXISTS facility_id INTEGER;
ALTER TABLE cssd_instrument_sets ADD COLUMN IF NOT EXISTS created_at TIMESTAMP DEFAULT now();
UPDATE cssd_instrument_sets SET tenant_id = 1 WHERE tenant_id IS NULL;
ALTER TABLE cssd_instrument_sets ALTER COLUMN tenant_id SET NOT NULL;
ALTER TABLE cssd_instrument_sets DROP CONSTRAINT IF EXISTS fk_cssd_instrument_sets_tenant;
ALTER TABLE cssd_instrument_sets ADD CONSTRAINT fk_cssd_instrument_sets_tenant
    FOREIGN KEY (tenant_id) REFERENCES tenants(id) ON DELETE CASCADE;
CREATE INDEX IF NOT EXISTS idx_cssd_instrument_sets_tenant_id ON cssd_instrument_sets (tenant_id);
ALTER TABLE cssd_instrument_sets ENABLE ROW LEVEL SECURITY;
ALTER TABLE cssd_instrument_sets FORCE ROW LEVEL SECURITY;
DROP POLICY IF EXISTS rls_cssd_instrument_sets_tenant_isolation ON cssd_instrument_sets;
CREATE POLICY rls_cssd_instrument_sets_tenant_isolation ON cssd_instrument_sets
    FOR ALL
    USING (tenant_id = NULLIF(current_setting('app.tenant_id', true), '')::integer)
    WITH CHECK (tenant_id = NULLIF(current_setting('app.tenant_id', true), '')::integer);

-- ===== cssd_sterilization_cycles (+ BI gate columns) =====
ALTER TABLE cssd_sterilization_cycles ADD COLUMN IF NOT EXISTS tenant_id INTEGER;
ALTER TABLE cssd_sterilization_cycles ADD COLUMN IF NOT EXISTS facility_id INTEGER;
ALTER TABLE cssd_sterilization_cycles ADD COLUMN IF NOT EXISTS bi_indicator_lot TEXT DEFAULT '';
ALTER TABLE cssd_sterilization_cycles ADD COLUMN IF NOT EXISTS bi_result_recorded_at TIMESTAMP;
ALTER TABLE cssd_sterilization_cycles ADD COLUMN IF NOT EXISTS bi_result_by TEXT DEFAULT '';
ALTER TABLE cssd_sterilization_cycles ADD COLUMN IF NOT EXISTS released_for_issue INTEGER DEFAULT 0;
UPDATE cssd_sterilization_cycles SET tenant_id = 1 WHERE tenant_id IS NULL;
ALTER TABLE cssd_sterilization_cycles ALTER COLUMN tenant_id SET NOT NULL;
ALTER TABLE cssd_sterilization_cycles DROP CONSTRAINT IF EXISTS fk_cssd_cycles_tenant;
ALTER TABLE cssd_sterilization_cycles ADD CONSTRAINT fk_cssd_cycles_tenant
    FOREIGN KEY (tenant_id) REFERENCES tenants(id) ON DELETE CASCADE;
CREATE INDEX IF NOT EXISTS idx_cssd_cycles_tenant_id ON cssd_sterilization_cycles (tenant_id);
ALTER TABLE cssd_sterilization_cycles ENABLE ROW LEVEL SECURITY;
ALTER TABLE cssd_sterilization_cycles FORCE ROW LEVEL SECURITY;
DROP POLICY IF EXISTS rls_cssd_cycles_tenant_isolation ON cssd_sterilization_cycles;
CREATE POLICY rls_cssd_cycles_tenant_isolation ON cssd_sterilization_cycles
    FOR ALL
    USING (tenant_id = NULLIF(current_setting('app.tenant_id', true), '')::integer)
    WITH CHECK (tenant_id = NULLIF(current_setting('app.tenant_id', true), '')::integer);

-- ===== cssd_load_items =====
ALTER TABLE cssd_load_items ADD COLUMN IF NOT EXISTS tenant_id INTEGER;
ALTER TABLE cssd_load_items ADD COLUMN IF NOT EXISTS facility_id INTEGER;
ALTER TABLE cssd_load_items ADD COLUMN IF NOT EXISTS quantity INTEGER DEFAULT 1;
UPDATE cssd_load_items SET tenant_id = 1 WHERE tenant_id IS NULL;
ALTER TABLE cssd_load_items ALTER COLUMN tenant_id SET NOT NULL;
ALTER TABLE cssd_load_items DROP CONSTRAINT IF EXISTS fk_cssd_load_items_tenant;
ALTER TABLE cssd_load_items ADD CONSTRAINT fk_cssd_load_items_tenant
    FOREIGN KEY (tenant_id) REFERENCES tenants(id) ON DELETE CASCADE;
CREATE INDEX IF NOT EXISTS idx_cssd_load_items_tenant_id ON cssd_load_items (tenant_id);
ALTER TABLE cssd_load_items ENABLE ROW LEVEL SECURITY;
ALTER TABLE cssd_load_items FORCE ROW LEVEL SECURITY;
DROP POLICY IF EXISTS rls_cssd_load_items_tenant_isolation ON cssd_load_items;
CREATE POLICY rls_cssd_load_items_tenant_isolation ON cssd_load_items
    FOR ALL
    USING (tenant_id = NULLIF(current_setting('app.tenant_id', true), '')::integer)
    WITH CHECK (tenant_id = NULLIF(current_setting('app.tenant_id', true), '')::integer);

COMMIT;
