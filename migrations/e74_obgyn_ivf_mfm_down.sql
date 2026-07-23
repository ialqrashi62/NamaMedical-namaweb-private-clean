-- Migration: e74_obgyn_ivf_mfm_down.sql
-- Purpose: Reverse changes from e74_obgyn_ivf_mfm_up.sql

BEGIN;

DROP TABLE IF EXISTS gyn_oncology_registry;
DROP TABLE IF EXISTS obgyn_delivery_logs;
DROP TABLE IF EXISTS maternal_fetal_metrics;
DROP TABLE IF EXISTS obgyn_ivf_lab_logs;

COMMIT;
