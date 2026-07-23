-- Migration: e72_ortho_extensions_down.sql
-- Description: Reverses the orthopedics extensions migration.

BEGIN;

DROP TABLE IF EXISTS ortho_trauma_logs;
DROP TABLE IF EXISTS ortho_joint_replacements;

COMMIT;
