-- Migration: e81_rare_specialties_down.sql
-- Purpose: Reverse changes from e81_rare_specialties_up.sql

BEGIN;

DROP TABLE IF EXISTS regenerative_logs;
DROP TABLE IF EXISTS nanomedicine_metrics;
DROP TABLE IF EXISTS rare_disease_logs;

COMMIT;
