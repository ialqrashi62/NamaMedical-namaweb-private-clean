-- Migration: e103_obgyn_core_down.sql
-- Description: Revert OBGYN Core Schema

BEGIN;

DROP TABLE IF EXISTS obgyn_delivery_records;
DROP TABLE IF EXISTS obgyn_anc_tracking;
DROP TABLE IF EXISTS obgyn_encounters;

COMMIT;
