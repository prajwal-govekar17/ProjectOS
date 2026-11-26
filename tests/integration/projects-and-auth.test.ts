import assert from 'node:assert/strict';
import { createHash, randomBytes } from 'node:crypto';
import { copyFile, mkdtemp, readdir, rm, writeFile } from 'node:fs/promises';
import { tmpdir } from 'node:os';
import { join } from 'node:path';
import { test } from 'node:test';
import {
  APP_ORIGIN,
  command,
  issue,
  migrate,
  postgresTestOptions,
  startServer,
  withTestDatabase,
} from './postgres-fixture.ts';

const MIGRATION = '0001-projects-and-auth.sql';

function csrfToken(body: unknown) {
  assert.ok(
    body && typeof body === 'object' && 'csrf_token' in body && typeof body.csrf_token === 'string',
  );
  return body.csrf_token;
}

function sessionCookie(response: Response) {
  const value = response.headers.get('set-cookie');
  assert.ok(value);
  assert.match(value, /; HttpOnly/i);
  assert.match(value, /; SameSite=Lax/i);
  assert.match(value, /; Secure/i);
  return value.split(';')[0];
}

test(
  'PostgreSQL migrations, persistent browser sessions, and scoped project access',
  postgresTestOptions,
  () =>
    withTestDatabase(async ({ client, runtimeRole, runtimeUrl, checkOwner }) => {
      const fixture = await mkdtemp(join(tmpdir(), 'projectos-migrations-'));
      let server: Awaited<ReturnType<typeof startServer>> | undefined;
      try {
        const secret = randomBytes(32).toString('hex');
        server = await startServer(runtimeUrl, secret);
        const request = (path: string, options?: RequestInit) => {
          assert.ok(server);
          return fetch(`${server.base}${path}`, { ...options, signal: AbortSignal.timeout(6000) });
        };
        assert.equal((await request('/readyz')).status, 503);
        const csrfBeforeMigration = await request('/api/auth/csrf', {
          headers: { 'x-forwarded-proto': 'https' },
        });
        assert.equal(csrfBeforeMigration.status, 503);
        assert.equal(csrfBeforeMigration.headers.has('set-cookie'), false);
        const migrations = (await readdir('apps/api/migrations')).filter((file) =>
          file.endsWith('.sql'),
        );
        assert.match(migrate(), new RegExp(`Applied ${migrations.length} migration`));
        assert.match(migrate(), /Applied 0 migration/);
        assert.match(command('db/verify-data-api', ['test']), /grant.*check passed/i);
        const {
          rows: [apiRole],
        } = await client.query<{ exists: boolean }>(
          "SELECT EXISTS (SELECT 1 FROM pg_roles WHERE rolname = 'anon')",
        );
        if (apiRole.exists) {
          await checkOwner();
          await client.query('GRANT SELECT ON projectos.projects TO anon');
          try {
            assert.throws(
              () => command('db/verify-data-api', ['test']),
              /Data API role has access/,
            );
          } finally {
            await client.query('REVOKE SELECT ON projectos.projects FROM anon');
          }
        }
        await client.query(`
      GRANT USAGE ON SCHEMA projectos TO ${runtimeRole};
      GRANT SELECT ON projectos.schema_migrations, projectos.users, projectos.agent_credentials TO ${runtimeRole};
      GRANT SELECT, INSERT ON projectos.projects, projectos.project_memberships TO ${runtimeRole};
      GRANT SELECT, INSERT, UPDATE, DELETE ON projectos.sessions TO ${runtimeRole};
      GRANT SELECT ON projectos.decisions, projectos.decision_paths, projectos.decision_links, projectos.decision_history TO ${runtimeRole}`);
        assert.deepEqual(await (await request('/readyz')).json(), { status: 'ok' });

        await Promise.all(
          migrations.map((file) => copyFile(`apps/api/migrations/${file}`, join(fixture, file))),
        );
        const failedFile = join(fixture, '9999-broken-fixture.sql');
        await writeFile(
          failedFile,
          'CREATE TABLE projectos.rollback_marker (id int); SELECT 1 / 0;',
        );
        assert.throws(() => migrate(fixture), /Migration 9999-broken-fixture.sql failed/);
        const {
          rows: [rollback],
        } = await client.query<{ marker: string | null; count: number }>(`
      SELECT to_regclass('projectos.rollback_marker')::text AS marker,
        (SELECT count(*)::int FROM projectos.schema_migrations) AS count`);
        assert.deepEqual(rollback, { marker: null, count: migrations.length });
        await writeFile(join(fixture, MIGRATION), '-- changed migration checksum\n', { flag: 'a' });
        assert.throws(() => migrate(fixture), /Migration history differs at version 0001/);

        const password = randomBytes(20).toString('hex');
        const email = 'reviewer@example.test';
        command('auth/operator-command', ['test', 'provision', email], password);
        command('auth/operator-command', ['test', 'provision', 'other@example.test'], password);
        const {
          rows: [passwordRecord],
        } = await client.query<{ password_hash: string }>(
          'SELECT password_hash FROM projectos.users WHERE email = $1',
          [email],
        );
        assert.ok(
          passwordRecord.password_hash !== password,
          'Database must store a password hash.',
        );

        const proxyHeaders = { 'x-forwarded-proto': 'https' };
        const mutationHeaders = {
          ...proxyHeaders,
          origin: APP_ORIGIN,
          'content-type': 'application/json',
        };
        const startLogin = async () => {
          const response = await request('/api/auth/csrf', { headers: proxyHeaders });
          assert.equal(response.status, 200);
          return { cookie: sessionCookie(response), csrf: csrfToken(await response.json()) };
        };
        const login = async (emailAddress: string) => {
          const anonymous = await startLogin();
          const response = await request('/api/auth/login', {
            method: 'POST',
            headers: {
              ...mutationHeaders,
              cookie: anonymous.cookie,
              'x-csrf-token': anonymous.csrf,
            },
            body: JSON.stringify({ email: emailAddress, password }),
          });
          assert.equal(response.status, 200);
          const active = {
            cookie: sessionCookie(response),
            csrf: csrfToken(await response.json()),
          };
          assert.ok(active.cookie !== anonymous.cookie, 'Login must rotate the session ID.');
          assert.ok(active.csrf !== anonymous.csrf, 'Login must rotate the CSRF token.');
          assert.equal(
            (
              await request('/api/auth/session', {
                headers: { ...proxyHeaders, cookie: anonymous.cookie },
              })
            ).status,
            401,
          );
          return active;
        };

        const unauthenticated = await startLogin();
        assert.equal(
          (
            await request('/api/auth/login', {
              method: 'POST',
              headers: { ...mutationHeaders, cookie: unauthenticated.cookie },
              body: JSON.stringify({ email, password }),
            })
          ).status,
          403,
        );
        assert.equal(
          (
            await request('/api/auth/login', {
              method: 'POST',
              headers: {
                ...mutationHeaders,
                cookie: unauthenticated.cookie,
                'x-csrf-token': unauthenticated.csrf,
              },
              body: JSON.stringify({ email, password: 'incorrect-fixture-password' }),
            })
          ).status,
          401,
        );

        const reviewer = await login(email);
        const other = await login('other@example.test');
        const browser = { ...proxyHeaders, cookie: reviewer.cookie };
        const browserWrite = {
          ...mutationHeaders,
          cookie: reviewer.cookie,
          'x-csrf-token': reviewer.csrf,
        };
        const create = (id: string, headers = browserWrite) =>
          request('/api/projects', {
            method: 'POST',
            headers,
            body: JSON.stringify({
              project_id: id,
              name: id,
              repository_identity: `github.com/example/${id}`,
            }),
          });
        assert.equal(
          (
            await create('fixture-project', {
              ...browserWrite,
              origin: 'https://wrong.example.test',
            })
          ).status,
          403,
        );
        assert.equal(
          (
            await create('fixture-project', {
              ...browserWrite,
              'x-csrf-token': unauthenticated.csrf,
            })
          ).status,
          403,
        );
        const invalidName = await request('/api/projects', {
          method: 'POST',
          headers: browserWrite,
          body: JSON.stringify({
            project_id: 'bad-name',
            name: 'bad\0name',
            repository_identity: 'github.com/example/name',
          }),
        });
        assert.equal(invalidName.status, 400);
        assert.equal((await create('fixture-project')).status, 201);
        const brain = await request('/api/projects/fixture-project/decisions', {
          headers: browser,
        });
        assert.equal(brain.status, 200);
        assert.deepEqual(await brain.json(), { decisions: [], truncated: false });
        assert.equal(
          (
            await request('/api/projects/fixture-project/decisions', {
              headers: { ...proxyHeaders, cookie: other.cookie },
            })
          ).status,
          404,
        );
        assert.equal((await create('fixture-project')).status, 409);
        await checkOwner();
        await client.query(`REVOKE INSERT ON projectos.project_memberships FROM ${runtimeRole}`);
        try {
          assert.equal((await create('rolled-back-project')).status, 503);
          const { rowCount } = await client.query(
            'SELECT 1 FROM projectos.projects WHERE project_id = $1',
            ['rolled-back-project'],
          );
          assert.equal(rowCount, 0);
        } finally {
          await client.query(`GRANT INSERT ON projectos.project_memberships TO ${runtimeRole}`);
        }
        assert.equal((await create('other-project')).status, 201);
        assert.equal(
          (
            await request('/api/projects/fixture-project', {
              headers: { ...proxyHeaders, cookie: other.cookie },
            })
          ).status,
          404,
        );
        const page: unknown = await (
          await request('/api/projects?limit=1', { headers: browser })
        ).json();
        assert.ok(page && typeof page === 'object' && 'next_cursor' in page && 'projects' in page);
        assert.equal(page.next_cursor, 'fixture-project');
        assert.ok(Array.isArray(page.projects) && page.projects.length === 1);
        const next: unknown = await (
          await request('/api/projects?limit=1&cursor=fixture-project', { headers: browser })
        ).json();
        assert.ok(next && typeof next === 'object' && 'next_cursor' in next && 'projects' in next);
        assert.equal(next.next_cursor, null);
        assert.ok(Array.isArray(next.projects) && next.projects.length === 1);
        assert.equal(next.projects[0].project_id, 'other-project');
        const {
          rows: [membership],
        } = await client.query<{ count: number }>(
          "SELECT count(*)::int AS count FROM projectos.project_memberships WHERE role = 'owner'",
        );
        assert.equal(membership.count, 2);

        const credential = issue('fixture-project');
        const auth = { authorization: `Bearer ${credential.token}` };
        const {
          rows: [credentialRow],
        } = await client.query<{ token_digest: Buffer; capabilities: string[] }>(
          'SELECT token_digest, capabilities FROM projectos.agent_credentials WHERE credential_id = $1',
          [credential.id],
        );
        assert.deepEqual(
          credentialRow.token_digest,
          createHash('sha256').update(credential.token).digest(),
        );
        assert.deepEqual(credentialRow.capabilities, [
          'project:read',
          'decision:read',
          'repository:verify',
          'decision:propose',
        ]);
        assert.equal(
          (await request('/api/projects/fixture-project', { headers: auth })).status,
          200,
        );
        assert.equal((await request('/api/projects/other-project', { headers: auth })).status, 404);
        assert.equal((await request('/api/projects', { headers: auth })).status, 403);
        assert.equal((await create('agent-project', { ...browserWrite, ...auth })).status, 403);
        assert.equal(
          (await request('/api/auth/session', { headers: { ...browser, ...auth } })).status,
          401,
        );
        command('auth/operator-command', ['test', 'revoke', credential.id]);
        assert.equal(
          (await request('/api/projects/fixture-project', { headers: auth })).status,
          401,
        );
        const aged = issue('fixture-project');
        await checkOwner();
        await client.query(
          "UPDATE projectos.agent_credentials SET expires_at = now() - interval '1 second' WHERE credential_id = $1",
          [aged.id],
        );
        assert.equal(
          (
            await request('/api/projects/fixture-project', {
              headers: { authorization: `Bearer ${aged.token}` },
            })
          ).status,
          401,
        );

        await server.stop();
        server = await startServer(runtimeUrl, secret);
        const session = await request('/api/auth/session', { headers: browser });
        assert.equal(session.status, 200);
        assert.equal(csrfToken(await session.json()), reviewer.csrf);
        assert.equal(
          (await request('/api/projects/fixture-project', { headers: browser })).status,
          200,
        );

        await checkOwner();
        await client.query(
          "UPDATE projectos.sessions SET expire = now() - interval '1 second' WHERE sess->>'userId' = (SELECT user_id::text FROM projectos.users WHERE email = 'other@example.test')",
        );
        assert.equal(
          (
            await request('/api/auth/session', {
              headers: { ...proxyHeaders, cookie: other.cookie },
            })
          ).status,
          401,
        );
        assert.equal(
          (await request('/api/auth/logout', { method: 'POST', headers: browser })).status,
          403,
        );
        const logout = await request('/api/auth/logout', { method: 'POST', headers: browserWrite });
        assert.equal(logout.status, 204);
        assert.match(sessionCookie(logout), /^projectos\.sid=$/);
        assert.equal((await request('/api/auth/session', { headers: browser })).status, 401);
      } finally {
        await server?.stop();
        await rm(fixture, { recursive: true, force: true });
      }
    }),
);
