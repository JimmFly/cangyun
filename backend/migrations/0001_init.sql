-- Enable pgvector for semantic search
CREATE EXTENSION IF NOT EXISTS vector;

CREATE TABLE IF NOT EXISTS knowledge_documents (
  id UUID PRIMARY KEY,
  external_id TEXT NOT NULL UNIQUE,
  title TEXT NOT NULL,
  source_url TEXT,
  version TEXT,
  metadata JSONB DEFAULT '{}'::jsonb,
  created_at TIMESTAMPTZ NOT NULL DEFAULT NOW(),
  updated_at TIMESTAMPTZ NOT NULL DEFAULT NOW()
);

CREATE TABLE IF NOT EXISTS knowledge_chunks (
  id UUID PRIMARY KEY,
  document_id UUID NOT NULL REFERENCES knowledge_documents (id) ON DELETE CASCADE,
  content TEXT NOT NULL,
  "order" INTEGER NOT NULL,
  token_count INTEGER,
  embedding VECTOR(3072),
  metadata JSONB DEFAULT '{}'::jsonb,
  created_at TIMESTAMPTZ NOT NULL DEFAULT NOW(),
  updated_at TIMESTAMPTZ NOT NULL DEFAULT NOW()
);

CREATE INDEX IF NOT EXISTS idx_knowledge_chunks_document_id ON knowledge_chunks (document_id);
CREATE INDEX IF NOT EXISTS idx_knowledge_chunks_order ON knowledge_chunks ("order");

-- Vector index (requires pgvector >= 0.4.0)
-- Note: pgvector supports max 2000 dimensions for ivfflat and hnsw indexes
-- For vectors with 3072 dimensions (text-embedding-3-large), we skip the index
-- Queries will still work but will be slower without the index
-- Consider using a smaller embedding model or dimension reduction if index performance is needed
-- DO $$
-- BEGIN
--   IF NOT EXISTS (
--     SELECT 1
--     FROM pg_indexes
--     WHERE tablename = 'knowledge_chunks'
--       AND indexname = 'idx_knowledge_chunks_embedding'
--   ) THEN
--     EXECUTE 'CREATE INDEX idx_knowledge_chunks_embedding ON knowledge_chunks USING hnsw (embedding vector_cosine_ops) WITH (m = 16, ef_construction = 64);';
--   END IF;
-- END $$;
