CREATE TABLE IF NOT EXISTS jobs (
  id UUID PRIMARY KEY,
  type TEXT NOT NULL,
  status TEXT NOT NULL DEFAULT 'queued',
  stage TEXT NOT NULL DEFAULT 'ingest',
  progress INTEGER NOT NULL DEFAULT 0,
  attempt_count INTEGER NOT NULL DEFAULT 0,
  payload JSONB,
  meta JSONB,
  result JSONB,
  error_message TEXT,
  created_at TIMESTAMP NOT NULL DEFAULT NOW(),
  updated_at TIMESTAMP NOT NULL DEFAULT NOW()
);

ALTER TABLE jobs
  ADD COLUMN IF NOT EXISTS stage TEXT NOT NULL DEFAULT 'ingest';

ALTER TABLE jobs
  ADD COLUMN IF NOT EXISTS progress INTEGER NOT NULL DEFAULT 0;

ALTER TABLE jobs
  ADD COLUMN IF NOT EXISTS attempt_count INTEGER NOT NULL DEFAULT 0;

ALTER TABLE jobs
  ADD COLUMN IF NOT EXISTS meta JSONB;

DO $$
BEGIN
  IF NOT EXISTS (
    SELECT 1
    FROM pg_constraint
    WHERE conname = 'jobs_progress_range'
  ) THEN
    ALTER TABLE jobs
      ADD CONSTRAINT jobs_progress_range CHECK (progress >= 0 AND progress <= 100);
  END IF;
END $$;
