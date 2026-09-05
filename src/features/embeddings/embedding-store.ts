import { sameVectorSpace, type EmbeddingTag } from '@/lib/ai';

/**
 * Storage helpers for tagged vectors.
 *
 * Embeddings currently live inside existing `json` columns, so tagging needs no
 * schema migration. The reserved metadata key below namespaces the tag away
 * from user-supplied metadata. When embeddings are promoted to `pgvector`
 * columns, these helpers are the only place that changes.
 */

/** Reserved metadata key. Underscore-prefixed to avoid colliding with user keys. */
export const EMBEDDING_TAG_KEY = '_embedding';

export type JsonMetadata = Record<string, unknown> | null | undefined;

/** Attaches a vector-space tag to a metadata object without disturbing other keys. */
export function writeTag(metadata: JsonMetadata, tag: EmbeddingTag): Record<string, unknown> {
  return { ...(metadata ?? {}), [EMBEDDING_TAG_KEY]: tag };
}

/**
 * Reads a vector-space tag. Returns null for rows written before tagging
 * existed (for example, the Ollama-era `nomic-embed-text` vectors), which is
 * what makes those rows fail the `sameVectorSpace` check rather than being
 * scored against an incompatible query vector.
 */
export function readTag(metadata: JsonMetadata): EmbeddingTag | null {
  const raw = (metadata as Record<string, unknown> | null | undefined)?.[EMBEDDING_TAG_KEY];
  if (!raw || typeof raw !== 'object') return null;

  const candidate = raw as Partial<EmbeddingTag>;
  if (
    typeof candidate.provider !== 'string' ||
    typeof candidate.model !== 'string' ||
    typeof candidate.dimensions !== 'number'
  ) {
    return null;
  }

  return { provider: candidate.provider, model: candidate.model, dimensions: candidate.dimensions };
}

/**
 * Decides whether a stored vector may be compared against a query vector.
 *
 * This is the guard against the migration's most dangerous failure mode.
 * Vectors from different embedding models are not comparable even when their
 * dimensionality matches — `gemini-embedding-001` at 768 dimensions and
 * `nomic-embed-text` at 768 dimensions produce numbers of the same shape from
 * entirely different spaces, and cosine similarity between them is noise that
 * looks like a valid score. Skipping such rows turns silent, invisible
 * retrieval corruption into an honest retrieval gap.
 */
export function isComparable(
  storedTag: EmbeddingTag | null,
  queryTag: EmbeddingTag,
  vector: number[] | null | undefined,
): vector is number[] {
  if (!vector || vector.length === 0) return false;
  if (!sameVectorSpace(storedTag, queryTag)) return false;
  // Defends against a tag that disagrees with the vector actually stored.
  return vector.length === queryTag.dimensions;
}

/**
 * Minimum similarity for a retrieved item to be considered relevant.
 *
 * This threshold is a property of the embedding model, not a universal
 * constant, and the inherited value of 0.3 does not transfer. Measured against
 * `gemini-embedding-001` at 768 dimensions, unrelated query/document pairs
 * score 0.49–0.57 and correct matches score 0.67–0.77 — so a 0.3 floor admits
 * everything and silently disables relevance filtering altogether.
 *
 * 0.62 sits between those bands. Re-measure with `npm run ai:verify` and retune
 * via `RAG_MIN_SCORE` whenever the embedding model changes.
 */
export const DEFAULT_MIN_SCORE = 0.62;

/** Cosine similarity. Returns 0 when either vector is degenerate. */
export function cosine(a: number[], b: number[]): number {
  if (a.length !== b.length) return 0;

  let dot = 0;
  let normA = 0;
  let normB = 0;

  for (let i = 0; i < a.length; i += 1) {
    const x = a[i] ?? 0;
    const y = b[i] ?? 0;
    dot += x * y;
    normA += x * x;
    normB += y * y;
  }

  if (normA === 0 || normB === 0) return 0;
  return dot / (Math.sqrt(normA) * Math.sqrt(normB));
}

/** Coerces a persisted `json` value back into a numeric vector. */
export function toVector(value: unknown): number[] | null {
  if (!Array.isArray(value)) return null;
  return value.every((item) => typeof item === 'number') ? (value as number[]) : null;
}
