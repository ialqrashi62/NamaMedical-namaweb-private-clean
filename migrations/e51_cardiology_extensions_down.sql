-- Migration: e50_cardiology_extensions_down.sql
-- Description: Reverses the cardiology extensions migration.

BEGIN;

DROP TABLE IF EXISTS nuclear_imaging_results;
DROP TABLE IF EXISTS ep_mapping_data;
DROP TABLE IF EXISTS cardiology_procedures;

COMMIT;
