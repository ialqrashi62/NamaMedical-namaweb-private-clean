-- Migration: e100_pulmonology_core_down.sql
-- Description: Revert Pulmonology Core Schema

BEGIN;

DROP TABLE IF EXISTS pulmonology_bronchoscopy;
DROP TABLE IF EXISTS pulmonology_sleep_studies;
DROP TABLE IF EXISTS pulmonology_pft_results;
DROP TABLE IF EXISTS pulmonology_encounters;

COMMIT;
