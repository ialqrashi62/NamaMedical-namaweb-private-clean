-- e9_02_icu_infusions_down.sql  (rollback of e9_02_icu_infusions_up.sql)
-- CANDIDATE ONLY — DO NOT EXECUTE ON PRODUCTION WITHOUT EXPLICIT DDL APPROVAL.
--
-- ملاحظة: icu_infusions جدول جديد أنشأته هذه الهجرة — لذلك نُسقط الجدول أولاً (وهو ما يُسقط
--   سياسته وفهارسه وقيوده ضمناً) لإلغاء كامل إضافة E9. idempotent (IF EXISTS).
BEGIN;

-- 1. drop the table first (cascades its policy/indexes/constraints).
DROP TABLE IF EXISTS icu_infusions CASCADE;

-- 2. defensive: drop the policy explicitly if the table somehow lingered.
DROP POLICY IF EXISTS rls_icu_infusions_tenant_isolation ON icu_infusions;

COMMIT;
