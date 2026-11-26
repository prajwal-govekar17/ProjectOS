import assert from 'node:assert/strict';
import { execFileSync } from 'node:child_process';
import { randomBytes, randomUUID } from 'node:crypto';
import { mkdtemp, rm, writeFile } from 'node:fs/promises';
import { tmpdir } from 'node:os';
import { join } from 'node:path';
import { test } from 'node:test';
import {
  issue,
  migrate,
  postgresTestOptions,
  startServer,
  withTestDatabase,
} from './postgres-fixture.ts';

const PROJECT_ID = `fixture-${randomBytes(5).toString('hex')}`;
const PROJECT_ROUTE = `/api/projects/${PROJECT_ID}`;
const DECISIONS = `${PROJECT_ROUTE}/decisions`;
const VERIFY = `${PROJECT_ROUTE}/repository-verifications`;
const REPOSITORY = 'git.example.test/fixtures/retrieval';
const RELATED_PATH = 'lib/fixtureEntry.ts';
const SEED = {
  repository_identity: REPOSITORY,
  decision_id: 'DEC-017',
  title: 'Fixture title',
  decision: 'Fixture statement.',
  rationale: 'Stored fixture rationale.',
  status: 'approved',
  related_paths: [RELATED_PATH],
};

function record(input: unknown): Record<string, unknown> {
  assert.ok(input !== null && typeof input === 'object' && !Array.isArray(input));
  return Object.fromEntries(Object.entries(input));
}

async function decisionList(response: Response) {
  assert.equal(response.status, 200, await response.clone().text());
  const body = record(await response.json());
  assert.ok(Array.isArray(body.decisions));
  const decisions = body.decisions.map(record);
  return { decisions, ids: decisions.map((item) => item.decision_id), truncated: body.truncated };
}

function seed(projectId: string, fixture: object | string = SEED) {
  const source = typeof fixture === 'string' ? fixture : '-';
  return execFileSync(process.execPath, ['scripts/seed-demo.ts', 'test', projectId, source], {
    encoding: 'utf8',
    input: source === '-' ? JSON.stringify(fixture) : undefined,
    stdio: ['pipe', 'pipe', 'pipe'],
    timeout: 10_000,
  });
}

