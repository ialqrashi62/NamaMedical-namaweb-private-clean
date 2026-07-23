-- Migration: e65_oncology_extensions_down.sql
-- Description: Reverses the oncology extensions migration.

BEGIN;

DROP TABLE IF EXISTS bmt_monitoring;
DROP TABLE IF EXISTS oncology_chemo_logs;

COMMIT;
