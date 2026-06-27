-- e9_01_icu_rls_validate.sql  (run AFTER e9_01_icu_rls_up.sql; read-only)
-- PASS = each of the 4 icu_* tables has FORCE RLS + isolation policy + tenant_id NOT NULL FK + index.

SELECT
  -- icu_monitoring
  (SELECT relforcerowsecurity FROM pg_class WHERE relname='icu_monitoring')                          AS mon_force_rls,    -- t
  (SELECT count(*) FROM pg_policies WHERE tablename='icu_monitoring'
       AND policyname='rls_icu_monitoring_tenant_isolation')                                          AS mon_policy,       -- 1
  (SELECT count(*)::int FROM information_schema.columns WHERE table_name='icu_monitoring'
       AND column_name='tenant_id' AND is_nullable='NO')                                              AS mon_tenant_nn,    -- 1
  (SELECT count(*)::int FROM pg_constraint
       WHERE conrelid='icu_monitoring'::regclass AND confrelid='tenants'::regclass AND contype='f')   AS mon_tenant_fk,    -- 1
  -- icu_ventilator
  (SELECT relforcerowsecurity FROM pg_class WHERE relname='icu_ventilator')                           AS vent_force_rls,   -- t
  (SELECT count(*) FROM pg_policies WHERE tablename='icu_ventilator'
       AND policyname='rls_icu_ventilator_tenant_isolation')                                          AS vent_policy,      -- 1
  (SELECT count(*)::int FROM information_schema.columns WHERE table_name='icu_ventilator'
       AND column_name='tenant_id' AND is_nullable='NO')                                              AS vent_tenant_nn,   -- 1
  (SELECT count(*)::int FROM pg_constraint
       WHERE conrelid='icu_ventilator'::regclass AND confrelid='tenants'::regclass AND contype='f')   AS vent_tenant_fk,   -- 1
  -- icu_scores
  (SELECT relforcerowsecurity FROM pg_class WHERE relname='icu_scores')                               AS sc_force_rls,     -- t
  (SELECT count(*) FROM pg_policies WHERE tablename='icu_scores'
       AND policyname='rls_icu_scores_tenant_isolation')                                              AS sc_policy,        -- 1
  (SELECT count(*)::int FROM information_schema.columns WHERE table_name='icu_scores'
       AND column_name='tenant_id' AND is_nullable='NO')                                              AS sc_tenant_nn,     -- 1
  (SELECT count(*)::int FROM pg_constraint
       WHERE conrelid='icu_scores'::regclass AND confrelid='tenants'::regclass AND contype='f')       AS sc_tenant_fk,     -- 1
  -- icu_fluid_balance
  (SELECT relforcerowsecurity FROM pg_class WHERE relname='icu_fluid_balance')                        AS fb_force_rls,     -- t
  (SELECT count(*) FROM pg_policies WHERE tablename='icu_fluid_balance'
       AND policyname='rls_icu_fluid_balance_tenant_isolation')                                       AS fb_policy,        -- 1
  (SELECT count(*)::int FROM information_schema.columns WHERE table_name='icu_fluid_balance'
       AND column_name='tenant_id' AND is_nullable='NO')                                              AS fb_tenant_nn,     -- 1
  (SELECT count(*)::int FROM pg_constraint
       WHERE conrelid='icu_fluid_balance'::regclass AND confrelid='tenants'::regclass AND contype='f') AS fb_tenant_fk,    -- 1
  (SELECT count(*) FROM pg_indexes WHERE tablename='icu_fluid_balance'
       AND indexname='idx_icu_fluid_balance_tenant_id')                                               AS fb_idx;           -- 1
