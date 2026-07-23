-- Migration: e77_obgyn_peds_extensions_down.sql
BEGIN;
DROP TABLE IF EXISTS nicu_monitoring;
DROP TABLE IF EXISTS ivf_cycles;
DROP TABLE IF EXISTS mfm_scans;
COMMIT;
