-- ============================================================================
-- Epic E17 — Infection Control migration VALIDATE.
-- Asserts FORCE RLS + canonical policy + tenant_id NOT NULL + FK(tenants) and
-- entity FK to patients(id) on hai_isolation and ams_flags.
-- Raises an exception on failure.
-- ============================================================================
DO $$
DECLARE
    tbls TEXT[] := ARRAY['hai_isolation','ams_flags'];
    t TEXT;
BEGIN
    FOREACH t IN ARRAY tbls LOOP
        IF to_regclass('public.' || t) IS NULL THEN
            RAISE EXCEPTION 'E17 validate: table % missing', t;
        END IF;
        IF NOT EXISTS (SELECT 1 FROM pg_class WHERE relname = t AND relrowsecurity AND relforcerowsecurity) THEN
            RAISE EXCEPTION 'E17 validate: FORCE RLS not enabled on %', t;
        END IF;
        IF NOT EXISTS (SELECT 1 FROM pg_policies WHERE tablename = t AND policyname = 'rls_' || t || '_tenant_isolation') THEN
            RAISE EXCEPTION 'E17 validate: tenant isolation policy missing on %', t;
        END IF;
        IF EXISTS (SELECT 1 FROM information_schema.columns WHERE table_name = t AND column_name = 'tenant_id' AND is_nullable = 'YES') THEN
            RAISE EXCEPTION 'E17 validate: tenant_id is nullable on %', t;
        END IF;
        IF NOT EXISTS (
            SELECT 1 FROM pg_constraint c2
            JOIN pg_class rel ON rel.oid = c2.conrelid
            WHERE rel.relname = t AND c2.contype = 'f' AND c2.confrelid = 'tenants'::regclass
        ) THEN
            RAISE EXCEPTION 'E17 validate: FK to tenants(id) missing on %', t;
        END IF;
        IF NOT EXISTS (
            SELECT 1 FROM pg_constraint c2
            JOIN pg_class rel ON rel.oid = c2.conrelid
            WHERE rel.relname = t AND c2.contype = 'f' AND c2.confrelid = 'patients'::regclass
        ) THEN
            RAISE EXCEPTION 'E17 validate: FK to patients(id) missing on %', t;
        END IF;
    END LOOP;
    RAISE NOTICE 'E17 validate: OK — hai_isolation + ams_flags FORCE RLS + canonical policy + tenant_id NOT NULL + FK(tenants) + FK(patients)';
END $$;
