-- e49_result_acknowledgements_candidate_validate.sql — post-apply validation.
DO $$
DECLARE
    rls_forced BOOLEAN;
BEGIN
    IF to_regclass('public.result_acknowledgements') IS NULL THEN
        RAISE EXCEPTION 'Validation failed: result_acknowledgements does not exist';
    END IF;

    SELECT relforcerowsecurity INTO rls_forced FROM pg_class WHERE relname = 'result_acknowledgements';
    IF NOT rls_forced THEN
        RAISE EXCEPTION 'Validation failed: FORCE RLS not enabled on result_acknowledgements';
    END IF;

    IF NOT EXISTS (
        SELECT 1 FROM pg_policies
        WHERE schemaname = 'public' AND tablename = 'result_acknowledgements'
          AND policyname = 'rls_result_ack_tenant_isolation'
    ) THEN
        RAISE EXCEPTION 'Validation failed: tenant isolation policy missing';
    END IF;

    IF NOT EXISTS (
        SELECT 1 FROM pg_constraint
        WHERE conname = 'uq_result_ack' AND conrelid = 'result_acknowledgements'::regclass
    ) THEN
        RAISE EXCEPTION 'Validation failed: uq_result_ack unique constraint missing';
    END IF;

    RAISE NOTICE 'e49 validate OK';
END $$;
