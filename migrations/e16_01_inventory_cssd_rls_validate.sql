-- e16_01_inventory_cssd_rls_validate.sql  (run AFTER e16_01 up; read-only)
-- PASS = each of the four tables has tenant_id NOT NULL + FK->tenants + FORCE RLS + isolation policy.
SELECT
  (SELECT relforcerowsecurity FROM pg_class WHERE relname='inventory_items')                          AS inv_items_force_rls,        -- t
  (SELECT count(*) FROM pg_policies WHERE tablename='inventory_items'
       AND policyname='rls_inventory_items_tenant_isolation')                                          AS inv_items_policy,           -- 1
  (SELECT count(*)::int FROM information_schema.columns WHERE table_name='inventory_items'
       AND column_name='tenant_id' AND is_nullable='NO')                                               AS inv_items_tenant_not_null,  -- 1
  (SELECT count(*)::int FROM pg_constraint WHERE conrelid='inventory_items'::regclass
       AND confrelid='tenants'::regclass AND contype='f')                                              AS inv_items_tenant_fk,        -- 1
  (SELECT relforcerowsecurity FROM pg_class WHERE relname='cssd_instrument_sets')                      AS sets_force_rls,             -- t
  (SELECT count(*) FROM pg_policies WHERE tablename='cssd_instrument_sets'
       AND policyname='rls_cssd_instrument_sets_tenant_isolation')                                     AS sets_policy,                -- 1
  (SELECT count(*)::int FROM information_schema.columns WHERE table_name='cssd_instrument_sets'
       AND column_name='tenant_id' AND is_nullable='NO')                                               AS sets_tenant_not_null,       -- 1
  (SELECT relforcerowsecurity FROM pg_class WHERE relname='cssd_sterilization_cycles')                 AS cycles_force_rls,           -- t
  (SELECT count(*) FROM pg_policies WHERE tablename='cssd_sterilization_cycles'
       AND policyname='rls_cssd_cycles_tenant_isolation')                                              AS cycles_policy,              -- 1
  (SELECT count(*)::int FROM information_schema.columns WHERE table_name='cssd_sterilization_cycles'
       AND column_name='released_for_issue')                                                           AS cycles_bi_gate_col,         -- 1
  (SELECT count(*)::int FROM information_schema.columns WHERE table_name='cssd_sterilization_cycles'
       AND column_name='tenant_id' AND is_nullable='NO')                                               AS cycles_tenant_not_null,     -- 1
  (SELECT relforcerowsecurity FROM pg_class WHERE relname='cssd_load_items')                           AS load_force_rls,             -- t
  (SELECT count(*) FROM pg_policies WHERE tablename='cssd_load_items'
       AND policyname='rls_cssd_load_items_tenant_isolation')                                          AS load_policy,                -- 1
  (SELECT count(*)::int FROM information_schema.columns WHERE table_name='cssd_load_items'
       AND column_name='tenant_id' AND is_nullable='NO')                                               AS load_tenant_not_null,       -- 1
  -- tenant-FK existence assertions (I3: match ADD CONSTRAINT statements in up script)
  (SELECT count(*)::int FROM pg_constraint WHERE conrelid='cssd_instrument_sets'::regclass
       AND confrelid='tenants'::regclass AND contype='f')                                              AS sets_tenant_fk,            -- 1
  (SELECT count(*)::int FROM pg_constraint WHERE conrelid='cssd_sterilization_cycles'::regclass
       AND confrelid='tenants'::regclass AND contype='f')                                              AS cycles_tenant_fk,          -- 1
  (SELECT count(*)::int FROM pg_constraint WHERE conrelid='cssd_load_items'::regclass
       AND confrelid='tenants'::regclass AND contype='f')                                              AS load_tenant_fk;            -- 1
