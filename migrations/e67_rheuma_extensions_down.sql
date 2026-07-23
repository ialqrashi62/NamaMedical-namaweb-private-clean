-- Migration: e67_rheuma_extensions_down.sql
-- Description: Reverses the rheumatology extensions migration.

BEGIN;

DROP TABLE IF EXISTS autoimmune_markers;
DROP TABLE IF EXISTS rheuma_scores;

COMMIT;
