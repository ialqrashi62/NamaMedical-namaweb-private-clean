-- Migration: e80_critical_care_down.sql
BEGIN;
DROP TABLE IF EXISTS anesthesia_records;
DROP TABLE IF EXISTS icu_vital_streams;
DROP TABLE IF EXISTS er_triage_logs;
COMMIT;
