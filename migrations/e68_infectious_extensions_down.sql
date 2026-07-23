-- Migration: e68_infectious_extensions_down.sql
-- Description: Reverses the infectious diseases extensions migration.

BEGIN;

DROP TABLE IF EXISTS asp_reviews;
DROP TABLE IF EXISTS culture_results;

COMMIT;
