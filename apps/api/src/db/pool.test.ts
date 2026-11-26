import assert from 'node:assert/strict';
import { test } from 'node:test';
import { databaseUrl, poolOptions } from './pool.ts';

test('requires checked TLS for remote connections and confines plaintext to loopback', () => {
  assert.deepEqual(
    poolOptions(databaseUrl('postgresql://runtime:fixture@db.example.test/postgres')).ssl,
    { rejectUnauthorized: true },
  );
  assert.equal(poolOptions(databaseUrl('postgresql://runtime:fixture@127.0.0.1/local')).ssl, false);
  assert.throws(() =>
    databaseUrl('postgresql://runtime:fixture@db.example.test/postgres?sslmode=disable'),
  );
});

test('gives hosted database connections time to complete the TLS handshake', () => {
  const url = databaseUrl('postgresql://runtime:fixture@db.example.test/postgres');
  assert.equal(poolOptions(url).connectionTimeoutMillis, 10_000);
});
