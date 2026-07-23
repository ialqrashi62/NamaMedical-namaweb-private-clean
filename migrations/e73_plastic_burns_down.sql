-- Migration: e73_plastic_burns_down.sql
-- Purpose: Reverse changes from e73_plastic_burns_up.sql

BEGIN;

DROP TABLE IF EXISTS flap_monitoring_metrics;
DROP TABLE IF EXISTS burn_resuscitation_logs;
DROP TABLE IF EXISTS plastic_burns_surgical_logs;

COMMIT;
