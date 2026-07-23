-- Migration: e69_derm_extensions_down.sql
-- Description: Reverses the dermatology extensions migration.

BEGIN;

DROP TABLE IF EXISTS derm_cosmetic_logs;
DROP TABLE IF EXISTS derm_lesion_records;

COMMIT;
