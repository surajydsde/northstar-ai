/**
 * Global test setup.
 *
 * Provider credentials are stubbed so `getAiConfig()` resolves without real
 * keys. Tests that assert configuration failures build their own environment
 * via `buildAiConfig()` rather than mutating this one.
 */
process.env.AI_PROVIDER ??= 'gemini';
process.env.GEMINI_API_KEY ??= 'test-key-not-real';
process.env.AI_EMBEDDING_DIMENSIONS ??= '768';
