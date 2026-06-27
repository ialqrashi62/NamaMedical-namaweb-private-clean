-- e6_03_nursing_scores_down.sql  (rollback of e6_03_nursing_scores_up.sql)
-- CANDIDATE ONLY — DO NOT EXECUTE ON PRODUCTION WITHOUT EXPLICIT DDL APPROVAL.
-- يحذف الجدول أولاً (DROP TABLE يسقط السياسة والفهارس التابعة)، ثم تنظيف احترازي idempotent (IF EXISTS).
-- LOWER-3: DROP TABLE FIRST so a failed/locked DROP POLICY can never block the table teardown.
BEGIN;

DROP TABLE IF EXISTS nursing_scores;

DROP POLICY IF EXISTS rls_nursing_scores_tenant_isolation ON nursing_scores;
DROP INDEX IF EXISTS idx_nursing_scores_patient_id;
DROP INDEX IF EXISTS idx_nursing_scores_tenant_id;

COMMIT;
