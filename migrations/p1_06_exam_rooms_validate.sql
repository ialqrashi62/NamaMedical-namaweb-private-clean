-- ============================================================================
-- P1 PHASE exam_rooms PROVISIONING — VALIDATE
-- Asserts that exam_rooms has been created and configured successfully.
-- ============================================================================
DO $$
BEGIN
    -- 1. Assert table exists
    IF NOT EXISTS (SELECT 1 FROM information_schema.tables WHERE table_name = 'exam_rooms') THEN
        RAISE EXCEPTION 'P1 Validate Error: exam_rooms table is missing';
    END IF;

    -- 2. Assert columns exist
    IF NOT EXISTS (SELECT 1 FROM information_schema.columns WHERE table_name = 'exam_rooms' AND column_name = 'room_number') THEN
        RAISE EXCEPTION 'P1 Validate Error: exam_rooms.room_number is missing';
    END IF;

    -- 3. Assert RLS is enabled and forced
    IF NOT EXISTS (
        SELECT 1 FROM pg_class c JOIN pg_namespace n ON n.oid = c.relnamespace
        WHERE c.relname = 'exam_rooms' AND n.nspname = 'public'
          AND c.relrowsecurity = TRUE AND c.relforcerowsecurity = TRUE
    ) THEN
        RAISE EXCEPTION 'P1 Validate Error: RLS or FORCE RLS not enabled on exam_rooms';
    END IF;

    -- 4. Assert policy exists
    IF NOT EXISTS (
        SELECT 1 FROM pg_policies 
        WHERE tablename = 'exam_rooms' AND policyname = 'rls_exam_rooms_tenant_isolation'
    ) THEN
        RAISE EXCEPTION 'P1 Validate Error: rls_exam_rooms_tenant_isolation policy missing on exam_rooms';
    END IF;

    -- 5. Assert seed rows exist
    IF (SELECT count(*) FROM exam_rooms WHERE tenant_id = 1) = 0 THEN
        RAISE EXCEPTION 'P1 Validate Error: Default seed exam_rooms are missing for Tenant 1';
    END IF;

    RAISE NOTICE 'P1 exam_rooms PROVISIONING validate: OK — Table, columns, RLS, and seed data verified successfully.';
END $$;
