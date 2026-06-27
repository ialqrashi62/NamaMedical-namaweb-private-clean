-- e5_01_drug_batches_validate.sql  (run AFTER e5_01_drug_batches_up.sql; read-only)
-- PASS = drug_batches exists with tenant_id FK + NOT NULL + FORCE RLS + isolation policy + FEFO indexes + qty CHECK.

SELECT
  (SELECT count(*) FROM information_schema.tables WHERE table_name='drug_batches') AS drug_batches_exists,            -- expect 1
  (SELECT count(*) FROM information_schema.columns
     WHERE table_name='drug_batches'
       AND column_name IN ('tenant_id','branch_id','drug_id','drug_name','lot','expiry_date','qty_received','qty_on_hand','cost_price','supplier_id','received_at')) AS drug_batches_cols, -- expect 11
  (SELECT relforcerowsecurity FROM pg_class WHERE relname='drug_batches') AS drug_batches_force_rls,                  -- expect t
  (SELECT count(*) FROM pg_policies WHERE tablename='drug_batches' AND policyname='rls_drug_batches_tenant_isolation') AS drug_batches_policy, -- expect 1
  (SELECT count(*) FROM pg_constraint WHERE conname='chk_drug_batches_qty') AS drug_batches_qty_check,                -- expect 1
  (SELECT count(*) FROM pg_indexes WHERE tablename='drug_batches' AND indexname='idx_drug_batches_tenant_id') AS drug_batches_tenant_idx, -- expect 1
  (SELECT count(*) FROM pg_indexes WHERE tablename='drug_batches' AND indexname='idx_drug_batches_fefo') AS drug_batches_fefo_idx; -- expect 1

-- ----- tenant_id is NOT NULL ; expiry_date is NOT NULL -----
SELECT
  (SELECT count(*)::int FROM information_schema.columns
     WHERE table_name='drug_batches' AND column_name='tenant_id' AND is_nullable='NO') AS tenant_id_not_null,         -- expect 1
  (SELECT count(*)::int FROM information_schema.columns
     WHERE table_name='drug_batches' AND column_name='expiry_date' AND is_nullable='NO') AS expiry_date_not_null;     -- expect 1

-- ----- FK to tenants(id) -----
SELECT count(*)::int AS fk_to_tenants FROM pg_constraint
  WHERE conrelid='drug_batches'::regclass AND confrelid='tenants'::regclass AND contype='f';                          -- expect 1
