-- Down migration for Infectious Diseases & Infection Control
-- Target: namaweb/migrations/e64_infectious_diseases_down.sql

DROP TABLE IF EXISTS antimicrobial_stewardship_logs;
DROP TABLE IF EXISTS infectious_isolation_logs;
