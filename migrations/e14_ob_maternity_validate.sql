-- ============================================================================
-- Epic E14 — OB / Maternity migration (VALIDATE)  [CANDIDATE — DO NOT EXECUTE here]
-- Asserts: all 8 obgyn_* tables exist with FORCE RLS + canonical isolation policy,
-- tenant_id is NOT NULL and FK -> tenants(id), the entity FK exists, and there are
-- no orphan / null-tenant rows. RAISE EXCEPTION (fail-closed) on any violation.
-- ============================================================================

DO $$
DECLARE
    t TEXT;
    tbls TEXT[] := ARRAY['obgyn_pregnancies','obgyn_antenatal_visits','obgyn_partogram',
        'obgyn_ultrasounds','obgyn_deliveries','obgyn_neonatal','obgyn_nst','obgyn_lab_panels'];
    n INTEGER;
BEGIN
    FOREACH t IN ARRAY tbls LOOP
        -- table exists
        IF NOT EXISTS (SELECT 1 FROM information_schema.tables WHERE table_name = t) THEN
            RAISE EXCEPTION 'E14 validate: missing table %', t;
        END IF;

        -- FORCE RLS enabled
        SELECT COUNT(*) INTO n FROM pg_class WHERE relname = t AND relrowsecurity AND relforcerowsecurity;
        IF n <> 1 THEN
            RAISE EXCEPTION 'E14 validate: FORCE RLS not enabled on %', t;
        END IF;

        -- canonical isolation policy present
        IF NOT EXISTS (SELECT 1 FROM pg_policies WHERE tablename = t AND policyname = t || '_tenant_isolation') THEN
            RAISE EXCEPTION 'E14 validate: tenant isolation policy missing on %', t;
        END IF;

        -- tenant_id NOT NULL
        IF EXISTS (SELECT 1 FROM information_schema.columns
                   WHERE table_name = t AND column_name = 'tenant_id' AND is_nullable = 'YES') THEN
            RAISE EXCEPTION 'E14 validate: tenant_id is nullable on %', t;
        END IF;

        -- tenant_id FK -> tenants
        IF NOT EXISTS (
            SELECT 1 FROM information_schema.table_constraints tc
            JOIN information_schema.key_column_usage kcu ON tc.constraint_name = kcu.constraint_name
            JOIN information_schema.constraint_column_usage ccu ON tc.constraint_name = ccu.constraint_name
            WHERE tc.constraint_type = 'FOREIGN KEY' AND tc.table_name = t
              AND kcu.column_name = 'tenant_id' AND ccu.table_name = 'tenants') THEN
            RAISE EXCEPTION 'E14 validate: tenant_id FK -> tenants missing on %', t;
        END IF;
    END LOOP;

    -- entity FK presence (parent linkage) per table
    IF NOT EXISTS (SELECT 1 FROM information_schema.table_constraints tc
        JOIN information_schema.key_column_usage kcu ON tc.constraint_name = kcu.constraint_name
        WHERE tc.constraint_type='FOREIGN KEY' AND tc.table_name='obgyn_pregnancies' AND kcu.column_name='patient_id') THEN
        RAISE EXCEPTION 'E14 validate: obgyn_pregnancies.patient_id FK missing';
    END IF;
    IF NOT EXISTS (SELECT 1 FROM information_schema.table_constraints tc
        JOIN information_schema.key_column_usage kcu ON tc.constraint_name = kcu.constraint_name
        WHERE tc.constraint_type='FOREIGN KEY' AND tc.table_name='obgyn_neonatal' AND kcu.column_name='delivery_id') THEN
        RAISE EXCEPTION 'E14 validate: obgyn_neonatal.delivery_id FK missing';
    END IF;

    -- no null-tenant rows anywhere
    FOREACH t IN ARRAY tbls LOOP
        EXECUTE format('SELECT COUNT(*) FROM %I WHERE tenant_id IS NULL', t) INTO n;
        IF n > 0 THEN RAISE EXCEPTION 'E14 validate: % has % null-tenant rows', t, n; END IF;
    END LOOP;

    -- no orphan antenatal/delivery/neonatal rows
    SELECT COUNT(*) INTO n FROM obgyn_antenatal_visits a
        WHERE NOT EXISTS (SELECT 1 FROM obgyn_pregnancies p WHERE p.id = a.pregnancy_id);
    IF n > 0 THEN RAISE EXCEPTION 'E14 validate: % orphan antenatal_visits', n; END IF;
    SELECT COUNT(*) INTO n FROM obgyn_neonatal nn
        WHERE NOT EXISTS (SELECT 1 FROM obgyn_deliveries d WHERE d.id = nn.delivery_id);
    IF n > 0 THEN RAISE EXCEPTION 'E14 validate: % orphan neonatal', n; END IF;
    -- no orphan partogram/ultrasound/nst/delivery rows (pregnancy linkage)
    SELECT COUNT(*) INTO n FROM obgyn_partogram pt
        WHERE NOT EXISTS (SELECT 1 FROM obgyn_pregnancies p WHERE p.id = pt.pregnancy_id);
    IF n > 0 THEN RAISE EXCEPTION 'E14 validate: % orphan partogram', n; END IF;
    SELECT COUNT(*) INTO n FROM obgyn_ultrasounds us
        WHERE NOT EXISTS (SELECT 1 FROM obgyn_pregnancies p WHERE p.id = us.pregnancy_id);
    IF n > 0 THEN RAISE EXCEPTION 'E14 validate: % orphan ultrasounds', n; END IF;
    SELECT COUNT(*) INTO n FROM obgyn_nst ns
        WHERE NOT EXISTS (SELECT 1 FROM obgyn_pregnancies p WHERE p.id = ns.pregnancy_id);
    IF n > 0 THEN RAISE EXCEPTION 'E14 validate: % orphan nst', n; END IF;
    SELECT COUNT(*) INTO n FROM obgyn_deliveries dv
        WHERE NOT EXISTS (SELECT 1 FROM obgyn_pregnancies p WHERE p.id = dv.pregnancy_id);
    IF n > 0 THEN RAISE EXCEPTION 'E14 validate: % orphan deliveries', n; END IF;

    RAISE NOTICE 'E14 validate: OK — 8 obgyn_* tables, FORCE RLS + canonical policy, tenant_id NOT NULL + FK, entity FKs, no orphans/null-tenant rows.';
END $$;
