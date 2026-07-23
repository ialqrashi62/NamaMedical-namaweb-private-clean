-- Migration: e101_gastroenterology_core_down.sql
-- Description: Revert Gastroenterology Core Schema

BEGIN;

DROP TABLE IF EXISTS gastro_hepatic_markers;
DROP TABLE IF EXISTS gastro_endoscopy_reports;
DROP TABLE IF EXISTS gastro_encounters;

COMMIT;
