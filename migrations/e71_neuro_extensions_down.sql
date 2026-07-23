-- Migration: e71_neuro_extensions_down.sql
-- Description: Reverses the neurosurgery extensions migration.

BEGIN;

DROP TABLE IF EXISTS spine_fusion_records;
DROP TABLE IF EXISTS neuro_surgery_sessions;

COMMIT;
