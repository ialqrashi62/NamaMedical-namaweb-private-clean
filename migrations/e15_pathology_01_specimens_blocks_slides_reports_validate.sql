-- ============================================================================
-- E15 PATHOLOGY — VALIDATE (asserts: tables exist, FORCE RLS on, canonical
-- policy present, tenant_id NOT NULL + FK to tenants, entity FK present).
-- Raises EXCEPTION on any failure so the controlled runner aborts.
-- ============================================================================
DO $$
DECLARE
    t TEXT;
    tbls TEXT[] := ARRAY['path_specimens','path_blocks','path_slides','path_reports'];
BEGIN
    FOREACH t IN ARRAY tbls LOOP
        -- table exists
        IF NOT EXISTS (SELECT 1 FROM information_schema.tables
                       WHERE table_name = t AND table_schema = 'public') THEN
            RAISE EXCEPTION 'E15 validate: table % missing', t;
        END IF;

        -- RLS enabled AND forced
        IF NOT EXISTS (SELECT 1 FROM pg_class c JOIN pg_namespace n ON n.oid=c.relnamespace
                       WHERE c.relname = t AND n.nspname='public'
                         AND c.relrowsecurity = TRUE AND c.relforcerowsecurity = TRUE) THEN
            RAISE EXCEPTION 'E15 validate: FORCE ROW LEVEL SECURITY not set on %', t;
        END IF;

        -- canonical tenant-isolation policy present
        IF NOT EXISTS (SELECT 1 FROM pg_policies
                       WHERE tablename = t AND policyname = t || '_tenant_isolation') THEN
            RAISE EXCEPTION 'E15 validate: tenant isolation policy missing on %', t;
        END IF;

        -- tenant_id present and NOT NULL
        IF NOT EXISTS (SELECT 1 FROM information_schema.columns
                       WHERE table_name = t AND column_name = 'tenant_id'
                         AND is_nullable = 'NO') THEN
            RAISE EXCEPTION 'E15 validate: tenant_id NOT NULL missing on %', t;
        END IF;

        -- tenant_id FK -> tenants
        IF NOT EXISTS (
            SELECT 1 FROM information_schema.table_constraints tc
            JOIN information_schema.key_column_usage kcu ON tc.constraint_name = kcu.constraint_name
            JOIN information_schema.constraint_column_usage ccu ON tc.constraint_name = ccu.constraint_name
            WHERE tc.constraint_type = 'FOREIGN KEY' AND tc.table_name = t
              AND kcu.column_name = 'tenant_id' AND ccu.table_name = 'tenants'
        ) THEN
            RAISE EXCEPTION 'E15 validate: tenant_id FK -> tenants missing on %', t;
        END IF;
    END LOOP;

    -- entity FK chain: specimen->patients, block->specimen, slide->block, report->specimen
    IF NOT EXISTS (
        SELECT 1 FROM information_schema.table_constraints tc
        JOIN information_schema.constraint_column_usage ccu ON tc.constraint_name = ccu.constraint_name
        WHERE tc.constraint_type='FOREIGN KEY' AND tc.table_name='path_specimens' AND ccu.table_name='patients'
    ) THEN RAISE EXCEPTION 'E15 validate: path_specimens.patient_id FK -> patients missing'; END IF;

    IF NOT EXISTS (
        SELECT 1 FROM information_schema.table_constraints tc
        JOIN information_schema.constraint_column_usage ccu ON tc.constraint_name = ccu.constraint_name
        WHERE tc.constraint_type='FOREIGN KEY' AND tc.table_name='path_blocks' AND ccu.table_name='path_specimens'
    ) THEN RAISE EXCEPTION 'E15 validate: path_blocks.specimen_id FK -> path_specimens missing'; END IF;

    IF NOT EXISTS (
        SELECT 1 FROM information_schema.table_constraints tc
        JOIN information_schema.constraint_column_usage ccu ON tc.constraint_name = ccu.constraint_name
        WHERE tc.constraint_type='FOREIGN KEY' AND tc.table_name='path_slides' AND ccu.table_name='path_blocks'
    ) THEN RAISE EXCEPTION 'E15 validate: path_slides.block_id FK -> path_blocks missing'; END IF;

    IF NOT EXISTS (
        SELECT 1 FROM information_schema.table_constraints tc
        JOIN information_schema.constraint_column_usage ccu ON tc.constraint_name = ccu.constraint_name
        WHERE tc.constraint_type='FOREIGN KEY' AND tc.table_name='path_reports' AND ccu.table_name='path_specimens'
    ) THEN RAISE EXCEPTION 'E15 validate: path_reports.specimen_id FK -> path_specimens missing'; END IF;

    -- unique accession per tenant
    IF NOT EXISTS (SELECT 1 FROM pg_constraint WHERE conname = 'uq_path_specimen_accession') THEN
        RAISE EXCEPTION 'E15 validate: UNIQUE(tenant_id, accession_number) missing on path_specimens';
    END IF;

    RAISE NOTICE 'E15 validate: OK — all pathology tables, FORCE RLS, policies, FKs, NOT NULL verified.';
END $$;
