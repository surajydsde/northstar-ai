# pgvector migration

**Status: complete.** Vectors are stored in binary `vector(768)` columns on Neon
Postgres and queried via HNSW indexes inside the database.

## What changed

### Storage

Two new columns were added alongside the existing `json`/`jsonb` ones (the old
columns are left in place and are no longer written or read by application code):

| Table | Column | Type |
|---|---|---|
| `memories` | `embedding_vec` | `vector(768)` |
| `document_chunks` | `embedding_vec` | `vector(768)` |

Both columns have an HNSW index using `vector_cosine_ops`.

Migration: `src/db/migrations/0002_pgvector.sql`

### Retrieval

`rag-service.ts` and `memory-service.ts` no longer pull candidate rows into Node
to compute cosine similarity in a loop. Both delegate to Postgres:

```sql
-- RAG
ORDER BY embedding_vec <=> $queryVector LIMIT 6

-- Memory (hybrid vector + keyword)
SELECT ...,
  greatest(
    coalesce(1 - (embedding_vec <=> $q), 0),  -- vector score
    case when content ilike $needle then 0.75 else 0 end  -- keyword score
  ) AS score
HAVING score > 0.62
ORDER BY score DESC LIMIT 8
```

The retrieval caps (`RAG_MAX_DOCUMENTS`, `RAG_MAX_CHUNKS`, `MEMORY_MAX_SCANNED`)
were workarounds for in-process scanning. They are no longer needed — `LIMIT`
over an HNSW index materialises only the returned rows.

### Embedding store

`document-indexer.ts` writes directly to `embedding_vec`. The old approach
stuffed vectors into the `metadata` JSON column; that is gone.

`memory-service.ts` writes to `embedding_vec` on create and update.

## Why Neon

The local Windows PostgreSQL 17 installation does not ship the `vector`
extension. Rather than modifying a system installation or switching to Docker,
the database was moved to Neon's free tier, which ships pgvector 0.8.0 on all
plans. Connection strings are URL-based; SSL is configured automatically via
`resolveSsl()` based on hostname.

## Backfill

Existing rows were backfilled by `scripts/backfill-pgvector.ts`, which reads
from the old `embedding` / `metadata.embeddings` columns and writes the
`vector(768)` literal. Run it again with `npm run db:backfill-vectors` if
rows are added while the old code is still in place.

## Dimension constraint

The column is fixed at 768 dimensions to match `gemini-embedding-001`. If
`AI_EMBEDDING_DIMENSIONS` changes, a new migration is required — pgvector
columns do not change dimension in place. After such a migration, run
`npm run ai:reembed` to repopulate.
