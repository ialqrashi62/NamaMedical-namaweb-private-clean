-- e48_ews_score_types_candidate_validate.sql — post-apply validation for the e48 candidate.
DO $$
DECLARE
    def TEXT;
BEGIN
    SELECT pg_get_constraintdef(oid) INTO def
    FROM pg_constraint
    WHERE conname = 'chk_nursing_score_type' AND conrelid = 'nursing_scores'::regclass;

    IF def IS NULL THEN
        RAISE EXCEPTION 'Validation failed: chk_nursing_score_type missing on nursing_scores';
    END IF;

    IF def NOT LIKE '%mews%' OR def NOT LIKE '%pews%' OR def NOT LIKE '%qsofa%'
       OR def NOT LIKE '%sirs%' OR def NOT LIKE '%sepsis_screen%' THEN
        RAISE EXCEPTION 'Validation failed: EWS score types not present in CHECK: %', def;
    END IF;

    RAISE NOTICE 'e48 validate OK: %', def;
END $$;
