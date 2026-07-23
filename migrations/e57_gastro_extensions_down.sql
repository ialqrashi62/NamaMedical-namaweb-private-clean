-- Migration: e57_gastro_extensions_down.sql
-- Description: Reverses the gastroenterology extensions migration.

BEGIN;

DROP TABLE IF EXISTS gi_motility_studies;
DROP TABLE IF EXISTS hepatology_metrics;
DROP TABLE IF EXISTS gastro_endoscopy_reports;

COMMIT;
