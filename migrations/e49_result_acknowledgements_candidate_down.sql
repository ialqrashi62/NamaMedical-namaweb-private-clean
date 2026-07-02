-- e49_result_acknowledgements_candidate_down.sql — rollback for the e49 candidate.
-- Dropping this table erases the acknowledgement audit trail — only acceptable while
-- the feature has never been live. If any rows exist, archive them first.
BEGIN;
DROP TABLE IF EXISTS result_acknowledgements;
COMMIT;
