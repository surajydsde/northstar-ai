import { defineConfig } from 'vitest/config';

export default defineConfig({
  resolve: {
    // Native tsconfig `paths` resolution — no plugin needed.
    tsconfigPaths: true,
  },
  test: {
    environment: 'node',
    include: ['src/**/*.test.{ts,tsx}'],
    // Server code runs in node, the environment it actually ships to. A
    // component test opts into jsdom with a `@vitest-environment jsdom`
    // docblock (environmentMatchGlobs was removed in Vitest 5).
    setupFiles: ['src/test/setup.ts'],
    coverage: {
      provider: 'v8',
      reporter: ['text', 'lcov', 'json-summary'],
      reportsDirectory: 'coverage',
      include: ['src/lib/ai/**', 'src/features/embeddings/**'],
      exclude: ['**/*.test.*', 'src/lib/ai/index.ts', 'src/test/**'],
      // Scoped to the code this migration introduced. Widen the net as the rest
      // of the codebase gains coverage, rather than starting from an
      // unmeetable repo-wide bar.
      thresholds: { statements: 80, branches: 80, functions: 80, lines: 80 },
    },
  },
});
