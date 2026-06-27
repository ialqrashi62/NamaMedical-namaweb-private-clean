-- ============================================================================
-- Epic E12 — Surgery / OR migration VALIDATE.
-- Asserts: FORCE RLS enabled, canonical tenant policy present, tenant_id NOT NULL,
-- and FK to tenants(id) exists for each new table. Raises an exception on failure.
-- ============================================================================
DO $$
DECLARE
    tbls TEXT[] := ARRAY['or_slots','who_surgical_checklist','pacu_records','operative_notes','or_consumption'];
    t TEXT;
BEGIN
    FOREACH t IN ARRAY tbls LOOP
        -- table exists
        IF to_regclass('public.' || t) IS NULL THEN
            RAISE EXCEPTION 'E12 validate: table % missing', t;
        END IF;
        -- FORCE RLS enabled (relforcerowsecurity)
        IF NOT EXISTS (SELECT 1 FROM pg_class WHERE relname = t AND relrowsecurity AND relforcerowsecurity) THEN
            RAISE EXCEPTION 'E12 validate: FORCE RLS not enabled on %', t;
        END IF;
        -- canonical tenant isolation policy present
        IF NOT EXISTS (SELECT 1 FROM pg_policies WHERE tablename = t AND policyname = 'rls_' || t || '_tenant_isolation') THEN
            RAISE EXCEPTION 'E12 validate: tenant isolation policy missing on %', t;
        END IF;
        -- tenant_id is NOT NULL
        IF EXISTS (SELECT 1 FROM information_schema.columns WHERE table_name = t AND column_name = 'tenant_id' AND is_nullable = 'YES') THEN
            RAISE EXCEPTION 'E12 validate: tenant_id is nullable on %', t;
        END IF;
        -- FK from tenant_id -> tenants(id)
        IF NOT EXISTS (
            SELECT 1 FROM pg_constraint c
            JOIN pg_class rel ON rel.oid = c.conrelid
            WHERE rel.relname = t AND c.contype = 'f'
              AND c.confrelid = 'tenants'::regclass
        ) THEN
            RAISE EXCEPTION 'E12 validate: FK to tenants(id) missing on %', t;
        END IF;
    END LOOP;
    -- entity FK: each table must reference surgeries(id)
    FOREACH t IN ARRAY tbls LOOP
        IF NOT EXISTS (
            SELECT 1 FROM pg_constraint c
            JOIN pg_class rel ON rel.oid = c.conrelid
            WHERE rel.relname = t AND c.contype = 'f'
              AND c.confrelid = 'surgeries'::regclass
        ) THEN
            RAISE EXCEPTION 'E12 validate: FK to surgeries(id) missing on %', t;
        END IF;
    END LOOP;
    RAISE NOTICE 'E12 validate: OK — all 5 tables have FORCE RLS + canonical policy + tenant_id NOT NULL + FK(tenants) + FK(surgeries)';
END $$;
