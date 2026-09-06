import postgres from 'postgres';
import { drizzle } from 'drizzle-orm/postgres-js';

import { env } from '@/lib/env';
import * as schema from './schema';

/**
 * TLS follows the connection target, not `NODE_ENV`.
 *
 * Keying this off the environment meant a local dev run against a managed
 * provider (Neon, Supabase, RDS) would try to connect in the clear and be
 * refused. Any host that is not loopback gets TLS, as does any URL that asks
 * for it via `sslmode`.
 */
export function resolveSsl(databaseUrl: string): false | { rejectUnauthorized: boolean } {
  let host = '';
  let sslmode = '';

  try {
    const url = new URL(databaseUrl);
    host = url.hostname;
    sslmode = url.searchParams.get('sslmode') ?? '';
  } catch {
    // An unparseable URL is postgres.js's problem to report, not ours.
    return false;
  }

  if (sslmode === 'disable') return false;

  const isLoopback = host === 'localhost' || host === '127.0.0.1' || host === '::1';
  const wantsSsl = sslmode !== '' || !isLoopback;

  if (!wantsSsl) return false;

  // `sslmode=require` means encrypt without verifying the chain — that is what
  // most managed providers put in their copyable connection string. Anything
  // stricter, or an unspecified mode on a remote host, verifies the certificate.
  const rejectUnauthorized = sslmode === 'require' ? false : env.DATABASE_SSL_REJECT_UNAUTHORIZED;

  return { rejectUnauthorized };
}

const client = postgres(env.DATABASE_URL, {
  max: 10,
  idle_timeout: 20,
  connect_timeout: 15,
  ssl: resolveSsl(env.DATABASE_URL),
});

export const db = drizzle(client, { schema });

export type Database = typeof db;
