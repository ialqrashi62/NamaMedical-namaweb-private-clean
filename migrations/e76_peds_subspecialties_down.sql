-- Migration: e76_peds_subspecialties_down.sql
-- Purpose: Reverse changes from e76_peds_subspecialties_up.sql

BEGIN;

DROP TABLE IF EXISTS peds_neuro_logs;
DROP TABLE IF EXISTS peds_nephro_logs;
DROP TABLE IF EXISTS peds_cardio_logs;

COMMIT;
