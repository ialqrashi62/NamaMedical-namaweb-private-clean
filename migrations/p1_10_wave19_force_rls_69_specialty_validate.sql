-- =====================================================================
-- p1_10_wave19_force_rls_69_specialty_validate.sql
-- Read-only validation: confirms every public RLS-enabled table is also
-- FORCE-enabled. Run after the up migration. Safe to re-run.
-- =====================================================================
SET search_path = public;

DO $v$
DECLARE
    total_rls  int;
    not_forced int;
    r          record;
BEGIN
    SELECT count(*)
      INTO total_rls
      FROM pg_class c
      JOIN pg_namespace n ON n.oid = c.relnamespace
     WHERE n.nspname='public' AND c.relkind='r' AND c.relrowsecurity=true;

    SELECT count(*)
      INTO not_forced
      FROM pg_class c
      JOIN pg_namespace n ON n.oid = c.relnamespace
     WHERE n.nspname='public' AND c.relkind='r' AND c.relrowsecurity=true
       AND COALESCE(c.relforcerowsecurity,false)=false;

    RAISE NOTICE 'Wave 19 validate: total RLS-enabled public tables = %', total_rls;
    RAISE NOTICE 'Wave 19 validate: RLS-enabled but NOT FORCED        = %', not_forced;

    IF not_forced > 0 THEN
        FOR r IN
            SELECT c.relname
              FROM pg_class c
              JOIN pg_namespace n ON n.oid = c.relnamespace
             WHERE n.nspname='public' AND c.relkind='r' AND c.relrowsecurity=true
               AND COALESCE(c.relforcerowsecurity,false)=false
             ORDER BY c.relname
        LOOP
            RAISE WARNING '  -> % still NOT forced', r.relname;
        END LOOP;
        RAISE EXCEPTION 'Wave 19 validate FAILED: % tables not forced', not_forced;
    END IF;

    RAISE NOTICE 'Wave 19 validate: PASS - every RLS-enabled public table is FORCED';
END
$v$;
