import assert from 'node:assert/strict';
import { execFileSync, spawn } from 'node:child_process';
import { once } from 'node:events';
import { readFileSync } from 'node:fs';
import { createServer } from 'node:net';
import { setTimeout } from 'node:timers/promises';
import pg from 'pg';
import type { Client } from 'pg';

const TEST_VARS = [
  'TEST_DATABASE_URL',
  'TEST_DATABASE_NAME',
  'TEST_DATABASE_ROLE',
  'TEST_DATABASE_SCHEMA',
  'TEST_RUNTIME_DATABASE_URL',
];
const TEST_IDENTIFIER = /^projectos_test(?:_[a-z0-9]+)*$/;
export const APP_ORIGIN = 'https://dashboard.example.test';

function testUrl(value: string | undefined, name: string): URL {
  const url = value && URL.parse(value);
  assert.ok(
    url &&
      ['postgres:', 'postgresql:'].includes(url.protocol) &&
      url.hostname &&
      url.password &&
      !url.search &&
      !url.hash,
    'Expected explicit test credentials.',
  );
  assert.equal(
    decodeURIComponent(url.pathname.slice(1)),
    name,
    'The test URL must name the explicit test database.',
  );
  assert.match(decodeURIComponent(url.username), TEST_IDENTIFIER);
  return url;
}

function testClient(url: URL) {
  const host = url.hostname.replace(/^\[|\]$/g, '');
  const caFile = process.env.TEST_DATABASE_CA_FILE;
  const ca = caFile && readFileSync(caFile, 'utf8');
  return new pg.Client({
    host,
    port: Number(url.port || 5432),
    user: decodeURIComponent(url.username),
    database: decodeURIComponent(url.pathname.slice(1)),
    password: decodeURIComponent(url.password),
    ssl:
      ['127.0.0.1', 'localhost', '::1'].includes(host) && !ca
        ? false
        : { rejectUnauthorized: true, ...(ca ? { ca } : {}) },
    connectionTimeoutMillis: 2000,
    statement_timeout: 3000,
    query_timeout: 3500,
  });
}

async function assertTestIdentity(client: Client, name: string, role: string, isOwner: boolean) {
  const {
    rows: [identity],
  } = await client.query<{
    database_name: string;
    role_name: string;
    login_role: string;
    owns_schema: boolean;
    can_create_schema: boolean;
    can_create_elsewhere: boolean;
    can_create_in_schema: boolean;
    restricted_role: boolean;
  }>(`
    SELECT current_database() AS database_name, current_user AS role_name, session_user AS login_role,
      EXISTS (SELECT 1 FROM pg_namespace WHERE nspname = 'projectos' AND nspowner = r.oid) AS owns_schema,
      has_database_privilege(current_user, current_database(), 'CREATE') AS can_create_schema,
      EXISTS (SELECT 1 FROM pg_namespace WHERE nspname <> 'projectos' AND has_schema_privilege(oid, 'CREATE')) AS can_create_elsewhere,
      has_schema_privilege(current_user, 'projectos', 'CREATE') AS can_create_in_schema,
      NOT (rolsuper OR rolcreatedb OR rolcreaterole OR rolreplication OR rolbypassrls OR EXISTS (
        SELECT 1 FROM pg_auth_members WHERE member = r.oid
      ) OR EXISTS (
        SELECT 1 FROM pg_class AS c JOIN pg_namespace AS n ON c.relnamespace = n.oid
        WHERE n.nspname NOT IN ('projectos', 'pg_catalog', 'information_schema')
          AND c.relkind IN ('r', 'p', 'v', 'f') AND (
          has_table_privilege(c.oid, 'INSERT, UPDATE, DELETE, TRUNCATE, TRIGGER')
          OR has_any_column_privilege(c.oid, 'INSERT, UPDATE')
        )
      )) AS restricted_role
    FROM pg_roles AS r WHERE rolname = current_user`);
  assert.deepEqual(
    identity,
    {
      database_name: name,
      role_name: role,
      login_role: role,
      owns_schema: isOwner,
      can_create_schema: false,
      can_create_elsewhere: false,
      can_create_in_schema: isOwner,
      restricted_role: true,
    },
    'Refusing to use a database connection outside the dedicated test target.',
  );
}

async function availablePort() {
  const listener = createServer().listen(0, '127.0.0.1');
  await once(listener, 'listening');
  const address = listener.address();
  assert.ok(address && typeof address === 'object');
  listener.close();
  await once(listener, 'close');
  return address.port;
}

