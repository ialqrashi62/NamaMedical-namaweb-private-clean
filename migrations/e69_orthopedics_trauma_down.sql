-- Migration: e69_orthopedics_trauma_down.sql
-- Purpose: Reverse changes from e69_orthopedics_trauma_up.sql

BEGIN;

DROP TABLE IF EXISTS fracture_management_logs;
DROP TABLE IF EXISTS joint_replacement_registry;
DROP TABLE IF EXISTS ortho_surgical_logs;

COMMIT;
