-- Migration: e75_urology_extensions_down.sql
BEGIN;
DROP TABLE IF EXISTS urology_stone_logs;
DROP TABLE IF EXISTS urology_surgery_sessions;
COMMIT;
