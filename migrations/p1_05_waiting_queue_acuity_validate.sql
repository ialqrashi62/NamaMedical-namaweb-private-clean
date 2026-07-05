-- ============================================================================
-- P1 PHASE waiting_queue ACUITY — VALIDATE
-- Asserts that waiting_queue and visit_lifecycle have all new features, policies, constraints, and RLS.
-- ============================================================================
DO $$
BEGIN
    -- 1. Assert visit_lifecycle table and RLS exist
    IF NOT EXISTS (SELECT 1 FROM information_schema.tables WHERE table_name = 'visit_lifecycle') THEN
        RAISE EXCEPTION 'P1 Validate Error: visit_lifecycle table is missing';
    END IF;

    IF NOT EXISTS (
        SELECT 1 FROM pg_class c JOIN pg_namespace n ON n.oid = c.relnamespace
        WHERE c.relname = 'visit_lifecycle' AND n.nspname = 'public'
          AND c.relrowsecurity = TRUE AND c.relforcerowsecurity = TRUE
    ) THEN
        RAISE EXCEPTION 'P1 Validate Error: RLS or FORCE RLS not enabled on visit_lifecycle';
    END IF;

    IF NOT EXISTS (
        SELECT 1 FROM pg_policies 
        WHERE tablename = 'visit_lifecycle' AND policyname = 'rls_visit_lifecycle_tenant_isolation'
    ) THEN
        RAISE EXCEPTION 'P1 Validate Error: rls_visit_lifecycle_tenant_isolation policy missing on visit_lifecycle';
    END IF;

    -- 2. Assert waiting_queue columns exist
    IF NOT EXISTS (SELECT 1 FROM information_schema.columns WHERE table_name = 'waiting_queue' AND column_name = 'triage_level') THEN
        RAISE EXCEPTION 'P1 Validate Error: waiting_queue.triage_level is missing';
    END IF;
    
    IF NOT EXISTS (SELECT 1 FROM information_schema.columns WHERE table_name = 'waiting_queue' AND column_name = 'acuity_notes') THEN
        RAISE EXCEPTION 'P1 Validate Error: waiting_queue.acuity_notes is missing';
    END IF;

    IF NOT EXISTS (SELECT 1 FROM information_schema.columns WHERE table_name = 'waiting_queue' AND column_name = 'exam_room_id') THEN
        RAISE EXCEPTION 'P1 Validate Error: waiting_queue.exam_room_id is missing';
    END IF;

    -- 3. Assert RLS is enabled and forced on waiting_queue
    IF NOT EXISTS (
        SELECT 1 FROM pg_class c JOIN pg_namespace n ON n.oid = c.relnamespace
        WHERE c.relname = 'waiting_queue' AND n.nspname = 'public'
          AND c.relrowsecurity = TRUE AND c.relforcerowsecurity = TRUE
    ) THEN
        RAISE EXCEPTION 'P1 Validate Error: RLS or FORCE RLS not enabled on waiting_queue';
    END IF;

    -- 4. Assert canonical tenant isolation policy exists
    IF NOT EXISTS (
        SELECT 1 FROM pg_policies 
        WHERE tablename = 'waiting_queue' AND policyname = 'rls_waiting_queue_tenant_isolation'
    ) THEN
        RAISE EXCEPTION 'P1 Validate Error: rls_waiting_queue_tenant_isolation policy missing on waiting_queue';
    END IF;

    -- 5. Assert check constraint exists
    IF NOT EXISTS (
        SELECT 1 FROM information_schema.table_constraints
        WHERE table_name = 'waiting_queue' AND constraint_name = 'chk_waiting_queue_status' AND constraint_type = 'CHECK'
    ) THEN
        RAISE EXCEPTION 'P1 Validate Error: chk_waiting_queue_status constraint missing on waiting_queue';
    END IF;

    -- 6. Assert tenant_id FK to tenants exists
    IF NOT EXISTS (
        SELECT 1 FROM information_schema.table_constraints tc
        JOIN information_schema.constraint_column_usage ccu ON tc.constraint_name = ccu.constraint_name
        WHERE tc.constraint_type = 'FOREIGN KEY' AND tc.table_name = 'waiting_queue' AND ccu.table_name = 'tenants'
    ) THEN
        RAISE EXCEPTION 'P1 Validate Error: tenant_id FK -> tenants missing on waiting_queue';
    END IF;

    RAISE NOTICE 'P1 waiting_queue ACUITY validate: OK — All tables, columns, constraints, and RLS verified successfully.';
END $$;
