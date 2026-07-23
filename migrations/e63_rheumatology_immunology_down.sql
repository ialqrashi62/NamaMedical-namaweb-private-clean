-- Down migration for Rheumatology & Immunology Specialized Data
-- Target: namaweb/migrations/e63_rheumatology_immunology_down.sql

DROP TABLE IF EXISTS rheum_biologic_tracking;
DROP TABLE IF EXISTS rheum_activity_scores;
DROP TABLE IF EXISTS rheum_joint_logs;
