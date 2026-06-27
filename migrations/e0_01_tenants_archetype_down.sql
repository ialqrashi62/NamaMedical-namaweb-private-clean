-- e0_01_tenants_archetype_down.sql  (rollback of e0_01_tenants_archetype_up.sql)
-- CANDIDATE ONLY — DO NOT EXECUTE ON PRODUCTION WITHOUT EXPLICIT DDL APPROVAL.
-- يزيل عمود archetype وقيده. idempotent (IF EXISTS). تحذير: يحذف بيانات النمط المخزّنة.
BEGIN;

ALTER TABLE tenants DROP CONSTRAINT IF EXISTS chk_tenants_archetype;
ALTER TABLE tenants DROP COLUMN IF EXISTS archetype;
ALTER TABLE tenants DROP COLUMN IF EXISTS moh_license;
ALTER TABLE tenants DROP COLUMN IF EXISTS cr_no;
ALTER TABLE tenants DROP COLUMN IF EXISTS vat_no;

COMMIT;
