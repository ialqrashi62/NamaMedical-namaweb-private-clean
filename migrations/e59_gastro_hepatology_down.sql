-- Down migration for Gastroenterology & Hepatology Specialized Data
-- Target: namaweb/migrations/e59_gastro_hepatology_down.sql

DROP TABLE IF EXISTS gastro_nutrition_plans;
DROP TABLE IF EXISTS gastro_liver_metrics;
DROP TABLE IF EXISTS gastro_endoscopy_logs;
