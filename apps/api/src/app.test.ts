import assert from 'node:assert/strict';
import { once } from 'node:events';
import { test } from 'node:test';
import { gzipSync } from 'node:zlib';
import { apiErrorSchema } from '@projectos/contracts';
import { createApp } from './app.ts';

test('serves liveness and structured API errors over HTTP', async (t) => {
  const requestId = '8f954a49-14d1-4587-acd8-6f0c8012a99c';
  const app = createApp({ createRequestId: () => requestId });
  const server = app.listen(0, '127.0.0.1');
  t.after(() => server.close());
  await once(server, 'listening');

  const address = server.address();
  assert.ok(address && typeof address === 'object');
  const origin = `http://127.0.0.1:${address.port}`;

  const health = await fetch(`${origin}/healthz`);
  assert.equal(health.status, 200);
  assert.deepEqual(await health.json(), { status: 'ok' });

  const readiness = await fetch(`${origin}/readyz`);
  assert.equal(readiness.status, 503);
  assert.equal(apiErrorSchema.parse(await readiness.json()).error.code, 'SERVICE_UNAVAILABLE');

  const unknownRoute = await fetch(`${origin}/api/unknown`);
  assert.equal(unknownRoute.status, 404);
  assert.equal(unknownRoute.headers.get('x-request-id'), requestId);
  assert.deepEqual(await unknownRoute.json(), {
    error: { code: 'NOT_FOUND', message: 'Route not found.', request_id: requestId },
  });

  const malformedBody = await fetch(`${origin}/api/unknown`, {
    method: 'POST',
    headers: { 'content-type': 'application/json' },
    body: '{"private":"do-not-echo-this-value"',
  });
  assert.equal(malformedBody.status, 400);
  assert.deepEqual(await malformedBody.json(), {
    error: { code: 'INVALID_INPUT', message: 'Invalid JSON body.', request_id: requestId },
  });

  const malformedGzip = await fetch(`${origin}/api/unknown`, {
    method: 'POST',
    headers: { 'content-type': 'application/json', 'content-encoding': 'gzip' },
    body: 'invalid gzip',
  });
  assert.equal(malformedGzip.status, 400);
  assert.deepEqual(await malformedGzip.json(), {
    error: { code: 'INVALID_INPUT', message: 'Invalid JSON body.', request_id: requestId },
  });

  const jsonAtLimit = JSON.stringify({
    value: 'x'.repeat(2 * 1024 * 1024 - '{"value":""}'.length),
  });
  const bodyAtLimit = await fetch(`${origin}/api/unknown`, {
    method: 'POST',
    headers: { 'content-type': 'application/json' },
    body: jsonAtLimit,
  });
  assert.equal(bodyAtLimit.status, 404);
  await bodyAtLimit.text();

  const oversizedBody = await fetch(`${origin}/api/unknown`, {
    method: 'POST',
    headers: { 'content-type': 'application/json', 'content-encoding': 'gzip' },
    body: new Uint8Array(gzipSync(`${jsonAtLimit} `)),
  });
  assert.equal(oversizedBody.status, 413);
  assert.deepEqual(await oversizedBody.json(), {
    error: {
      code: 'PAYLOAD_TOO_LARGE',
      message: 'JSON body exceeds 2 MiB.',
      request_id: requestId,
    },
  });
});
