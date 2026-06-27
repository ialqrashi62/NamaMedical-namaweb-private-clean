-- e10_05_daily_close_rls_down.sql  (rollback of e10_05_daily_close_rls_up.sql)
-- CANDIDATE ONLY — DO NOT EXECUTE ON PRODUCTION WITHOUT EXPLICIT DDL APPROVAL.
--
-- ملاحظة: daily_close قائم سابقاً => لا نُسقطه. نُزيل فقط ما أضافته هذه الهجرة (السياسة/FK/الفهرس
--   وقيد NOT NULL). نُبقي العمود tenant_id لأن الإنتاج قد يكون يعتمده (Phase 178). idempotent.
BEGIN;

DROP POLICY IF EXISTS rls_daily_close_tenant_isolation ON daily_close;
ALTER TABLE daily_close DROP CONSTRAINT IF EXISTS fk_daily_close_tenant;
DROP INDEX IF EXISTS idx_daily_close_tenant_id;
ALTER TABLE daily_close ALTER COLUMN tenant_id DROP NOT NULL;

COMMIT;
