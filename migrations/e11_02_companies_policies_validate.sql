-- e11_02_companies_policies_validate.sql  (run AFTER e11_02_companies_policies_up.sql; read-only)
-- PASS = companies/policies/contracts tenant-isolated (FORCE RLS + policy + tenant_id NOT NULL FK).

SELECT
  (SELECT relforcerowsecurity FROM pg_class WHERE relname='insurance_companies')                             AS co_force_rls,        -- expect t
  (SELECT count(*) FROM pg_policies WHERE tablename='insurance_companies'
       AND policyname='rls_inscompany_tenant_isolation')                                                     AS co_policy,           -- expect 1
  (SELECT count(*)::int FROM information_schema.columns WHERE table_name='insurance_companies'
       AND column_name='tenant_id' AND is_nullable='NO')                                                     AS co_tenant_not_null,  -- expect 1
  (SELECT count(*)::int FROM pg_constraint
       WHERE conrelid='insurance_companies'::regclass AND confrelid='tenants'::regclass AND contype='f')     AS co_tenant_fk,        -- expect 1
  (SELECT relforcerowsecurity FROM pg_class WHERE relname='insurance_policies')                              AS po_force_rls,        -- expect t
  (SELECT count(*) FROM pg_policies WHERE tablename='insurance_policies'
       AND policyname='rls_inspolicy_tenant_isolation')                                                      AS po_policy,           -- expect 1
  (SELECT count(*)::int FROM information_schema.columns WHERE table_name='insurance_policies'
       AND column_name='tenant_id' AND is_nullable='NO')                                                     AS po_tenant_not_null,  -- expect 1
  (SELECT count(*)::int FROM pg_constraint
       WHERE conrelid='insurance_policies'::regclass AND confrelid='tenants'::regclass AND contype='f')      AS po_tenant_fk,        -- expect 1
  (SELECT relforcerowsecurity FROM pg_class WHERE relname='insurance_contracts')                             AS ct_force_rls,        -- expect t
  (SELECT count(*) FROM pg_policies WHERE tablename='insurance_contracts'
       AND policyname='rls_inscontract_tenant_isolation')                                                    AS ct_policy,           -- expect 1
  (SELECT count(*)::int FROM information_schema.columns WHERE table_name='insurance_contracts'
       AND column_name='tenant_id' AND is_nullable='NO')                                                     AS ct_tenant_not_null,  -- expect 1
  (SELECT count(*)::int FROM pg_constraint
       WHERE conrelid='insurance_contracts'::regclass AND confrelid='tenants'::regclass AND contype='f')     AS ct_tenant_fk;        -- expect 1
