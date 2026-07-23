-- Migration: e62_endocrine_extensions_down.sql
-- Description: Reverses the endocrine extensions migration.

BEGIN;

DROP TABLE IF EXISTS thyroid_metrics;
DROP TABLE IF EXISTS diabetes_logs;

COMMIT;
