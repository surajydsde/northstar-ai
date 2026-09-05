import { createEnv } from '@t3-oss/env-nextjs';
import { z } from 'zod';

const isProduction = process.env.NODE_ENV === 'production';

/**
 * Development-only fallbacks.
 *
 * These deliberately do not apply in production: a deployment missing
 * `BETTER_AUTH_SECRET` must fail to boot rather than start on a value that is
 * published in this repository and therefore known to everyone.
 */
const devOnly = <T extends string>(value: T) => (isProduction ? undefined : value);

export const env = createEnv({
  server: {
    NODE_ENV: z.enum(['development', 'test', 'production']).default('development'),
    DATABASE_URL: z.string().min(1),
    BETTER_AUTH_SECRET: z.string().min(32),
    BETTER_AUTH_URL: z.string().url(),
    NEXTAUTH_URL: z.string().url().optional().or(z.literal('')).default(''),
    UPLOADS_DIR: z.string().min(1).default('storage/uploads'),
    /** Verify the database TLS certificate. Only disable for a known-good private network. */
    DATABASE_SSL_REJECT_UNAUTHORIZED: z
      .enum(['true', 'false'])
      .default('true')
      .transform((value) => value === 'true'),
  },
  client: {
    NEXT_PUBLIC_APP_URL: z.string().url().default('http://localhost:3000'),
  },
  runtimeEnv: {
    NODE_ENV: process.env.NODE_ENV,
    DATABASE_URL:
      process.env.DATABASE_URL ?? devOnly('postgresql://postgres:postgres@localhost:5433/chatgpt'),
    BETTER_AUTH_SECRET:
      process.env.BETTER_AUTH_SECRET ?? devOnly('development-only-insecure-secret-value-0123456789'),
    BETTER_AUTH_URL: process.env.BETTER_AUTH_URL ?? devOnly('http://localhost:3000'),
    NEXTAUTH_URL: process.env.NEXTAUTH_URL,
    UPLOADS_DIR: process.env.UPLOADS_DIR,
    DATABASE_SSL_REJECT_UNAUTHORIZED: process.env.DATABASE_SSL_REJECT_UNAUTHORIZED,
    NEXT_PUBLIC_APP_URL: process.env.NEXT_PUBLIC_APP_URL,
  },
});
