-- e48_ews_score_types_candidate_up.sql — CANDIDATE, NOT RUN (requires owner approval).
-- Gate 2: extend nursing_scores.score_type to persist server-computed EWS results
-- (MEWS / PEWS / qSOFA / SIRS / sepsis screen) alongside morse/braden/news/pain.
-- Additive-only: widens a CHECK constraint; no data change, no new table.
-- Rollback: e48_ews_score_types_candidate_down.sql restores the original CHECK
-- (safe only while no rows carry the new types).

BEGIN;

ALTER TABLE nursing_scores DROP CONSTRAINT IF EXISTS chk_nursing_score_type;
ALTER TABLE nursing_scores ADD CONSTRAINT chk_nursing_score_type
    CHECK (score_type IN ('morse', 'braden', 'news', 'pain', 'mews', 'pews', 'qsofa', 'sirs', 'sepsis_screen'));

COMMIT;
