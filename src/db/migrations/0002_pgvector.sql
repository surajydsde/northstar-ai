-- Adds pgvector-backed columns alongside the existing json/jsonb ones.
--
-- Additive by design: the old columns are left in place so the application
-- keeps working unmodified until the code that reads/writes vectors is
-- switched over in the same release. They are dropped in a later migration
-- once that switch is confirmed.
--
-- Dimension is 768 to match the configured embedding model
-- (gemini-embedding-001 truncated to 768 dims). If AI_EMBEDDING_DIMENSIONS
-- changes, this column's dimension must change with it, which requires a new
-- migration (pgvector dimensions are fixed per column).

CREATE EXTENSION IF NOT EXISTS vector;

ALTER TABLE memories
  ADD COLUMN IF NOT EXISTS embedding_vec vector(768);

ALTER TABLE document_chunks
  ADD COLUMN IF NOT EXISTS embedding_vec vector(768);

-- HNSW indexes for cosine distance. Built after backfill in application code
-- would be faster for a large table, but these tables are small (tens of
-- rows today), so creating the index up front costs nothing measurable and
-- keeps this migration self-contained.
CREATE INDEX IF NOT EXISTS memories_embedding_vec_hnsw_idx
  ON memories USING hnsw (embedding_vec vector_cosine_ops);

CREATE INDEX IF NOT EXISTS document_chunks_embedding_vec_hnsw_idx
  ON document_chunks USING hnsw (embedding_vec vector_cosine_ops);
