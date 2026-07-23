-- Migration: e71_ent_down.sql
-- Purpose: Reverse changes from e71_ent_up.sql

BEGIN;

DROP TABLE IF EXISTS cochlear_implant_registry;
DROP TABLE IF EXISTS audiometry_metrics;
DROP TABLE IF EXISTS ent_surgical_logs;

COMMIT;
