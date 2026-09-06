/**
 * TLS selection is derived from the connection string, so a local run against
 * a managed provider still encrypts. Exercised through the exported helper.
 */
import { describe, expect, it } from 'vitest';

import { resolveSsl } from './index';

describe('database TLS selection', () => {
  it('disables TLS for a local database', () => {
    expect(resolveSsl('postgresql://postgres:postgres@localhost:5432/chatgpt')).toBe(false);
    expect(resolveSsl('postgresql://postgres:postgres@127.0.0.1:5432/chatgpt')).toBe(false);
  });

  it('enables TLS for any remote host, even without sslmode', () => {
    expect(resolveSsl('postgresql://u:p@ep-abc.eu-central-1.aws.neon.tech/neondb')).toEqual({
      rejectUnauthorized: true,
    });
  });

  /** Managed providers hand out `sslmode=require`, which encrypts without chain verification. */
  it('honours sslmode=require', () => {
    expect(resolveSsl('postgresql://u:p@ep-abc.aws.neon.tech/neondb?sslmode=require')).toEqual({
      rejectUnauthorized: false,
    });
  });

  it('verifies the chain for sslmode=verify-full', () => {
    expect(resolveSsl('postgresql://u:p@ep-abc.aws.neon.tech/neondb?sslmode=verify-full')).toEqual({
      rejectUnauthorized: true,
    });
  });

  it('respects an explicit sslmode=disable', () => {
    expect(resolveSsl('postgresql://u:p@remote.example.com/db?sslmode=disable')).toBe(false);
  });

  it('enables TLS when sslmode is set even on localhost', () => {
    expect(resolveSsl('postgresql://u:p@localhost:5432/db?sslmode=require')).toEqual({
      rejectUnauthorized: false,
    });
  });

  it('does not throw on an unparseable URL', () => {
    expect(resolveSsl('not a url')).toBe(false);
  });
});
