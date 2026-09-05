import { describe, expect, it } from 'vitest';

import type { EmbeddingTag } from '@/lib/ai';

import {
  cosine,
  DEFAULT_MIN_SCORE,
  EMBEDDING_TAG_KEY,
  isComparable,
  readTag,
  toVector,
  writeTag,
} from './embedding-store';

const GEMINI: EmbeddingTag = { provider: 'gemini', model: 'gemini-embedding-001', dimensions: 768 };
const OLLAMA: EmbeddingTag = { provider: 'ollama', model: 'nomic-embed-text', dimensions: 768 };
const OPENAI_1536: EmbeddingTag = { provider: 'openai', model: 'text-embedding-3-small', dimensions: 1536 };

const vec = (n: number, fill = 0.1) => Array.from({ length: n }, () => fill);

describe('writeTag / readTag', () => {
  it('round-trips a tag', () => {
    expect(readTag(writeTag({}, GEMINI))).toEqual(GEMINI);
  });

  it('preserves unrelated metadata', () => {
    const result = writeTag({ fileName: 'notes.md', embeddings: [1, 2, 3] }, GEMINI);
    expect(result.fileName).toBe('notes.md');
    expect(result.embeddings).toEqual([1, 2, 3]);
    expect(result[EMBEDDING_TAG_KEY]).toEqual(GEMINI);
  });

  it('treats a row written before tagging existed as untagged', () => {
    expect(readTag({ fileName: 'legacy.md', embeddings: [1, 2, 3] })).toBeNull();
    expect(readTag(null)).toBeNull();
    expect(readTag(undefined)).toBeNull();
  });

  it('rejects a malformed tag rather than trusting it', () => {
    expect(readTag({ [EMBEDDING_TAG_KEY]: 'gemini' })).toBeNull();
    expect(readTag({ [EMBEDDING_TAG_KEY]: { provider: 'gemini' } })).toBeNull();
    expect(readTag({ [EMBEDDING_TAG_KEY]: { provider: 'g', model: 'm', dimensions: '768' } })).toBeNull();
  });
});

describe('isComparable — the guard against silent retrieval corruption', () => {
  it('accepts a vector from the same model', () => {
    expect(isComparable(GEMINI, GEMINI, vec(768))).toBe(true);
  });

  /**
   * The core regression test. Both models emit 768 dimensions, so nothing about
   * the vector's shape reveals the mismatch — cosine would return a plausible
   * number rather than throwing. Only the tag can catch this.
   */
  it('rejects a same-dimension vector from a DIFFERENT model', () => {
    expect(isComparable(OLLAMA, GEMINI, vec(768))).toBe(false);
  });

  it('rejects a vector from a different provider using the same model name', () => {
    const impostor: EmbeddingTag = { ...GEMINI, provider: 'openai' };
    expect(isComparable(impostor, GEMINI, vec(768))).toBe(false);
  });

  it('rejects a different dimensionality', () => {
    expect(isComparable(OPENAI_1536, GEMINI, vec(1536))).toBe(false);
  });

  it('rejects an untagged (legacy) vector', () => {
    expect(isComparable(null, GEMINI, vec(768))).toBe(false);
  });

  it('rejects a tag that disagrees with the stored vector length', () => {
    // Tag claims 768, vector is 512 — the tag alone must not be trusted.
    expect(isComparable(GEMINI, GEMINI, vec(512))).toBe(false);
  });

  it('rejects empty and missing vectors', () => {
    expect(isComparable(GEMINI, GEMINI, [])).toBe(false);
    expect(isComparable(GEMINI, GEMINI, null)).toBe(false);
    expect(isComparable(GEMINI, GEMINI, undefined)).toBe(false);
  });
});

describe('cosine', () => {
  it('scores identical vectors as 1', () => {
    expect(cosine([1, 0, 0], [1, 0, 0])).toBeCloseTo(1, 10);
  });

  it('scores orthogonal vectors as 0', () => {
    expect(cosine([1, 0], [0, 1])).toBeCloseTo(0, 10);
  });

  it('scores opposite vectors as -1', () => {
    expect(cosine([1, 0], [-1, 0])).toBeCloseTo(-1, 10);
  });

  it('is scale invariant', () => {
    expect(cosine([1, 2, 3], [10, 20, 30])).toBeCloseTo(1, 10);
  });

  it('returns 0 for a zero vector instead of NaN', () => {
    expect(cosine([0, 0], [1, 1])).toBe(0);
    expect(Number.isNaN(cosine([0, 0], [0, 0]))).toBe(false);
  });

  /**
   * The original implementation compared vectors of differing length by
   * treating missing components as 0, which silently produced a score for
   * incomparable inputs.
   */
  it('returns 0 for mismatched lengths rather than a misleading score', () => {
    expect(cosine([1, 2, 3], [1, 2])).toBe(0);
  });
});

describe('toVector', () => {
  it('accepts a numeric array', () => {
    expect(toVector([1, 2, 3])).toEqual([1, 2, 3]);
  });

  it('rejects non-arrays and non-numeric arrays', () => {
    expect(toVector(null)).toBeNull();
    expect(toVector('not a vector')).toBeNull();
    expect(toVector([1, 'two', 3])).toBeNull();
    expect(toVector({ 0: 1 })).toBeNull();
  });
});

describe('DEFAULT_MIN_SCORE', () => {
  /**
   * Measured against gemini-embedding-001@768: unrelated pairs score 0.49-0.57,
   * correct matches 0.67-0.79. The threshold must separate those bands. The
   * inherited value of 0.3 sat below the noise floor, matching everything.
   */
  it('sits between the measured noise floor and the match band', () => {
    expect(DEFAULT_MIN_SCORE).toBeGreaterThan(0.57);
    expect(DEFAULT_MIN_SCORE).toBeLessThan(0.67);
  });
});
