BEGIN;

ALTER TABLE nursing_io DISABLE ROW LEVEL SECURITY;
DROP POLICY IF EXISTS rls_nursing_io_tenant_isolation ON nursing_io;
DROP INDEX IF EXISTS idx_nursing_io_tenant_id;
ALTER TABLE nursing_io ALTER COLUMN tenant_id DROP DEFAULT;
ALTER TABLE nursing_io ALTER COLUMN tenant_id DROP NOT NULL;
ALTER TABLE nursing_io DROP CONSTRAINT IF EXISTS fk_nursing_io_tenant;

ALTER TABLE nursing_handover DISABLE ROW LEVEL SECURITY;
DROP POLICY IF EXISTS rls_nursing_handover_tenant_isolation ON nursing_handover;
DROP INDEX IF EXISTS idx_nursing_handover_tenant_id;
ALTER TABLE nursing_handover ALTER COLUMN tenant_id DROP DEFAULT;
ALTER TABLE nursing_handover ALTER COLUMN tenant_id DROP NOT NULL;
ALTER TABLE nursing_handover DROP CONSTRAINT IF EXISTS fk_nursing_handover_tenant;

ALTER TABLE nursing_pain_assessments DISABLE ROW LEVEL SECURITY;
DROP POLICY IF EXISTS rls_nursing_pain_assessments_tenant_isolation ON nursing_pain_assessments;
DROP INDEX IF EXISTS idx_nursing_pain_assessments_tenant_id;
ALTER TABLE nursing_pain_assessments ALTER COLUMN tenant_id DROP DEFAULT;

COMMIT;
