import postgres from 'postgres';
import { drizzle } from 'drizzle-orm/postgres-js';

import { env } from '@/lib/env';
import * as schema from './schema';

const client = postgres(env.DATABASE_URL, {
  max: 10,
  idle_timeout: 20,
  connect_timeout: 10,
  // Verify the server certificate by default. Disabling verification made the
  // production TLS connection trivially interceptable.
  ssl:
    env.NODE_ENV === 'production'
      ? { rejectUnauthorized: env.DATABASE_SSL_REJECT_UNAUTHORIZED }
      : false,
});

export const db = drizzle(client, { schema });

export type Database = typeof db;
