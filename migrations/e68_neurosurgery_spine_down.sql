-- Migration: e68_neurosurgery_spine_down.sql
-- Purpose: Reverse changes from e68_neurosurgery_spine_up.sql

BEGIN;

DROP TABLE IF EXISTS spine_stability_metrics;
DROP TABLE IF EXISTS intracranial_pressure_logs;
DROP TABLE IF EXISTS neuro_surgical_logs;

COMMIT;