export async function startServer(url: URL, sessionSecret: string) {
  const port = await availablePort();
  const base = `http://127.0.0.1:${port}`;
  const child = spawn(process.execPath, ['apps/api/dist/server.js'], {
    env: {
      ...process.env,
      PORT: String(port),
      DATABASE_URL: url.toString(),
      DATABASE_CA_FILE: process.env.TEST_DATABASE_CA_FILE,
      SESSION_SECRET: sessionSecret,
      APP_ORIGIN,
    },
    stdio: ['ignore', 'ignore', 'ignore'],
  });
  const stop = async () => {
    if (child.exitCode !== null || child.signalCode !== null) return;
    const exit = once(child, 'exit');
    child.kill('SIGTERM');
    await exit;
  };
  try {
    for (let poll = 0; poll < 60; poll++) {
      assert.equal(child.exitCode, null, 'The test server exited before listening.');
      const response = await fetch(`${base}/healthz`, { signal: AbortSignal.timeout(600) }).catch(
        () => undefined,
      );
      if (response?.ok) {
        await response.text();
        return { base, stop };
      }
      await setTimeout(50);
    }
    assert.fail('The test server did not become live.');
  } catch (error) {
    await stop();
    throw error;
  }
}

export function command(file: string, args: string[], input?: string): string {
  return execFileSync(process.execPath, [`apps/api/src/${file}.ts`, ...args], {
    encoding: 'utf8',
    input,
    stdio: ['pipe', 'pipe', 'pipe'],
    timeout: 12_000,
  });
}

export function migrate(directory?: string) {
  return command('db/migration-command', directory ? ['test', directory] : ['test']);
}

export function issue(projectId: string) {
  const body: unknown = JSON.parse(
    command('auth/operator-command', ['test', 'issue', projectId, '1']),
  );
  assert.ok(body && typeof body === 'object' && 'token' in body && 'credential_id' in body);
  assert.ok(typeof body.token === 'string' && typeof body.credential_id === 'string');
  return { token: body.token, id: body.credential_id };
}

export const postgresTestOptions = {
  skip: TEST_VARS.every((key) => process.env[key] === undefined)
    ? 'dedicated PostgreSQL test credentials are unset'
    : false,
  timeout: 45_000,
};

export async function withTestDatabase(
  work: (target: {
    client: Client;
    runtimeRole: string;
    runtimeUrl: URL;
    checkOwner: () => Promise<void>;
  }) => Promise<void>,
) {
  const testName = process.env.TEST_DATABASE_NAME;
  const ownerRole = process.env.TEST_DATABASE_ROLE;
  assert.ok(testName && TEST_IDENTIFIER.test(testName));
  assert.ok(ownerRole && TEST_IDENTIFIER.test(ownerRole));
  assert.equal(process.env.TEST_DATABASE_SCHEMA, 'projectos');
  const ownerUrl = testUrl(process.env.TEST_DATABASE_URL, testName);
  const runtimeUrl = testUrl(process.env.TEST_RUNTIME_DATABASE_URL, testName);
  assert.equal(decodeURIComponent(ownerUrl.username), ownerRole);
  assert.equal(runtimeUrl.host, ownerUrl.host);
  const runtimeRole = decodeURIComponent(runtimeUrl.username);
  assert.notEqual(runtimeRole, ownerRole);

  const client = testClient(ownerUrl);
  const runtimeClient = testClient(runtimeUrl);

  const checkOwner = () => assertTestIdentity(client, testName, ownerRole, true);
  let shouldClean = false;
  try {
    await client.connect();
    await assertTestIdentity(client, testName, ownerRole, true);
    // Test files can run in parallel. Hold this lock through cleanup.
    let isLocked = false;
    for (let attempt = 0; attempt < 150 && !isLocked; attempt++) {
      const {
        rows: [lock],
      } = await client.query<{ acquired: boolean }>(
        'SELECT pg_try_advisory_lock(16471409) AS acquired',
      );
      isLocked = lock.acquired;
      if (!isLocked) await setTimeout(100);
    }
    assert.ok(isLocked, 'Another integration test holds the dedicated database.');
    await runtimeClient.connect();
    await assertTestIdentity(runtimeClient, testName, runtimeRole, false);
    const {
      rows: [before],
    } = await client.query<{ count: string }>(`
      SELECT count(*)::text AS count FROM pg_class AS c JOIN pg_namespace AS n ON n.oid = c.relnamespace
      WHERE n.nspname = 'projectos'`);
    assert.equal(
      before.count,
      '0',
      'The integration test needs an empty, dedicated projectos schema.',
    );
    shouldClean = true;
    await work({ client, runtimeRole, runtimeUrl, checkOwner });
  } finally {
    await runtimeClient.end();
    try {
      if (shouldClean) {
        await checkOwner();
        await client.query(`DROP TABLE IF EXISTS projectos.rollback_marker, projectos.request_identities, projectos.decision_links,
          projectos.decision_history, projectos.decision_paths, projectos.decisions, projectos.agent_credentials,
          projectos.sessions, projectos.project_memberships, projectos.projects, projectos.users,
          projectos.schema_migrations`);
      }
    } finally {
      await client.end();
    }
  }
}
