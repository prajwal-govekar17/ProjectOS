import assert from 'node:assert/strict';
import { test } from 'node:test';
import { parseEnv } from './env.ts';

test('defaults local configuration and normalizes an explicit app origin', () => {
  assert.deepEqual(parseEnv({}), { port: 3000, appOrigin: 'http://localhost:5173' });
  assert.deepEqual(parseEnv({ PORT: '65535', APP_ORIGIN: 'https://dashboard.example/' }), {
    port: 65535,
    appOrigin: 'https://dashboard.example',
  });
});

test('identifies invalid config keys without including their values', () => {
  assert.throws(
    () => parseEnv({ PORT: '65536', APP_ORIGIN: 'https://user:private-value@example.test' }),
    { message: 'Invalid configuration variables: PORT, APP_ORIGIN.' },
  );
  assert.throws(() => parseEnv({ PORT: '1e3' }), {
    message: 'Invalid configuration variables: PORT.',
  });
  assert.throws(
    () => parseEnv({ APP_ORIGIN: 'malformed-fixture-origin' }),
    (error: unknown) => {
      assert.ok(error instanceof Error);
      assert.equal(error.message, 'Invalid configuration variables: APP_ORIGIN.');
      assert.equal('input' in error, false);
      return true;
    },
  );
});
