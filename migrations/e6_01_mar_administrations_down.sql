-- e6_01_mar_administrations_down.sql  (rollback of e6_01_mar_administrations_up.sql)
-- CANDIDATE ONLY — DO NOT EXECUTE ON PRODUCTION WITHOUT EXPLICIT DDL APPROVAL.
-- يحذف الجدول أولاً (DROP TABLE يسقط السياسة والفهارس التابعة)، ثم تنظيف احترازي idempotent (IF EXISTS).
-- LOWER-3: DROP TABLE FIRST so a failed/locked DROP POLICY can never block the table teardown;
--   the trailing DROP POLICY/INDEX are guarded best-effort cleanup for a partial-state rollback.
BEGIN;

-- Primary teardown: DROP TABLE cascades its own dependent policies + indexes.
DROP TABLE IF EXISTS mar_administrations;

-- Best-effort residue cleanup (only fire if the table somehow survived; all IF EXISTS so a no-op is safe).
DROP POLICY IF EXISTS rls_mar_administrations_tenant_isolation ON mar_administrations;
DROP INDEX IF EXISTS idx_mar_administrations_prescription_ref;
DROP INDEX IF EXISTS idx_mar_administrations_patient_id;
DROP INDEX IF EXISTS idx_mar_administrations_tenant_id;

COMMIT;
