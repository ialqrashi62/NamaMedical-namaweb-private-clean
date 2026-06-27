-- e3_02_lab_results_down.sql  (rollback of e3_02_lab_results_up.sql)
-- CANDIDATE ONLY — DO NOT EXECUTE ON PRODUCTION WITHOUT EXPLICIT DDL APPROVAL.
--
-- ملاحظة هامة: lab_results جدول قائم أصلاً في db_postgres.js (هيكل order_id/test_id/
--   result_value/is_abnormal/notes). لذلك لا نحذف الجدول؛ نحذف فقط ما أضافه up:
--   السياسة + الفهارس الجديدة + قيود CHECK/FK + الأعمدة البنيوية المضافة، فيعود الهيكل
--   اليتيم الأصلي كما كان. idempotent (IF EXISTS).
BEGIN;

-- child table first (FK -> lab_results)
DROP POLICY IF EXISTS rls_lab_callbacks_tenant_isolation ON lab_critical_callbacks;
DROP INDEX IF EXISTS idx_lab_callbacks_result_id;
DROP INDEX IF EXISTS idx_lab_callbacks_tenant_id;
DROP TABLE IF EXISTS lab_critical_callbacks;

DROP POLICY IF EXISTS rls_lab_results_tenant_isolation ON lab_results;
-- (RLS itself left enabled is harmless without a policy, but we disable to fully restore prior state.)
ALTER TABLE IF EXISTS lab_results NO FORCE ROW LEVEL SECURITY;
ALTER TABLE IF EXISTS lab_results DISABLE ROW LEVEL SECURITY;

DROP INDEX IF EXISTS idx_lab_results_order_id;
DROP INDEX IF EXISTS idx_lab_results_lab_sample_id;
DROP INDEX IF EXISTS idx_lab_results_tenant_id;

ALTER TABLE IF EXISTS lab_results DROP CONSTRAINT IF EXISTS chk_lab_results_status;
ALTER TABLE IF EXISTS lab_results DROP CONSTRAINT IF EXISTS fk_lab_results_tenant;

ALTER TABLE IF EXISTS lab_results DROP COLUMN IF EXISTS reported_at;
ALTER TABLE IF EXISTS lab_results DROP COLUMN IF EXISTS reported;
ALTER TABLE IF EXISTS lab_results DROP COLUMN IF EXISTS verified_at;
ALTER TABLE IF EXISTS lab_results DROP COLUMN IF EXISTS verified_by;
ALTER TABLE IF EXISTS lab_results DROP COLUMN IF EXISTS hold_reasons;
ALTER TABLE IF EXISTS lab_results DROP COLUMN IF EXISTS status;
ALTER TABLE IF EXISTS lab_results DROP COLUMN IF EXISTS is_critical;
ALTER TABLE IF EXISTS lab_results DROP COLUMN IF EXISTS delta_pct;
ALTER TABLE IF EXISTS lab_results DROP COLUMN IF EXISTS abnormal_flag;
ALTER TABLE IF EXISTS lab_results DROP COLUMN IF EXISTS ref_high;
ALTER TABLE IF EXISTS lab_results DROP COLUMN IF EXISTS ref_low;
ALTER TABLE IF EXISTS lab_results DROP COLUMN IF EXISTS normal_range;
ALTER TABLE IF EXISTS lab_results DROP COLUMN IF EXISTS unit;
ALTER TABLE IF EXISTS lab_results DROP COLUMN IF EXISTS value;
ALTER TABLE IF EXISTS lab_results DROP COLUMN IF EXISTS test_name;
ALTER TABLE IF EXISTS lab_results DROP COLUMN IF EXISTS loinc;
ALTER TABLE IF EXISTS lab_results DROP COLUMN IF EXISTS lab_sample_id;
ALTER TABLE IF EXISTS lab_results DROP COLUMN IF EXISTS facility_id;
ALTER TABLE IF EXISTS lab_results DROP COLUMN IF EXISTS tenant_id;
ALTER TABLE IF EXISTS lab_results DROP COLUMN IF EXISTS created_at;

COMMIT;
