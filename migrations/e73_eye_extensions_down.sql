-- Migration: e73_eye_extensions_down.sql
BEGIN;
DROP TABLE IF EXISTS eye_biometry_logs;
DROP TABLE IF EXISTS eye_surgery_sessions;
COMMIT;
