-- e16_01_inventory_cssd_rls_down.sql  (rollback of e16_01 up)
-- CANDIDATE ONLY — DO NOT EXECUTE ON PRODUCTION WITHOUT EXPLICIT DDL APPROVAL.
--
-- ملاحظة: هذه الجداول الأربعة قائمة سابقاً (لم تنشئها هذه الهجرة) — لذلك نعكس الإضافات فقط:
--   نُسقط السياسات + نوقف FORCE RLS + نُسقط قيود/فهارس tenant_id المضافة. لا نُسقط الجداول
--   ولا نُسقط tenant_id نفسه (قد تعتمد عليه جداول/سياسات أخرى مشتركة). idempotent (IF EXISTS).
BEGIN;

-- inventory_items
DROP POLICY IF EXISTS rls_inventory_items_tenant_isolation ON inventory_items;
ALTER TABLE inventory_items NO FORCE ROW LEVEL SECURITY;
ALTER TABLE inventory_items DISABLE ROW LEVEL SECURITY;
ALTER TABLE inventory_items DROP CONSTRAINT IF EXISTS fk_inventory_items_tenant;
DROP INDEX IF EXISTS idx_inventory_items_tenant_id;

-- cssd_instrument_sets
DROP POLICY IF EXISTS rls_cssd_instrument_sets_tenant_isolation ON cssd_instrument_sets;
ALTER TABLE cssd_instrument_sets NO FORCE ROW LEVEL SECURITY;
ALTER TABLE cssd_instrument_sets DISABLE ROW LEVEL SECURITY;
ALTER TABLE cssd_instrument_sets DROP CONSTRAINT IF EXISTS fk_cssd_instrument_sets_tenant;
DROP INDEX IF EXISTS idx_cssd_instrument_sets_tenant_id;

-- cssd_sterilization_cycles
DROP POLICY IF EXISTS rls_cssd_cycles_tenant_isolation ON cssd_sterilization_cycles;
ALTER TABLE cssd_sterilization_cycles NO FORCE ROW LEVEL SECURITY;
ALTER TABLE cssd_sterilization_cycles DISABLE ROW LEVEL SECURITY;
ALTER TABLE cssd_sterilization_cycles DROP CONSTRAINT IF EXISTS fk_cssd_cycles_tenant;
DROP INDEX IF EXISTS idx_cssd_cycles_tenant_id;

-- cssd_load_items
DROP POLICY IF EXISTS rls_cssd_load_items_tenant_isolation ON cssd_load_items;
ALTER TABLE cssd_load_items NO FORCE ROW LEVEL SECURITY;
ALTER TABLE cssd_load_items DISABLE ROW LEVEL SECURITY;
ALTER TABLE cssd_load_items DROP CONSTRAINT IF EXISTS fk_cssd_load_items_tenant;
DROP INDEX IF EXISTS idx_cssd_load_items_tenant_id;

COMMIT;