test(
  'Project Brain filters, safe history, and repository-binding persistence',
  postgresTestOptions,
  () =>
    withTestDatabase(async ({ client, runtimeRole, runtimeUrl, checkOwner }) => {
      migrate();
      await checkOwner();
      await client.query(`
      GRANT USAGE ON SCHEMA projectos TO ${runtimeRole};
      GRANT SELECT ON projectos.schema_migrations, projectos.projects, projectos.agent_credentials,
        projectos.decisions, projectos.decision_paths, projectos.decision_links, projectos.decision_history TO ${runtimeRole};
      GRANT UPDATE (last_repository_verified_at) ON projectos.projects TO ${runtimeRole}`);
      const project = randomUUID();
      const foreign = randomUUID();
      await client.query(
        `INSERT INTO projectos.projects (id, project_id, name, repository_identity)
      VALUES ($1, $2, 'Retrieval fixture', $3), ($4, 'other-project', 'Other project', 'example.test/other')`,
        [project, PROJECT_ID, REPOSITORY, foreign],
      );
      const projectCredential = issue(PROJECT_ID);
      const otherCredential = issue('other-project');
      const projectHeaders = { authorization: `Bearer ${projectCredential.token}` };
      const otherHeaders = { authorization: `Bearer ${otherCredential.token}` };
      const secret = randomBytes(32).toString('hex');
      let server = await startServer(runtimeUrl, secret);

      try {
        const call = (path: string, options?: RequestInit) =>
          fetch(`${server.base}${path}`, {
            headers: projectHeaders,
            ...options,
            signal: AbortSignal.timeout(5000),
          });
        const read = async (query = '') => decisionList(await call(`${DECISIONS}${query}`));
        const verify = (identity: string, path = VERIFY) =>
          call(path, {
            method: 'POST',
            headers: { ...projectHeaders, 'content-type': 'application/json' },
            body: JSON.stringify({ repository_identity: identity }),
          });

        assert.equal((await call('/readyz')).status, 200);
        assert.deepEqual((await read()).ids, []);
        assert.throws(() => seed('other-project'), /does not match the fixture repository/);
        assert.match(seed(PROJECT_ID), /Seeded fixture decision DEC-017/);
        assert.match(seed(PROJECT_ID), /already exists/);
        assert.throws(
          () => seed(PROJECT_ID, { ...SEED, rationale: 'Changed fixture.' }),
          /Existing decision does not match the fixture/,
        );
        assert.throws(
          () => seed(PROJECT_ID, { ...SEED, related_paths: ['other.js'] }),
          /Existing decision does not match the fixture/,
        );
        const secondSeed = {
          ...SEED,
          repository_identity: 'example.test/other',
          decision_id: 'DEC-207',
          title: 'Second fixture title',
          status: 'pending',
          related_paths: ['index.js'],
        };
        const directory = await mkdtemp(join(tmpdir(), 'projectos-seed-'));
        try {
          const source = join(directory, 'selection.json');
          await writeFile(source, JSON.stringify(secondSeed));
          assert.match(seed('other-project', source), /Seeded fixture decision DEC-207/);
        } finally {
          await rm(directory, { recursive: true, force: true });
        }
        const second = await decisionList(
          await call('/api/projects/other-project/decisions?decision_id=DEC-207', {
            headers: otherHeaders,
          }),
        );
        assert.deepEqual(second.ids, ['DEC-207']);
        assert.equal(second.decisions[0].status, 'pending');
        assert.deepEqual(second.decisions[0].related_paths, ['index.js']);
        assert.deepEqual((await read()).ids, ['DEC-017']);
        const {
          rows: [demo],
        } = await client.query<{ id: string }>(
          'SELECT id FROM projectos.decisions WHERE project_id = $1 AND decision_id = $2',
          [project, 'DEC-017'],
        );

        await checkOwner();
        const pending = randomUUID();
        const superseded = randomUUID();
        const rejected = randomUUID();
        const approved = randomUUID();
        const foreignDecision = randomUUID();
        await client.query(
          `INSERT INTO projectos.decisions (id, project_id, decision_id, title, decision, rationale, status, provenance, created_at)
        VALUES ($1, $2, 'DEC-002', 'Pending permission', 'Fixture pending', 'Pending rationale', 'pending', 'fixture', '2020-01-01'),
        ($3, $2, 'DEC-003', 'Superseded rule', 'Former fixture', 'Old rationale', 'superseded', 'fixture', '2020-01-01'),
        ($4, $2, 'DEC-004', 'Rejected rule', 'Rejected fixture', 'Rejected rationale', 'rejected', 'fixture', '2020-01-01'),
        ($5, $2, 'DEC-005', 'API boundary', 'Keep API reads scoped', 'Routing policy', 'approved', 'fixture', '2020-01-01'),
        ($6, $7, 'DEC-999', 'Foreign decision', 'Foreign fixture', 'Foreign rationale', 'approved', 'fixture', '2020-01-01')`,
          [pending, project, superseded, rejected, approved, foreignDecision, foreign],
        );
        await client.query('UPDATE projectos.decisions SET supersedes_id = $1 WHERE id = $2', [
          superseded,
          demo.id,
        ]);
        await client.query(
          'INSERT INTO projectos.decision_links (project_id, decision_id, related_id) VALUES ($1, $2, $3)',
          [project, demo.id, approved],
        );
        await client.query(
          'INSERT INTO projectos.decision_paths (project_id, decision_id, path) VALUES ($1, $2, $3)',
          [project, approved, 'src/routes.ts'],
        );
        const indexedPath = `${`${'界'.repeat(50)}/`.repeat(6)}${'a'.repeat(118)}`;
        const insertPath = (path: string) =>
          client.query(
            'INSERT INTO projectos.decision_paths (project_id, decision_id, path) VALUES ($1, $2, $3)',
            [project, approved, path],
          );
        await insertPath(indexedPath);
        await assert.rejects(insertPath(`${indexedPath}a`), { code: '23514' });
        await client.query(
          `INSERT INTO projectos.decision_history (id, project_id, decision_id, version, status, occurred_at, provenance)
        SELECT gen_random_uuid(), $1, $2, 1, 'pending', '2020-01-01'::timestamptz + n * interval '1 second', 'fixture'
        FROM generate_series(1, 21) AS n`,
          [project, demo.id],
        );
        await assert.rejects(
          client.query(
            'INSERT INTO projectos.decision_links (project_id, decision_id, related_id) VALUES ($1, $2, $3)',
            [project, demo.id, foreignDecision],
          ),
          { code: '23503' },
        );
        await assert.rejects(
          client.query(
            `INSERT INTO projectos.decision_history (id, project_id, decision_id, version, status, provenance)
        VALUES ($1, $2, $3, 1, 'approved', 'fixture')`,
            [randomUUID(), project, foreignDecision],
          ),
          { code: '23503' },
        );

        assert.deepEqual((await read()).ids, ['DEC-017', 'DEC-005']);
        assert.deepEqual((await read('?include_history=true')).ids, ['DEC-017', 'DEC-005']);
        assert.deepEqual((await read('?status=pending')).ids, ['DEC-002']);
        assert.deepEqual((await read('?decision_id=DEC-002')).ids, ['DEC-002']);
        assert.deepEqual((await read('?decision_id=DEC-003')).ids, ['DEC-003']);
        assert.deepEqual((await read('?decision_id=DEC-004')).ids, ['DEC-004']);
        assert.deepEqual((await read('?decision_id=DEC-002&status=approved')).ids, []);
        assert.deepEqual((await read('?decision_id=DEC-017&query=unmatched')).ids, []);
        assert.deepEqual((await read('?query=UNMATCHED+ASSERTED+STORED')).ids, ['DEC-017']);
        assert.deepEqual((await read('?query=%25')).ids, []);
        assert.deepEqual(
          (await read(`?related_files=missing.ts&related_files=${RELATED_PATH}`)).ids,
          ['DEC-017'],
        );
        assert.deepEqual((await read('?related_files=lib/fixtureentry.ts')).ids, []);
        assert.deepEqual((await read(`?query=BOUNDARY&related_files=${RELATED_PATH}`)).ids, []);
        assert.deepEqual(
          (await read('?query=ROUTING&related_files=src/routes.ts&status=approved')).ids,
          ['DEC-005'],
        );
        assert.equal(
          (await call(`${DECISIONS}?decision_id=DEC-999&include_history=true`)).status,
          404,
        );
        assert.equal(
          (
            await call(
              '/api/projects/other-project/decisions?decision_id=DEC-999&include_history=true',
            )
          ).status,
          404,
        );
        assert.equal(
          (
            await call(`${DECISIONS}?decision_id=DEC-017&include_history=true`, {
              headers: otherHeaders,
            })
          ).status,
          404,
        );
        for (const query of [
          '?limit=0',
          '?limit=51',
          '?include_history=1',
          '?related_files=%2Fsrc%2Findex.ts',
          '?related_files=src%2F..%2Findex.ts',
        ]) {
          assert.equal((await call(DECISIONS + query)).status, 400);
        }

        const {
          decisions: [withoutHistory],
        } = await read('?decision_id=DEC-017&include_history=false');
        assert.deepEqual(withoutHistory.related_decision_ids, ['DEC-005']);
        assert.equal(withoutHistory.supersedes_decision_id, 'DEC-003');
        assert.equal(withoutHistory.provenance, 'fixture');
        assert.equal('history' in withoutHistory, false);
        assert.equal('history_truncated' in withoutHistory, false);
        const {
          decisions: [withHistory],
        } = await read('?decision_id=DEC-017&include_history=true');
        assert.equal(withHistory.history_truncated, true);
        assert.ok(Array.isArray(withHistory.history));
        assert.equal(withHistory.history.length, 20);
        const dates = withHistory.history.map((event) => record(event).occurred_at);
        assert.ok(dates.every((date) => typeof date === 'string' && date.endsWith('Z')));
        assert.deepEqual(dates, [...dates].sort().reverse());

        await checkOwner();
        await client.query(
          `INSERT INTO projectos.decisions (id, project_id, decision_id, title, decision, rationale, status, provenance, created_at)
        SELECT gen_random_uuid(), $1, 'DEC-' || n, 'Limit fixture', 'Fixture', 'Fixture', 'approved', 'fixture', '2010-01-01'
        FROM generate_series(100, 151) AS n`,
          [project],
        );
        const defaultPage = await read();
        assert.equal(defaultPage.ids.length, 10);
        assert.equal(defaultPage.truncated, true);
        const max = await read('?limit=50');
        assert.equal(max.ids.length, 50);
        assert.equal(max.truncated, true);
        assert.deepEqual((await read('?limit=50')).ids, max.ids);

        const initialMetadata = record(await (await call(PROJECT_ROUTE)).json());
        assert.equal(initialMetadata.last_repository_verified_at, null);
        assert.equal((await verify('example.test/wrong')).status, 409);
        assert.equal(
          (await verify(REPOSITORY, '/api/projects/other-project/repository-verifications')).status,
          404,
        );
        assert.equal(
          record(await (await call(PROJECT_ROUTE)).json()).last_repository_verified_at,
          null,
        );
        await client.query(
          `UPDATE projectos.agent_credentials SET capabilities = ARRAY['project:read', 'decision:read'] WHERE credential_id = $1`,
          [projectCredential.id],
        );
        assert.equal((await verify(REPOSITORY)).status, 403);
        await client.query(
          `UPDATE projectos.agent_credentials SET capabilities = array_append(capabilities, 'repository:verify') WHERE credential_id = $1`,
          [projectCredential.id],
        );
        const verification = await verify(REPOSITORY);
        assert.equal(verification.status, 200);
        const verified = record(await verification.json()).last_repository_verified_at;
        assert.ok(typeof verified === 'string' && Number.isFinite(Date.parse(verified)));
        assert.equal((await verify('example.test/wrong')).status, 409);
        await server.stop();
        server = await startServer(runtimeUrl, secret);
        assert.equal(
          record(await (await call(PROJECT_ROUTE)).json()).last_repository_verified_at,
          verified,
        );
        assert.equal((await read('?decision_id=DEC-017')).decisions[0].rationale, SEED.rationale);
      } finally {
        await server.stop();
      }
    }),
);
