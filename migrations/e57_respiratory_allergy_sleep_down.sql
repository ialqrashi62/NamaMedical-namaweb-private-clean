-- Down migration for Respiratory Allergy & Sleep Medicine
-- Target: namaweb/migrations/e57_respiratory_allergy_sleep_down.sql

DROP TABLE IF EXISTS respiratory_cpap_logs;
DROP TABLE IF EXISTS respiratory_sleep_psg;
DROP TABLE IF EXISTS respiratory_biologicals;
DROP TABLE IF EXISTS respiratory_allergy_tests;
