-- ex_01_orders_validate.sql  (run AFTER ex_01_orders_up.sql; read-only)
-- PASS = orders/order_items/order_sets exist with tenant_id FK + FORCE RLS + isolation policy + indexes + type CHECK.

-- ----- orders header -----
SELECT
  (SELECT count(*) FROM information_schema.tables WHERE table_name='orders') AS orders_exists,                    -- expect 1
  (SELECT count(*) FROM information_schema.columns
     WHERE table_name='orders'
       AND column_name IN ('tenant_id','encounter_id','patient_id','type','status','ordered_by','order_set_id')) AS orders_cols, -- expect 7
  (SELECT relforcerowsecurity FROM pg_class WHERE relname='orders') AS orders_force_rls,                          -- expect t
  (SELECT count(*) FROM pg_policies WHERE tablename='orders' AND policyname='rls_orders_tenant_isolation') AS orders_policy, -- expect 1
  (SELECT count(*) FROM pg_constraint WHERE conname='chk_orders_type') AS orders_type_check,                      -- expect 1
  (SELECT count(*) FROM pg_constraint WHERE conname='chk_orders_status') AS orders_status_check,                  -- expect 1
  (SELECT count(*) FROM pg_indexes WHERE tablename='orders' AND indexname='idx_orders_tenant_id') AS orders_idx;  -- expect 1

-- ----- order_items -----
SELECT
  (SELECT count(*) FROM information_schema.tables WHERE table_name='order_items') AS items_exists,                -- expect 1
  (SELECT count(*) FROM information_schema.columns
     WHERE table_name='order_items'
       AND column_name IN ('tenant_id','order_id','catalog_ref','qty','instructions')) AS items_cols,            -- expect 5
  (SELECT relforcerowsecurity FROM pg_class WHERE relname='order_items') AS items_force_rls,                      -- expect t
  (SELECT count(*) FROM pg_policies WHERE tablename='order_items' AND policyname='rls_order_items_tenant_isolation') AS items_policy, -- expect 1
  (SELECT count(*) FROM pg_indexes WHERE tablename='order_items' AND indexname='idx_order_items_tenant_id') AS items_idx; -- expect 1

-- ----- order_sets -----
SELECT
  (SELECT count(*) FROM information_schema.tables WHERE table_name='order_sets') AS sets_exists,                  -- expect 1
  (SELECT count(*) FROM information_schema.columns
     WHERE table_name='order_sets'
       AND column_name IN ('tenant_id','name','items_json')) AS sets_cols,                                       -- expect 3
  (SELECT relforcerowsecurity FROM pg_class WHERE relname='order_sets') AS sets_force_rls,                        -- expect t
  (SELECT count(*) FROM pg_policies WHERE tablename='order_sets' AND policyname='rls_order_sets_tenant_isolation') AS sets_policy, -- expect 1
  (SELECT count(*) FROM pg_indexes WHERE tablename='order_sets' AND indexname='idx_order_sets_tenant_id') AS sets_idx; -- expect 1

-- ----- FKs to tenants(id) on all three -----
SELECT count(*)::int AS fk_to_tenants FROM pg_constraint
  WHERE conrelid IN ('orders'::regclass,'order_items'::regclass,'order_sets'::regclass)
    AND confrelid='tenants'::regclass AND contype='f';                                                           -- expect 3

-- ----- order_items -> orders FK + orders -> order_sets FK -----
SELECT
  (SELECT count(*) FROM pg_constraint
     WHERE conrelid='order_items'::regclass AND confrelid='orders'::regclass AND contype='f') AS items_to_orders_fk, -- expect 1
  (SELECT count(*) FROM pg_constraint
     WHERE conrelid='orders'::regclass AND confrelid='order_sets'::regclass AND contype='f') AS orders_to_sets_fk;   -- expect 1
