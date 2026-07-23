-- Migration: e79_rehab_support_down.sql
-- Purpose: Reverse changes from e79_rehab_support_up.sql

BEGIN;

DROP TABLE IF EXISTS psychosocial_support_logs;
DROP TABLE IF EXISTS rehab_speech_logs;
DROP TABLE IF EXISTS rehab_occupational_logs;
DROP TABLE IF EXISTS rehab_physical_logs;

COMMIT;
