-- ex_02_rbac_validate.sql  (run AFTER ex_02_rbac_up.sql; read-only)
-- PASS = permissions (global, UNIQUE key) + role_permissions (tenant_id FK + FORCE RLS + isolation policy + unique + index).

-- ----- permissions (global catalog) -----
SELECT
  (SELECT count(*) FROM information_schema.tables WHERE table_name='permissions') AS permissions_exists,          -- expect 1
  (SELECT count(*) FROM information_schema.columns
     WHERE table_name='permissions' AND column_name IN ('key','description')) AS permissions_cols,                -- expect 2
  (SELECT count(*) FROM pg_constraint WHERE conname='uq_permissions_key') AS permissions_key_unique;             -- expect 1

-- ----- role_permissions (tenant-scoped matrix) -----
SELECT
  (SELECT count(*) FROM information_schema.tables WHERE table_name='role_permissions') AS rp_exists,              -- expect 1
  (SELECT count(*) FROM information_schema.columns
     WHERE table_name='role_permissions' AND column_name IN ('tenant_id','role','permission_key')) AS rp_cols,    -- expect 3
  (SELECT relforcerowsecurity FROM pg_class WHERE relname='role_permissions') AS rp_force_rls,                    -- expect t
  (SELECT count(*) FROM pg_policies
     WHERE tablename='role_permissions' AND policyname='rls_role_permissions_tenant_isolation') AS rp_policy,      -- expect 1
  (SELECT count(*) FROM pg_constraint WHERE conname='uq_role_permission') AS rp_unique,                           -- expect 1
  (SELECT count(*) FROM pg_indexes
     WHERE tablename='role_permissions' AND indexname='idx_role_permissions_tenant_id') AS rp_idx;                -- expect 1

-- ----- FK role_permissions -> tenants(id) -----
SELECT count(*)::int AS rp_fk_to_tenants FROM pg_constraint
  WHERE conrelid='role_permissions'::regclass AND confrelid='tenants'::regclass AND contype='f';                  -- expect 1
