-- e11_01_claims_lifecycle_down.sql  (rollback of e11_01_claims_lifecycle_up.sql)
-- CANDIDATE ONLY — DO NOT EXECUTE ON PRODUCTION WITHOUT EXPLICIT DDL APPROVAL.
--
-- ملاحظة: insurance_claims قائم سابقاً => لا نُسقطه. نعكس فقط الإضافات. tenant_id/facility_id/branch_id
--   كانت في bootstrap فنُبقي الأعمدة (نُزيل NOT NULL/FK + الإضافات الجديدة فقط). idempotent.
BEGIN;

DROP POLICY IF EXISTS rls_claims_tenant_isolation ON insurance_claims;
DROP INDEX IF EXISTS idx_ins_claims_tenant_id;
DROP INDEX IF EXISTS idx_ins_claims_tenant_lifecycle;
DROP INDEX IF EXISTS idx_ins_claims_invoice;

ALTER TABLE insurance_claims DROP CONSTRAINT IF EXISTS chk_claims_amounts;
ALTER TABLE insurance_claims DROP CONSTRAINT IF EXISTS chk_claims_lifecycle;
ALTER TABLE insurance_claims DROP CONSTRAINT IF EXISTS fk_claims_company;
ALTER TABLE insurance_claims DROP CONSTRAINT IF EXISTS fk_claims_invoice;
ALTER TABLE insurance_claims DROP CONSTRAINT IF EXISTS fk_claims_patient;
ALTER TABLE insurance_claims DROP CONSTRAINT IF EXISTS fk_claims_tenant;

ALTER TABLE insurance_claims DROP COLUMN IF EXISTS created_by;
ALTER TABLE insurance_claims DROP COLUMN IF EXISTS adjudicated_at;
ALTER TABLE insurance_claims DROP COLUMN IF EXISTS submitted_at;
ALTER TABLE insurance_claims DROP COLUMN IF EXISTS nphies_response_json;
ALTER TABLE insurance_claims DROP COLUMN IF EXISTS nphies_request_json;
ALTER TABLE insurance_claims DROP COLUMN IF EXISTS nphies_claim_ref;
ALTER TABLE insurance_claims DROP COLUMN IF EXISTS patient_share;
ALTER TABLE insurance_claims DROP COLUMN IF EXISTS paid_amount;
ALTER TABLE insurance_claims DROP COLUMN IF EXISTS approved_amount;
ALTER TABLE insurance_claims DROP COLUMN IF EXISTS lifecycle_status;
ALTER TABLE insurance_claims DROP COLUMN IF EXISTS pre_auth_id;
ALTER TABLE insurance_claims DROP COLUMN IF EXISTS insurance_company_id;
ALTER TABLE insurance_claims DROP COLUMN IF EXISTS admission_id;
ALTER TABLE insurance_claims DROP COLUMN IF EXISTS invoice_id;
ALTER TABLE insurance_claims DROP COLUMN IF EXISTS patient_id;
ALTER TABLE insurance_claims ALTER COLUMN tenant_id DROP NOT NULL;

COMMIT;
