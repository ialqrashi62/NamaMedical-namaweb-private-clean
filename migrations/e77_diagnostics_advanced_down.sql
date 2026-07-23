-- Migration: e77_diagnostics_advanced_down.sql
-- Purpose: Reverse changes from e77_diagnostics_advanced_up.sql

BEGIN;

DROP TABLE IF EXISTS pathology_digital_logs;
DROP TABLE IF EXISTS nuclear_med_logs;
DROP TABLE IF EXISTS radiology_advanced_metrics;
DROP TABLE IF EXISTS diag_molecular_logs;

COMMIT;
