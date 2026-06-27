-- e11_01_claims_lifecycle_validate.sql  (run AFTER e11_01_claims_lifecycle_up.sql; read-only)
-- PASS = insurance_claims tenant-isolated (FORCE RLS + policy + tenant_id NOT NULL FK),
--   linked to invoices/patients/companies, lifecycle_status CHECK, amounts NUMERIC + non-negative CHECK.

SELECT
  (SELECT relforcerowsecurity FROM pg_class WHERE relname='insurance_claims')                                AS c_force_rls,        -- expect t
  (SELECT count(*) FROM pg_policies WHERE tablename='insurance_claims'
       AND policyname='rls_claims_tenant_isolation')                                                         AS c_policy,           -- expect 1
  (SELECT count(*)::int FROM information_schema.columns WHERE table_name='insurance_claims'
       AND column_name='tenant_id' AND is_nullable='NO')                                                     AS c_tenant_not_null,  -- expect 1
  (SELECT count(*)::int FROM pg_constraint
       WHERE conrelid='insurance_claims'::regclass AND confrelid='tenants'::regclass AND contype='f')        AS c_tenant_fk,        -- expect 1
  (SELECT count(*)::int FROM pg_constraint
       WHERE conrelid='insurance_claims'::regclass AND confrelid='invoices'::regclass AND contype='f')       AS c_invoice_fk,       -- expect 1
  (SELECT count(*)::int FROM pg_constraint
       WHERE conrelid='insurance_claims'::regclass AND confrelid='patients'::regclass AND contype='f')       AS c_patient_fk,       -- expect 1
  (SELECT count(*)::int FROM pg_constraint
       WHERE conrelid='insurance_claims'::regclass AND confrelid='insurance_companies'::regclass AND contype='f') AS c_company_fk,  -- expect 1
  (SELECT count(*)::int FROM pg_constraint
       WHERE conrelid='insurance_claims'::regclass AND conname='chk_claims_lifecycle')                       AS c_lifecycle_check,  -- expect 1
  (SELECT data_type FROM information_schema.columns WHERE table_name='insurance_claims'
       AND column_name='claim_amount')                                                                       AS c_amount_type,      -- expect numeric
  (SELECT count(*)::int FROM pg_constraint
       WHERE conrelid='insurance_claims'::regclass AND conname='chk_claims_amounts')                         AS c_amounts_check;    -- expect 1
