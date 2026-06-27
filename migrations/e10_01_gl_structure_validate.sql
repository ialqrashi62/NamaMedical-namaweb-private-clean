-- e10_01_gl_structure_validate.sql  (run AFTER e10_01_gl_structure_up.sql; read-only)
-- PASS = three GL tables tenant-isolated (FORCE RLS + policy + tenant_id NOT NULL FK), lines NUMERIC
--   with FK to entries+accounts + side CHECK, entries have posting_status CHECK.

SELECT
  -- chart_of_accounts
  (SELECT relforcerowsecurity FROM pg_class WHERE relname='finance_chart_of_accounts')                       AS coa_force_rls,        -- expect t
  (SELECT count(*) FROM pg_policies WHERE tablename='finance_chart_of_accounts'
       AND policyname='rls_coa_tenant_isolation')                                                            AS coa_policy,           -- expect 1
  (SELECT count(*)::int FROM information_schema.columns WHERE table_name='finance_chart_of_accounts'
       AND column_name='tenant_id' AND is_nullable='NO')                                                     AS coa_tenant_not_null,  -- expect 1
  (SELECT count(*)::int FROM pg_constraint
       WHERE conrelid='finance_chart_of_accounts'::regclass AND confrelid='tenants'::regclass AND contype='f') AS coa_tenant_fk,      -- expect 1
  (SELECT count(*)::int FROM pg_constraint
       WHERE conrelid='finance_chart_of_accounts'::regclass AND conname='chk_coa_class')                      AS coa_class_check,      -- expect 1
  -- journal_entries
  (SELECT relforcerowsecurity FROM pg_class WHERE relname='finance_journal_entries')                         AS je_force_rls,         -- expect t
  (SELECT count(*) FROM pg_policies WHERE tablename='finance_journal_entries'
       AND policyname='rls_je_tenant_isolation')                                                             AS je_policy,            -- expect 1
  (SELECT count(*)::int FROM information_schema.columns WHERE table_name='finance_journal_entries'
       AND column_name='tenant_id' AND is_nullable='NO')                                                     AS je_tenant_not_null,   -- expect 1
  (SELECT count(*)::int FROM pg_constraint
       WHERE conrelid='finance_journal_entries'::regclass AND conname='chk_je_posting_status')               AS je_status_check,      -- expect 1
  -- journal_lines
  (SELECT relforcerowsecurity FROM pg_class WHERE relname='finance_journal_lines')                           AS jl_force_rls,         -- expect t
  (SELECT count(*) FROM pg_policies WHERE tablename='finance_journal_lines'
       AND policyname='rls_jl_tenant_isolation')                                                             AS jl_policy,            -- expect 1
  (SELECT count(*)::int FROM information_schema.columns WHERE table_name='finance_journal_lines'
       AND column_name='tenant_id' AND is_nullable='NO')                                                     AS jl_tenant_not_null,   -- expect 1
  (SELECT data_type FROM information_schema.columns WHERE table_name='finance_journal_lines'
       AND column_name='debit')                                                                              AS jl_debit_type,        -- expect numeric
  (SELECT count(*)::int FROM pg_constraint
       WHERE conrelid='finance_journal_lines'::regclass
       AND confrelid='finance_journal_entries'::regclass AND contype='f')                                    AS jl_entry_fk,          -- expect 1
  (SELECT count(*)::int FROM pg_constraint
       WHERE conrelid='finance_journal_lines'::regclass
       AND confrelid='finance_chart_of_accounts'::regclass AND contype='f')                                  AS jl_account_fk,        -- expect 1
  (SELECT count(*)::int FROM pg_constraint
       WHERE conrelid='finance_journal_lines'::regclass AND conname='chk_jl_sides')                          AS jl_sides_check,       -- expect 1
  -- L-1: reversal_of self-referential FK
  (SELECT count(*)::int FROM pg_constraint
       WHERE conrelid='finance_journal_entries'::regclass AND conname='fk_je_reversal_of')                   AS je_reversal_of_fk;    -- expect 1
