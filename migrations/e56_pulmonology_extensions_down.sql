-- Migration: e56_pulmonology_extensions_down.sql
-- Description: Reverses the pulmonology extensions migration.

BEGIN;

DROP TABLE IF EXISTS bronchoscopy_reports;
DROP TABLE IF EXISTS sleep_study_results;
DROP TABLE IF EXISTS pulmonary_function_tests;

COMMIT;
