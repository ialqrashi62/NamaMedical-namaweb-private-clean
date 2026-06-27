-- e0_02_facilities_extend_down.sql  (rollback of e0_02_facilities_extend_up.sql)
-- CANDIDATE ONLY — DO NOT EXECUTE ON PRODUCTION WITHOUT EXPLICIT DDL APPROVAL.
-- يعيد facilities إلى شكله السابق (id, tenant_id, name, tax_number, created_at).
-- تحذير: لا يُسقط RLS تلقائياً إن كانت facilities تحت RLS قبل هذه الهجرة. هنا نُسقط ما أنشأناه فقط.
-- idempotent (IF EXISTS). يحذف بيانات الأعمدة الجديدة.
BEGIN;

DROP POLICY IF EXISTS rls_facilities_tenant_isolation ON facilities;
-- إعادة facilities إلى حالة بلا RLS (كانت كذلك في initDatabase قبل هذه الهجرة).
ALTER TABLE facilities NO FORCE ROW LEVEL SECURITY;
ALTER TABLE facilities DISABLE ROW LEVEL SECURITY;

DROP INDEX IF EXISTS idx_facilities_parent;
DROP INDEX IF EXISTS idx_facilities_tenant;

ALTER TABLE facilities DROP CONSTRAINT IF EXISTS chk_facilities_type;
ALTER TABLE facilities DROP CONSTRAINT IF EXISTS fk_facilities_parent;

ALTER TABLE facilities DROP COLUMN IF EXISTS parent_facility_id;
ALTER TABLE facilities DROP COLUMN IF EXISTS timezone;
ALTER TABLE facilities DROP COLUMN IF EXISTS currency;
ALTER TABLE facilities DROP COLUMN IF EXISTS beds;
ALTER TABLE facilities DROP COLUMN IF EXISTS type;

COMMIT;
