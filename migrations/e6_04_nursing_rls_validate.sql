SELECT 
  tablename, 
  rowsecurity, 
  (SELECT count(*) FROM pg_policies WHERE tablename = t.tablename) as policy_count
FROM pg_tables t
JOIN pg_class c ON c.relname = t.tablename
WHERE t.tablename IN ('nursing_io', 'nursing_handover', 'nursing_pain_assessments');
