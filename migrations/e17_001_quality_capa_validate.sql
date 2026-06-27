-- ============================================================================
-- Epic E17 — Quality / CAPA / Risk migration VALIDATE.
-- Asserts FORCE RLS + canonical policy + tenant_id NOT NULL + FK(tenants) on the
-- 2 new tables, entity FK to quality_incidents, and the E17 incident columns.
-- Raises an exception on failure.
-- ============================================================================
DO $$
DECLARE
    tbls TEXT[] := ARRAY['quality_capa','quality_risk_register'];
    t TEXT;
    cols TEXT[] := ARRAY['harm_level','near_miss','confidential','encounter_id','visit_id','workflow_state'];
    c TEXT;
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
        -- entity FK: each new table must reference quality_incidents(id)
        IF NOT EXISTS (
            SELECT 1 FROM pg_constraint c2
            JOIN pg_class rel ON rel.oid = c2.conrelid
            WHERE rel.relname = t AND c2.contype = 'f' AND c2.confrelid = 'quality_incidents'::regclass
        ) THEN
            RAISE EXCEPTION 'E17 validate: FK to quality_incidents(id) missing on %', t;
        END IF;
    END LOOP;

    -- E17 incident-management columns present on quality_incidents
    FOREACH c IN ARRAY cols LOOP
        IF NOT EXISTS (SELECT 1 FROM information_schema.columns WHERE table_name = 'quality_incidents' AND column_name = c) THEN
            RAISE EXCEPTION 'E17 validate: quality_incidents.% missing', c;
        END IF;
    END LOOP;

    RAISE NOTICE 'E17 validate: OK — quality_capa + quality_risk_register FORCE RLS + canonical policy + tenant_id NOT NULL + FK(tenants) + FK(quality_incidents); incident columns present';
END $$;
