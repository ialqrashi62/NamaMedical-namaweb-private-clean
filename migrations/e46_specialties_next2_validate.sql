-- Validation: Verify OBGYN pregnancies, psychiatric evaluations, and dermatology lesions tables, RLS, and indexes.
DO $$
DECLARE
    v_table_exists BOOLEAN;
    v_rls_enabled BOOLEAN;
    v_index_exists BOOLEAN;
BEGIN
    -- 1. Check obgyn_pregnancies
    SELECT EXISTS (SELECT FROM information_schema.tables WHERE table_name = 'obgyn_pregnancies') INTO v_table_exists;
    IF NOT v_table_exists THEN RAISE EXCEPTION 'Validation failed: table obgyn_pregnancies does not exist'; END IF;

    SELECT relrowsecurity INTO v_rls_enabled FROM pg_class WHERE relname = 'obgyn_pregnancies';
    IF NOT v_rls_enabled THEN RAISE EXCEPTION 'Validation failed: RLS is not enabled on obgyn_pregnancies'; END IF;

    SELECT EXISTS (SELECT FROM pg_indexes WHERE indexname = 'idx_obgyn_pregnancies_patient') INTO v_index_exists;
    IF NOT v_index_exists THEN RAISE EXCEPTION 'Validation failed: index idx_obgyn_pregnancies_patient does not exist'; END IF;

    -- 2. Check psychiatric_evaluations
    SELECT EXISTS (SELECT FROM information_schema.tables WHERE table_name = 'psychiatric_evaluations') INTO v_table_exists;
    IF NOT v_table_exists THEN RAISE EXCEPTION 'Validation failed: table psychiatric_evaluations does not exist'; END IF;

    SELECT relrowsecurity INTO v_rls_enabled FROM pg_class WHERE relname = 'psychiatric_evaluations';
    IF NOT v_rls_enabled THEN RAISE EXCEPTION 'Validation failed: RLS is not enabled on psychiatric_evaluations'; END IF;

    SELECT EXISTS (SELECT FROM pg_indexes WHERE indexname = 'idx_psychiatric_evaluations_patient') INTO v_index_exists;
    IF NOT v_index_exists THEN RAISE EXCEPTION 'Validation failed: index idx_psychiatric_evaluations_patient does not exist'; END IF;

    -- 3. Check dermatology_lesions
    SELECT EXISTS (SELECT FROM information_schema.tables WHERE table_name = 'dermatology_lesions') INTO v_table_exists;
    IF NOT v_table_exists THEN RAISE EXCEPTION 'Validation failed: table dermatology_lesions does not exist'; END IF;

    SELECT relrowsecurity INTO v_rls_enabled FROM pg_class WHERE relname = 'dermatology_lesions';
    IF NOT v_rls_enabled THEN RAISE EXCEPTION 'Validation failed: RLS is not enabled on dermatology_lesions'; END IF;

    SELECT EXISTS (SELECT FROM pg_indexes WHERE indexname = 'idx_dermatology_lesions_patient') INTO v_index_exists;
    IF NOT v_index_exists THEN RAISE EXCEPTION 'Validation failed: index idx_dermatology_lesions_patient does not exist'; END IF;

    RAISE NOTICE 'Validation passed: G21, G24, and G25 module tables and RLS are fully set up';
END;
$$;
