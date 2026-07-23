-- Migration: e78_critical_care_down.sql
-- Purpose: Reverse changes from e78_critical_care_up.sql

BEGIN;

DROP TABLE IF EXISTS shock_titration_logs;
DROP TABLE IF EXISTS sepsis_bundle_tracking;
DROP TABLE IF EXISTS crit_care_ventilation_logs;
DROP TABLE IF EXISTS crit_care_hemodynamics;

COMMIT;
