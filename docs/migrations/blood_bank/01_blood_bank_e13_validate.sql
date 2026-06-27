-- ============================================================================
-- E13 BLOOD BANK — candidate migration (VALIDATE)
-- ============================================================================
-- Emits a row for every UNMET invariant. A clean run returns ZERO rows.
-- Asserts, for each E13 table: tenant_id exists + NOT NULL, FK to tenants(id),
-- relrowsecurity (RLS enabled) AND relforcerowsecurity (FORCE), and the
-- canonical tenant-isolation policy is present.

WITH expected(tbl, policy) AS (
  VALUES
    ('blood_bank_units',                  'rls_blood_bank_units_tenant_isolation'),
    ('blood_bank_donors',                 'rls_blood_bank_donors_tenant_isolation'),
    ('blood_bank_crossmatch',             'rls_blood_bank_crossmatch_tenant_isolation'),
    ('blood_bank_transfusions',           'rls_blood_bank_transfusions_tenant_isolation'),
    ('blood_bank_transfusion_reactions',  'rls_blood_bank_transfusion_reactions_tenant_isolation')
)
-- 1) tenant_id column present + NOT NULL
SELECT e.tbl AS table_name, 'tenant_id missing or NULLABLE' AS violation
FROM expected e
WHERE NOT EXISTS (
  SELECT 1 FROM information_schema.columns c
  WHERE c.table_name = e.tbl AND c.column_name = 'tenant_id' AND c.is_nullable = 'NO'
)
UNION ALL
-- 2) FK from tenant_id -> tenants(id)
SELECT e.tbl, 'tenant_id FK to tenants(id) missing'
FROM expected e
WHERE NOT EXISTS (
  SELECT 1
  FROM pg_constraint con
  JOIN pg_class rel  ON rel.oid = con.conrelid
  JOIN pg_class frel ON frel.oid = con.confrelid
  WHERE con.contype = 'f' AND rel.relname = e.tbl AND frel.relname = 'tenants'
)
UNION ALL
-- 3) RLS enabled AND forced
SELECT e.tbl, 'RLS not ENABLED+FORCED'
FROM expected e
WHERE NOT EXISTS (
  SELECT 1 FROM pg_class rel
  WHERE rel.relname = e.tbl AND rel.relrowsecurity = true AND rel.relforcerowsecurity = true
)
UNION ALL
-- 4) canonical tenant-isolation policy present
SELECT e.tbl, 'canonical tenant-isolation policy missing'
FROM expected e
WHERE NOT EXISTS (
  SELECT 1 FROM pg_policies p
  WHERE p.tablename = e.tbl AND p.policyname = e.policy
);
