-- 002 — Full-fidelity JSON storage for the pilot.
-- The normalized columns of 001 stay for querying/reporting; these jsonb
-- columns preserve the complete assessment input and decision output so the
-- application can reconstruct them without loss.

ALTER TABLE assessments ADD COLUMN IF NOT EXISTS input jsonb;
ALTER TABLE decisions   ADD COLUMN IF NOT EXISTS full_decision jsonb;

-- The pilot runs single-coach; clients.coach_id stays nullable.
