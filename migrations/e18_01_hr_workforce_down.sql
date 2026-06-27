-- e18_01_hr_workforce_down.sql  (rollback of e18_01 up)
-- CANDIDATE ONLY — DO NOT EXECUTE ON PRODUCTION WITHOUT EXPLICIT DDL APPROVAL.
--
-- كل هذه الجداول جديدة أنشأتها e18_01 — نُسقطها فقط (الأبناء قبل الآباء عند وجود FK بينها).
-- لا تمسّ الجداول الموجودة مسبقاً (hr_employees/hr_leaves/hr_attendance/hr_salaries) إطلاقاً.
-- كل DROP TABLE يُسقط سياساته/فهارسه/قيوده ضمناً. idempotent (IF EXISTS).
BEGIN;

DROP TABLE IF EXISTS hr_competencies CASCADE;
DROP TABLE IF EXISTS hr_payroll_slips CASCADE;
DROP TABLE IF EXISTS hr_leave_requests CASCADE;
DROP TABLE IF EXISTS hr_shifts CASCADE;
DROP TABLE IF EXISTS hr_licenses CASCADE;

COMMIT;
