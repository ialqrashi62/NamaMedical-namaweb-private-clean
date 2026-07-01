-- Rollback: Drop OBGYN pregnancies, psychiatric evaluations, and dermatology lesions tables.
BEGIN;

DROP TABLE IF EXISTS obgyn_pregnancies CASCADE;
DROP TABLE IF EXISTS psychiatric_evaluations CASCADE;
DROP TABLE IF EXISTS dermatology_lesions CASCADE;

COMMIT;
