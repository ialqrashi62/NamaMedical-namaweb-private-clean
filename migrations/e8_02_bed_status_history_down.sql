-- e8_02_bed_status_history_down.sql  (rollback of e8_02_bed_status_history_up.sql)
-- CANDIDATE ONLY — DO NOT EXECUTE ON PRODUCTION WITHOUT EXPLICIT DDL APPROVAL.
--
-- ملاحظة: bed_status_history جدول جديد أنشأته هذه الهجرة — لذلك نُسقط الجدول أولاً (وهو ما
--   يُسقط سياسته وفهارسه وقيوده ضمناً) لإلغاء كامل إضافة E8. idempotent (IF EXISTS).
BEGIN;

-- 1. drop the table first (cascades its policy/indexes/constraints).
DROP TABLE IF EXISTS bed_status_history CASCADE;

-- 2. defensive: drop the policy explicitly if the table somehow lingered.
DROP POLICY IF EXISTS rls_bed_status_history_tenant_isolation ON bed_status_history;

COMMIT;
