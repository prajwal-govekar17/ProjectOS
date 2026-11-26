import { readFileSync } from 'node:fs';
import pg from 'pg';
import type { PoolConfig } from 'pg';

export const DATABASE_SCHEMA = 'projectos';

export class DatabaseSetupError extends Error {}

export function databaseUrl(value: string | undefined): URL {
  const url = value && URL.parse(value);
  if (
    !url ||
    !['postgres:', 'postgresql:'].includes(url.protocol) ||
    !url.hostname ||
    !url.username ||
    !url.password ||
    !/^\/[^/]+$/.test(url.pathname) ||
    url.search ||
    url.hash ||
    (url.port && (+url.port < 1 || +url.port > 65535))
  ) {
    throw new DatabaseSetupError(
      'Expected a PostgreSQL URL with an explicit database and credentials.',
    );
  }
  try {
    decodeURIComponent(url.username);
    decodeURIComponent(url.password);
    decodeURIComponent(url.pathname);
  } catch {
    throw new DatabaseSetupError('Invalid encoding in PostgreSQL URL.');
  }
  return url;
}

export function poolOptions(url: URL, caFile?: string): PoolConfig {
  const host = url.hostname.replace(/^\[|\]$/g, '');
  const isLoopback = ['localhost', '127.0.0.1', '::1'].includes(host);
  let ca: string | undefined;
  if (caFile) {
    try {
      ca = readFileSync(caFile, 'utf8');
    } catch {
      throw new DatabaseSetupError('Unable to read the configured database CA file.');
    }
  }

  return {
    host,
    port: url.port ? Number(url.port) : 5432,
    user: decodeURIComponent(url.username),
    password: decodeURIComponent(url.password),
    database: decodeURIComponent(url.pathname.slice(1)),
    ssl: isLoopback && !caFile ? false : { rejectUnauthorized: true, ...(ca ? { ca } : {}) },
    connectionTimeoutMillis: isLoopback ? 1500 : 10_000,
    idleTimeoutMillis: 10_000,
    statement_timeout: 2500,
    query_timeout: 3000,
    max: 8,
  };
}

export function createPool(url: URL, caFile?: string, isOperator = false) {
  const pool = new pg.Pool({
    ...poolOptions(url, caFile),
    ...(isOperator ? { max: 1, statement_timeout: 30_000, query_timeout: 32_000 } : {}),
  });
  pool.on('error', () => console.error('Idle PostgreSQL connection failed.'));
  return pool;
}
