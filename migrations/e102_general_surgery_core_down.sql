-- Migration: e102_general_surgery_core_down.sql
-- Description: Revert General Surgery Core Schema

BEGIN;

DROP TABLE IF EXISTS surgery_implants;
DROP TABLE IF EXISTS surgery_wound_logs;
DROP TABLE IF EXISTS surgery_encounters;

COMMIT;
