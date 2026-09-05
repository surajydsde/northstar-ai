# Moving retrieval to pgvector

**Status: prepared, not applied.** It needs an environment change that is
yours to make.

## Why

Embeddings currently live in `json` columns. No index can serve them, so every
query pulls candidate rows into Node and scores them in a loop. That is why the
code carries caps:

| Bound | Default | Effect |
|---|---|---|
| `RAG_MAX_DOCUMENTS` | 25 | Documents older than the 25 most recent are unsearchable |
| `RAG_MAX_CHUNKS` | 2000 | Hard ceiling on chunks scanned per query |
| `MEMORY_MAX_SCANNED` | 1000 | Memories beyond the 1000 most recent are unsearchable |

The original code capped this at **five documents**, with an inline comment
conceding it was a workaround for a CPU hang. The bottleneck is not the cosine
arithmetic — a thousand 768-dimension vectors is a few million multiply-adds,
low single-digit milliseconds. It is that Postgres serialises those vectors to
JSON text, ships megabytes over the wire, and Node parses all of it *before*
any similarity is computed.

Raising the caps makes that worse; lowering them remembers less. There is no
good value, because the cap is a symptom of the storage format.

`pgvector` removes the trade-off rather than repositioning it: vectors stored
in binary, similarity computed inside Postgres via `<=>`, an HNSW index doing
the pruning, and `ORDER BY ... LIMIT 6` returning only the rows wanted. Nothing
large crosses the wire, and the caps become unnecessary on both tables.

Retrieval stays entirely in Postgres. No new service.

## The blocker

Your database is **PostgreSQL 17.11 on x86_64-windows**, a native Windows
install, and it does not ship the extension:

```sql
SELECT * FROM pg_available_extensions WHERE name = 'vector';
--  (0 rows)
```

`CREATE EXTENSION vector` cannot succeed until the extension files are present
on the server. You are superuser, so permissions are not the obstacle.

## Two ways forward

### Option A — Docker (recommended)

`docker-compose.yml` already runs Postgres. Switching the image is a one-line
change:

```yaml
postgres:
  image: pgvector/pgvector:pg17   # was postgres:16-alpine
```

Your `DATABASE_URL` currently points at `localhost:5432`, while compose
publishes `5433`, so you are using the native install rather than the compose
one. Moving to the container means dumping and restoring your existing data:

```bash
pg_dump -h localhost -p 5432 -U postgres chatgpt > backup.sql
docker compose up -d postgres
psql -h localhost -p 5433 -U postgres -d chatgpt -f backup.sql
# then point DATABASE_URL at :5433
```

### Option B — install pgvector into the existing Windows Postgres

Download the prebuilt binaries matching PostgreSQL 17 and copy them into the
installation (`lib\`, `share\extension\`). This keeps your current data in
place with no dump and restore, but modifies a system installation.

Either way, verify before proceeding:

```sql
SELECT * FROM pg_available_extensions WHERE name = 'vector';
```

## Then

1. `CREATE EXTENSION vector;`
2. Add `vector(768)` columns alongside the existing `json` ones — additive, so
   the current code keeps working.
3. Backfill from the `json` columns (no re-embedding needed; the values are
   already correct, only the storage changes).
4. Create HNSW indexes:
   ```sql
   CREATE INDEX ON memories USING hnsw (embedding_vec vector_cosine_ops);
   CREATE INDEX ON document_chunks USING hnsw (embedding_vec vector_cosine_ops);
   ```
5. Replace the in-Node cosine loops in `rag-service.ts` and `memory-service.ts`
   with SQL ordering, keeping the `_embedding` tag filter in the `WHERE` clause.
6. Drop the caps.
7. Drop the `json` columns only after a release confirms the new path.

Steps 2–7 are ordinary work once the extension exists. Vectors are already
unit-normalised by the provider layer, so cosine and inner-product operators
agree.

## Why it is not done

Both options change your database environment — one migrates your data to a
container, the other modifies a system PostgreSQL install. Neither is a code
change, and neither should be made without you choosing it.
