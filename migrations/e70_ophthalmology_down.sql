-- Migration: e70_ophthalmology_down.sql
-- Purpose: Reverse changes from e70_ophthalmology_up.sql

BEGIN;

DROP TABLE IF EXISTS glaucoma_metrics;
DROP TABLE IF EXISTS iol_registry;
DROP TABLE IF EXISTS ophthalmic_surgical_logs;

COMMIT;
