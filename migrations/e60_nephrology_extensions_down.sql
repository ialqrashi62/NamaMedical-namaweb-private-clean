-- Migration: e60_nephrology_extensions_down.sql
-- Description: Reverses the nephrology extensions migration.

BEGIN;

DROP TABLE IF EXISTS nephrology_labs;
DROP TABLE IF EXISTS renal_transplant_records;
DROP TABLE IF EXISTS dialysis_sessions;

COMMIT;
