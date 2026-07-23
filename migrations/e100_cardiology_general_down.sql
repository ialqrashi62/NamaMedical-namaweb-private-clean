-- Migration: e100_cardiology_general_down.sql
-- Description: Rollback tables for General Cardiology module

BEGIN;

DROP TABLE IF EXISTS cardiac_medications;
DROP TABLE IF EXISTS ecg_reports;
DROP TABLE IF EXISTS cardiology_visits;

COMMIT;
