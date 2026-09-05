import { defineConfig, globalIgnores } from "eslint/config";
import nextVitals from "eslint-config-next/core-web-vitals";
import nextTs from "eslint-config-next/typescript";

const eslintConfig = defineConfig([
  ...nextVitals,
  ...nextTs,

  globalIgnores([
    ".next/**",
    "out/**",
    "build/**",
    "coverage/**",
    "next-env.d.ts",
  ]),

  {
    rules: {
      "@typescript-eslint/no-explicit-any": "error",
      // Underscore marks a deliberately unused binding — required to satisfy an
      // interface (see AnthropicProvider.embed, which has no upstream API).
      "@typescript-eslint/no-unused-vars": [
        "warn",
        {
          argsIgnorePattern: "^_",
          varsIgnorePattern: "^_",
          caughtErrorsIgnorePattern: "^_",
        },
      ],
    },
  },

  {
    // The provider abstraction only holds if vendor SDKs stay behind it.
    // Application code must import from `@/lib/ai`, never a vendor package.
    files: ["src/**/*.{ts,tsx}"],
    ignores: ["src/lib/ai/providers/**"],
    rules: {
      "no-restricted-imports": [
        "error",
        {
          paths: [
            {
              name: "@google/genai",
              message: "Import from '@/lib/ai' instead. Vendor SDKs belong in src/lib/ai/providers/.",
            },
            {
              name: "openai",
              message: "Import from '@/lib/ai' instead. Vendor SDKs belong in src/lib/ai/providers/.",
            },
            {
              name: "@anthropic-ai/sdk",
              message: "Import from '@/lib/ai' instead. Vendor SDKs belong in src/lib/ai/providers/.",
            },
          ],
        },
      ],
    },
  },
]);

export default eslintConfig;
