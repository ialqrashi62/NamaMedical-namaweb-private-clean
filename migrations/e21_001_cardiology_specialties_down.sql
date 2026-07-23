-- Migration: e21_001_cardiology_specialties_down.sql
-- Description: Rollback specialized tables for Cardiology department.

BEGIN;

DROP TABLE IF EXISTS cardio_meds_tracking;
DROP TABLE IF EXISTS cardio_cath_logs;
DROP TABLE IF EXISTS cardio_echo_reports;
DROP TABLE IF EXISTS cardio_patient_profiles;

COMMIT;
