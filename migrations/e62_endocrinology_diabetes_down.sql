-- Down migration for Endocrinology & Diabetes Specialized Data
-- Target: namaweb/migrations/e62_endocrinology_diabetes_down.sql

DROP TABLE IF EXISTS endocrine_thyroid_logs;
DROP TABLE IF EXISTS diabetes_complications;
DROP TABLE IF EXISTS endocrine_glucose_logs;
