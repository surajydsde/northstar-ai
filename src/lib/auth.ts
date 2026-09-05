import { drizzleAdapter } from '@better-auth/drizzle-adapter';
import { betterAuth } from 'better-auth';

import { db } from '@/db';
import * as schema from '@/db/schema';
import { env } from '@/lib/env';

/** Normalise an origin: strip trailing slash so comparison is exact. */
function normaliseOrigin(url: string): string {
  return url.replace(/\/+$/, '');
}

const baseOrigin = normaliseOrigin(env.BETTER_AUTH_URL);
const appOrigin = normaliseOrigin(env.NEXT_PUBLIC_APP_URL);

const trustedOrigins = Array.from(
  new Set([
    baseOrigin,
    appOrigin,
    // Always allow localhost variants so local dev works regardless of
    // how PORT or BETTER_AUTH_URL is configured.
    'http://localhost:3000',
    'http://127.0.0.1:3000',
  ]),
);

export const auth = betterAuth({
  secret: env.BETTER_AUTH_SECRET,
  baseURL: baseOrigin,
  trustedOrigins,
  database: drizzleAdapter(db, {
    provider: 'pg',
    schema,
  }),
  emailAndPassword: {
    enabled: true,
  },
  session: {
    expiresIn: 60 * 60 * 24 * 7,
  },
});

export type AuthSession = Awaited<ReturnType<typeof auth.api.getSession>>;
