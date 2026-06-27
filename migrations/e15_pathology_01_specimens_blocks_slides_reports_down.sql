-- ============================================================================
-- E15 PATHOLOGY — DOWN (reverses ONLY this migration's additions).
-- Drops the NEW tables in child->parent order. Never touches pre-existing
-- tables (pathology_cases, pathology_specimens, patients, visits, tenants).
-- ============================================================================
BEGIN;

DROP POLICY IF EXISTS path_reports_tenant_isolation  ON path_reports;
DROP POLICY IF EXISTS path_slides_tenant_isolation   ON path_slides;
DROP POLICY IF EXISTS path_blocks_tenant_isolation   ON path_blocks;
DROP POLICY IF EXISTS path_specimens_tenant_isolation ON path_specimens;

DROP TABLE IF EXISTS path_reports CASCADE;
DROP TABLE IF EXISTS path_slides  CASCADE;
DROP TABLE IF EXISTS path_blocks  CASCADE;
DROP TABLE IF EXISTS path_specimens CASCADE;

COMMIT;
