-- e16_02_supply_chain_validate.sql  (run AFTER e16_02 up; read-only)
-- PASS = all seven NEW tables exist with tenant_id NOT NULL + FK->tenants + FORCE RLS + isolation policy,
--        plus the non-negative-stock + movement-type guard constraints.
SELECT
  -- inventory_batches
  (SELECT count(*)::int FROM information_schema.tables WHERE table_name='inventory_batches')            AS batches_exists,        -- 1
  (SELECT relforcerowsecurity FROM pg_class WHERE relname='inventory_batches')                          AS batches_force_rls,     -- t
  (SELECT count(*) FROM pg_policies WHERE tablename='inventory_batches'
       AND policyname='rls_inv_batches_tenant_isolation')                                               AS batches_policy,        -- 1
  (SELECT count(*)::int FROM information_schema.columns WHERE table_name='inventory_batches'
       AND column_name='tenant_id' AND is_nullable='NO')                                                AS batches_tenant_nn,     -- 1
  (SELECT count(*)::int FROM pg_constraint WHERE conrelid='inventory_batches'::regclass
       AND confrelid='tenants'::regclass AND contype='f')                                               AS batches_tenant_fk,     -- 1
  (SELECT count(*)::int FROM pg_constraint
       WHERE conname='chk_inv_batches_qty_on_hand_nonneg')                                              AS batches_nonneg_chk,    -- 1
  -- inventory_movements
  (SELECT relforcerowsecurity FROM pg_class WHERE relname='inventory_movements')                        AS mov_force_rls,         -- t
  (SELECT count(*) FROM pg_policies WHERE tablename='inventory_movements'
       AND policyname='rls_inv_mov_tenant_isolation')                                                   AS mov_policy,            -- 1
  (SELECT count(*)::int FROM information_schema.columns WHERE table_name='inventory_movements'
       AND column_name='tenant_id' AND is_nullable='NO')                                                AS mov_tenant_nn,         -- 1
  (SELECT count(*)::int FROM pg_constraint WHERE conname='chk_inv_mov_type')                            AS mov_type_chk,          -- 1
  -- purchase_orders + items
  (SELECT relforcerowsecurity FROM pg_class WHERE relname='purchase_orders')                            AS po_force_rls,          -- t
  (SELECT count(*) FROM pg_policies WHERE tablename='purchase_orders'
       AND policyname='rls_po_tenant_isolation')                                                        AS po_policy,             -- 1
  (SELECT count(*)::int FROM pg_constraint WHERE conname='chk_po_status')                               AS po_status_chk,         -- 1
  (SELECT relforcerowsecurity FROM pg_class WHERE relname='purchase_order_items')                       AS po_items_force_rls,    -- t
  (SELECT count(*)::int FROM pg_constraint WHERE conrelid='purchase_order_items'::regclass
       AND confrelid='purchase_orders'::regclass AND contype='f')                                       AS po_items_po_fk,        -- 1
  -- goods_receipts + items
  (SELECT relforcerowsecurity FROM pg_class WHERE relname='goods_receipts')                             AS grn_force_rls,         -- t
  (SELECT count(*) FROM pg_policies WHERE tablename='goods_receipts'
       AND policyname='rls_grn_tenant_isolation')                                                       AS grn_policy,            -- 1
  (SELECT count(*)::int FROM pg_constraint WHERE conrelid='goods_receipts'::regclass
       AND confrelid='purchase_orders'::regclass AND contype='f')                                       AS grn_po_fk,             -- 1
  (SELECT relforcerowsecurity FROM pg_class WHERE relname='goods_receipt_items')                        AS grn_items_force_rls,   -- t
  (SELECT count(*)::int FROM information_schema.columns WHERE table_name='goods_receipt_items'
       AND column_name='tenant_id' AND is_nullable='NO')                                                AS grn_items_tenant_nn,   -- 1
  -- inventory_stock_counts
  (SELECT relforcerowsecurity FROM pg_class WHERE relname='inventory_stock_counts')                     AS counts_force_rls,      -- t
  (SELECT count(*) FROM pg_policies WHERE tablename='inventory_stock_counts'
       AND policyname='rls_stock_counts_tenant_isolation')                                              AS counts_policy;         -- 1
