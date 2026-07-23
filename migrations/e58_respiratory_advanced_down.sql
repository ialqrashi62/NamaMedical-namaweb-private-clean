-- Down migration for Respiratory Advanced
-- Target: namaweb/migrations/e58_respiratory_advanced_down.sql

DROP TABLE IF EXISTS la_respiratory_home_ox_logs;
DROP TABLE IF EXISTS respiratory_home_ox_setup;
DROP TABLE IF EXISTS respiratory_biopsy_samples;
DROP TABLE IF EXISTS respiratory_bronchoscopy_logs;
DROP TABLE IF EXISTS respiratory_abg_logs;
DROP TABLE IF EXISTS respiratory_vent_logs;
