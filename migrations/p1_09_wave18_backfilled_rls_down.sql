-- p1_09_wave18_backfilled_rls_down.sql
-- Wave 18 — Reverse: drop RLS + policy from the 5 backfilled tables.
BEGIN;

DO $$
DECLARE
  tbl text;
  tables text[] := ARRAY[
    'pharmacy_drug_catalog', 'tenant_plan_assignments',
    'company_settings', 'dental_records', 'user_tenants'
  ];
BEGIN
  FOREACH tbl IN ARRAY tables LOOP
    EXECUTE format('DROP POLICY IF EXISTS rls_%I_tenant_isolation ON %I', tbl, tbl);
    EXECUTE format('ALTER TABLE %I DISABLE ROW LEVEL SECURITY', tbl);
    EXECUTE format('ALTER TABLE %I NO FORCE ROW LEVEL SECURITY', tbl);
  END LOOP;
END $$;

COMMIT;
