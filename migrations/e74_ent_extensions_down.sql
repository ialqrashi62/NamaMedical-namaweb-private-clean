-- Migration: e74_ent_extensions_down.sql
BEGIN;
DROP TABLE IF EXISTS ent_audiometry_logs;
DROP TABLE IF EXISTS ent_surgery_sessions;
COMMIT;
