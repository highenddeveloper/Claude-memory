-- AI Dashboard Platform — Initial Schema
-- Run automatically via docker-entrypoint-initdb.d

-- Enable extensions
CREATE EXTENSION IF NOT EXISTS "pgcrypto";
CREATE EXTENSION IF NOT EXISTS "pg_trgm";

-- ─── Agent Tasks ───
CREATE TABLE IF NOT EXISTS agent_tasks (
  id            UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  type          VARCHAR(50) NOT NULL,
  input         JSONB NOT NULL,
  status        VARCHAR(20) NOT NULL DEFAULT 'pending'
                CHECK (status IN ('pending', 'planning', 'executing', 'completed', 'failed')),
  steps         JSONB DEFAULT '[]'::jsonb,
  result        JSONB,
  error         TEXT,
  created_at    TIMESTAMPTZ NOT NULL DEFAULT NOW(),
  updated_at    TIMESTAMPTZ NOT NULL DEFAULT NOW(),
  completed_at  TIMESTAMPTZ
);

CREATE INDEX IF NOT EXISTS idx_tasks_status ON agent_tasks(status);
CREATE INDEX IF NOT EXISTS idx_tasks_type ON agent_tasks(type);
CREATE INDEX IF NOT EXISTS idx_tasks_created ON agent_tasks(created_at DESC);

-- Partial index for concurrency counting (only active tasks)
CREATE INDEX IF NOT EXISTS idx_tasks_active ON agent_tasks(status)
  WHERE status IN ('planning', 'executing');

-- ─── Memory Entries ───
CREATE TABLE IF NOT EXISTS memory_entries (
  id          UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  content     TEXT NOT NULL,
  summary     TEXT,
  metadata    JSONB DEFAULT '{}'::jsonb,
  source_url  TEXT,
  agent_task  UUID REFERENCES agent_tasks(id) ON DELETE SET NULL,
  created_at  TIMESTAMPTZ NOT NULL DEFAULT NOW(),
  updated_at  TIMESTAMPTZ NOT NULL DEFAULT NOW()
);

CREATE INDEX IF NOT EXISTS idx_memory_metadata ON memory_entries USING GIN(metadata);
CREATE INDEX IF NOT EXISTS idx_memory_created ON memory_entries(created_at DESC);
CREATE INDEX IF NOT EXISTS idx_memory_source ON memory_entries(source_url) WHERE source_url IS NOT NULL;

-- Full-text search index on content + summary (used by websearch_to_tsquery)
CREATE INDEX IF NOT EXISTS idx_memory_fts ON memory_entries
  USING GIN(to_tsvector('english', coalesce(content, '') || ' ' || coalesce(summary, '')));

-- Trigram index for fuzzy/substring fallback search
CREATE INDEX IF NOT EXISTS idx_memory_trgm_content ON memory_entries USING GIN(content gin_trgm_ops);

-- Auto-update updated_at on row change
CREATE OR REPLACE FUNCTION update_updated_at()
RETURNS TRIGGER AS $$
BEGIN
  NEW.updated_at = NOW();
  RETURN NEW;
END;
$$ LANGUAGE plpgsql;

DO $$
BEGIN
  IF NOT EXISTS (SELECT 1 FROM pg_trigger WHERE tgname = 'trg_tasks_updated_at') THEN
    CREATE TRIGGER trg_tasks_updated_at
      BEFORE UPDATE ON agent_tasks
      FOR EACH ROW EXECUTE FUNCTION update_updated_at();
  END IF;
  IF NOT EXISTS (SELECT 1 FROM pg_trigger WHERE tgname = 'trg_memory_updated_at') THEN
    CREATE TRIGGER trg_memory_updated_at
      BEFORE UPDATE ON memory_entries
      FOR EACH ROW EXECUTE FUNCTION update_updated_at();
  END IF;
END;
$$;
