-- Migration: e70_cardio_thoracic_extensions_down.sql
-- Description: Reverses the cardiothoracic extensions migration.

BEGIN;

DROP TABLE IF EXISTS vascular_grafts;
DROP TABLE IF EXISTS cardio_surgery_sessions;

COMMIT;
