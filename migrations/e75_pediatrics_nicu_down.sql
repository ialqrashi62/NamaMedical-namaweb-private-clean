-- Migration: e75_pediatrics_nicu_down.sql
-- Purpose: Reverse changes from e75_pediatrics_nicu_up.sql

BEGIN;

DROP TABLE IF EXISTS neonatal_transition_logs;
DROP TABLE IF EXISTS peds_milestone_tracking;
DROP TABLE IF EXISTS nicu_ventilation_logs;
DROP TABLE IF EXISTS peds_growth_logs;

COMMIT;
