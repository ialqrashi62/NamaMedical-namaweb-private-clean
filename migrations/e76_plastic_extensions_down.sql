-- Migration: e76_plastic_extensions_down.sql
BEGIN;
DROP TABLE IF EXISTS aesthetic_logs;
DROP TABLE IF EXISTS plastic_surgery_sessions;
COMMIT;
