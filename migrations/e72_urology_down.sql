-- Migration: e72_urology_down.sql
-- Purpose: Reverse changes from e72_urology_up.sql

BEGIN;

DROP TABLE IF EXISTS urology_oncology_metrics;
DROP TABLE IF EXISTS urology_stone_registry;
DROP TABLE IF EXISTS urology_surgical_logs;

COMMIT;
