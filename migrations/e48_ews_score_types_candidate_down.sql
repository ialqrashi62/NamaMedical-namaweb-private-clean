-- e48_ews_score_types_candidate_down.sql — rollback for the e48 candidate.
-- Restores the original 4-type CHECK. WILL FAIL (by design) if any rows already
-- use the new EWS types — delete/migrate those rows deliberately first; the
-- constraint must never be dropped silently over live clinical rows.

BEGIN;

ALTER TABLE nursing_scores DROP CONSTRAINT IF EXISTS chk_nursing_score_type;
ALTER TABLE nursing_scores ADD CONSTRAINT chk_nursing_score_type
    CHECK (score_type IN ('morse', 'braden', 'news', 'pain'));

COMMIT;
