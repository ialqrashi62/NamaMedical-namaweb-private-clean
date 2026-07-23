-- Down migration for Pulmonology & Respiratory Specialized Data
-- Target: namaweb/migrations/e56_respiratory_specialized_down.sql

DROP TABLE IF EXISTS respiratory_oxygen_logs;
DROP TABLE IF EXISTS respiratory_pft_logs;
