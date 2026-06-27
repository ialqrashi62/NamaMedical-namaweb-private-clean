-- e10_02_cost_centers_validate.sql  (run AFTER e10_02_cost_centers_up.sql; read-only)
-- PASS = finance_cost_centers tenant-isolated (FORCE RLS + policy + tenant_id NOT NULL FK) +
--   journal_lines has cost_center FK.

SELECT
  (SELECT relforcerowsecurity FROM pg_class WHERE relname='finance_cost_centers')                            AS cc_force_rls,       -- expect t
  (SELECT count(*) FROM pg_policies WHERE tablename='finance_cost_centers'
       AND policyname='rls_cc_tenant_isolation')                                                             AS cc_policy,          -- expect 1
  (SELECT count(*)::int FROM information_schema.columns WHERE table_name='finance_cost_centers'
       AND column_name='tenant_id' AND is_nullable='NO')                                                     AS cc_tenant_not_null, -- expect 1
  (SELECT count(*)::int FROM pg_constraint
       WHERE conrelid='finance_cost_centers'::regclass AND confrelid='tenants'::regclass AND contype='f')    AS cc_tenant_fk,       -- expect 1
  (SELECT count(*)::int FROM information_schema.columns WHERE table_name='finance_cost_centers'
       AND column_name='budget_amount')                                                                      AS cc_budget_col,      -- expect 1
  (SELECT count(*)::int FROM pg_constraint
       WHERE conrelid='finance_journal_lines'::regclass
       AND confrelid='finance_cost_centers'::regclass AND contype='f')                                       AS jl_cc_fk;           -- expect 1
