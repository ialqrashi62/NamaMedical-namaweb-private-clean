-- ex_02_rbac_down.sql  (rollback of ex_02_rbac_up.sql)
-- CANDIDATE ONLY — DO NOT EXECUTE ON PRODUCTION WITHOUT EXPLICIT DDL APPROVAL.
-- يحذف role_permissions ثم permissions مع سياساتها. idempotent (IF EXISTS).
BEGIN;

DROP POLICY IF EXISTS rls_role_permissions_tenant_isolation ON role_permissions;
DROP TABLE IF EXISTS role_permissions;

DROP TABLE IF EXISTS permissions;

COMMIT;
