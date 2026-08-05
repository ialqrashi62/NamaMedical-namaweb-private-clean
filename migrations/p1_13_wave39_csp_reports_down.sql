BEGIN;
DROP POLICY IF EXISTS rls_csp_reports_tenant_isolation ON csp_reports;
DROP TABLE IF EXISTS csp_reports CASCADE;
COMMIT;