import assert from 'node:assert/strict';
import { randomBytes, randomUUID } from 'node:crypto';
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

function record(value: unknown): Record<string, unknown> {
  assert.ok(value && typeof value === 'object' && !Array.isArray(value));
  return Object.fromEntries(Object.entries(value));
}

const PROPOSAL = {
  title: 'Fixture proposal',
  decision: 'Keep the stated rule.',
  rationale: 'Fixture rationale.',
  related_paths: [],
};
const BASE = '/api/projects/review-fixture/decisions';

test(
  'replays proposal creation and applies only authorized, exact-version reviews atomically',
  postgresTestOptions,
  () =>
    withTestDatabase(async ({ client, runtimeRole, runtimeUrl, checkOwner }) => {
      migrate();
      await checkOwner();
      await client.query(`
      GRANT USAGE ON SCHEMA projectos TO ${runtimeRole};
      GRANT SELECT ON projectos.schema_migrations, projectos.projects, projectos.users,
        projectos.project_memberships, projectos.agent_credentials TO ${runtimeRole};
      GRANT UPDATE (last_repository_verified_at) ON projectos.projects TO ${runtimeRole};
      GRANT SELECT, INSERT, UPDATE, DELETE ON projectos.sessions TO ${runtimeRole};
      GRANT SELECT, INSERT ON projectos.decisions, projectos.decision_paths, projectos.decision_links,
        projectos.decision_history, projectos.request_identities TO ${runtimeRole};
      GRANT UPDATE (status, updated_at) ON projectos.decisions TO ${runtimeRole}`);
      const project = randomUUID();
      const foreign = randomUUID();
      const predecessor = randomUUID();
      await client.query(
        `INSERT INTO projectos.projects (id, project_id, name, repository_identity)
      VALUES ($1, 'review-fixture', 'Review fixture', 'git.example.test/fixtures/review'),
             ($2, 'foreign-fixture', 'Foreign fixture', 'git.example.test/fixtures/foreign')`,
        [project, foreign],
      );
      const password = randomBytes(24).toString('hex');
      command('auth/operator-command', ['test', 'provision', 'owner@example.test'], password);
      command('auth/operator-command', ['test', 'provision', 'member@example.test'], password);
      await client.query(
        `INSERT INTO projectos.project_memberships (project_id, user_id, role)
      SELECT $1, user_id, CASE WHEN email = 'owner@example.test' THEN 'owner' ELSE 'member' END
      FROM projectos.users`,
        [project],
      );
      await client.query(
        `INSERT INTO projectos.decisions (id, project_id, decision_id, title, decision, rationale, status, provenance)
      VALUES ($1, $2, 'DEC-050', 'Predecessor fixture', 'Previous rule.', 'Previous rationale.', 'approved', 'fixture'),
      ($3, $4, 'DEC-099', 'Foreign record', 'Foreign rule.', 'Foreign rationale.', 'approved', 'fixture')`,
        [predecessor, project, randomUUID(), foreign],
      );
      const agent = issue('review-fixture');
      const agentHeaders = { authorization: `Bearer ${agent.token}` };
      const secret = randomBytes(32).toString('hex');
      let server = await startServer(runtimeUrl, secret);
      try {
        const call = (path: string, options?: RequestInit) =>
          fetch(`${server.base}${path}`, { ...options, signal: AbortSignal.timeout(5000) });
        const post = (path: string, input: object, headers: Record<string, string>) =>
          call(path, {
            method: 'POST',
            headers: { ...headers, 'content-type': 'application/json' },
            body: JSON.stringify(input),
          });
        const proposal = (
          key: string,
          input: object = PROPOSAL,
          headers: Record<string, string> = agentHeaders,
        ) => post(BASE, input, { ...headers, 'idempotency-key': key });
        const status = async (id: string) => {
          const response = await call(`${BASE}/${id}/status`, { headers: agentHeaders });
          assert.equal(response.status, 200, await response.clone().text());
          return record(await response.json());
        };
        const created = async (response: Response) => {
          assert.equal(response.status, 201, await response.clone().text());
          const body = record(await response.json());
          assert.equal(body.status, 'pending');
          assert.equal(body.version, 1);
          assert.ok(typeof body.decision_id === 'string');
          assert.ok(typeof body.review_url === 'string');
          assert.match(body.review_url, /^\/projects\//);
          return { ...body, decision_id: body.decision_id, review_url: body.review_url };
        };
        const login = async (email: string) => {
          const proxy = { 'x-forwarded-proto': 'https', origin: APP_ORIGIN };
          const preflight = await call('/api/auth/csrf', { headers: proxy });
          const token = record(await preflight.json()).csrf_token;
          const cookie = preflight.headers.get('set-cookie')?.split(';')[0];
          assert.ok(cookie && typeof token === 'string');
          const session = await post(
            '/api/auth/login',
            { email, password },
            { ...proxy, cookie, 'x-csrf-token': token },
          );
          assert.equal(session.status, 200);
          const active = session.headers.get('set-cookie')?.split(';')[0];
          const csrf = record(await session.json()).csrf_token;
          assert.ok(active && typeof csrf === 'string');
          return { ...proxy, cookie: active, 'x-csrf-token': csrf };
        };

        assert.equal((await post(BASE, PROPOSAL, agentHeaders)).status, 400);
        assert.equal(
          (await proposal('invalid-text', { ...PROPOSAL, decision: '\ud800' })).status,
          400,
        );
        assert.equal(
          (await proposal('invalid-path', { ...PROPOSAL, related_paths: ['src/\ud800.ts'] }))
            .status,
          400,
        );
        assert.equal(
          (await proposal('too-long', { ...PROPOSAL, title: 'x'.repeat(161) })).status,
          400,
        );
        const lost = await proposal('lost-response');
        assert.equal(lost.status, 201);
        await lost.body?.cancel();
        await server.stop();
        server = await startServer(runtimeUrl, secret);
        const initial = await created(await proposal('lost-response'));
        assert.equal((await status(initial.decision_id)).status, 'pending');
        assert.equal(
          await status(initial.decision_id).then((entry) => entry.review_url),
          initial.review_url,
        );
        const {
          rows: [saved],
        } = await client.query(
          'SELECT count(*)::int AS count FROM projectos.decisions WHERE project_id = $1 AND title = $2',
          [project, PROPOSAL.title],
        );
        assert.equal(saved.count, 1);
        assert.equal(
          (await proposal('lost-response', { ...PROPOSAL, title: 'Changed' })).status,
          409,
        );
        const simultaneous = await Promise.all([proposal('concurrent'), proposal('concurrent')]);
        const duplicate = await created(simultaneous[0]);
        assert.deepEqual(await created(simultaneous[1]), duplicate);
        assert.notEqual(initial.decision_id, duplicate.decision_id);
        assert.equal(
          (await proposal('missing-related', { ...PROPOSAL, related_decision_ids: ['DEC-099'] }))
            .status,
          404,
        );
        assert.equal(
          (
            await proposal('missing-predecessor', {
              ...PROPOSAL,
              supersedes_decision_id: 'DEC-099',
            })
          ).status,
          404,
        );
        assert.equal(
          (await proposal('unsupported', { ...PROPOSAL, impact_report_id: 'IMP-001' })).status,
          400,
        );
        assert.equal((await call(`${BASE}/DEC-099/status`, { headers: agentHeaders })).status, 404);

        const owner = await login('owner@example.test');
        const member = await login('member@example.test');
        assert.equal(
          (await proposal('lost-response', PROPOSAL, { ...owner, 'x-csrf-token': 'wrong' })).status,
          403,
        );
        const human = await created(await proposal('lost-response', PROPOSAL, owner));
        assert.notEqual(human.decision_id, initial.decision_id);
        const review = (id: string, data: object, headers = owner) =>
          post(`${BASE}/${id}/review`, data, headers);
        const approve = { version: 1, outcome: 'approve' };
        assert.equal(
          (await post(`${BASE}/${initial.decision_id}/review`, approve, agentHeaders)).status,
          403,
        );
        assert.equal((await review(initial.decision_id, approve, member)).status, 403);
        assert.equal(
          (await review(initial.decision_id, approve, { ...owner, 'x-csrf-token': 'wrong' }))
            .status,
          403,
        );
        assert.equal(
          (await review(initial.decision_id, { ...approve, reviewer_id: randomUUID() })).status,
          400,
        );
        assert.equal((await review(initial.decision_id, { ...approve, version: 2 })).status, 409);
        assert.equal(
          (await review(initial.decision_id, { ...approve, feedback: '\ud800' })).status,
          400,
        );
        const reviewResponse = await review(initial.decision_id, {
          ...approve,
          feedback: 'Reviewed fixture.',
        });
        assert.equal(reviewResponse.status, 200);
        const requestId = reviewResponse.headers.get('x-request-id');
        assert.ok(requestId);
        const {
          rows: [audit],
        } = await client.query(
          `SELECT h.request_id, h.review_channel
          FROM projectos.decision_history AS h JOIN projectos.decisions AS d ON d.id = h.decision_id
          WHERE d.project_id = $1 AND d.decision_id = $2 AND h.status = 'approved'`,
          [project, initial.decision_id],
        );
        assert.deepEqual(audit, { request_id: requestId, review_channel: 'dashboard' });
        assert.equal((await review(initial.decision_id, approve)).status, 409);
        const approved = await status(initial.decision_id);
        assert.equal(approved.status, 'approved');
        assert.equal(approved.feedback, 'Reviewed fixture.');
        assert.ok(
          typeof approved.reviewed_at === 'string' &&
            typeof record(approved.reviewer).user_id === 'string',
        );
        assert.deepEqual(await created(await proposal('lost-response')), initial);

        const replacement = {
          ...PROPOSAL,
          supersedes_decision_id: 'DEC-050',
          related_decision_ids: [initial.decision_id],
        };
        const rejected = await created(await proposal('reject-replacement', replacement));
        assert.equal(
          (await review(rejected.decision_id, { version: 1, outcome: 'reject' })).status,
          200,
        );
        assert.equal((await status(rejected.decision_id)).status, 'rejected');
        assert.equal((await status('DEC-050')).status, 'approved');
        assert.deepEqual(
          await created(await proposal('reject-replacement', replacement)),
          rejected,
        );
        const candidates = await Promise.all([
          proposal('replace-one', replacement),
          proposal('replace-two', replacement),
        ]);
        const first = await created(candidates[0]);
        const second = await created(candidates[1]);
        const race = await Promise.all([
          review(first.decision_id, approve),
          review(second.decision_id, approve),
        ]);
        assert.deepEqual(race.map((response) => response.status).sort(), [200, 409]);
        const winner = race[0].ok ? first : second;
        const winnerKey = race[0].ok ? 'replace-one' : 'replace-two';
        assert.equal((await status('DEC-050')).status, 'superseded');
        assert.equal((await status(winner.decision_id)).status, 'approved');
        const {
          rows: [events],
        } = await client.query(
          `SELECT count(*)::int AS count
        FROM projectos.decision_history AS h JOIN projectos.decisions AS d ON d.id = h.decision_id
        WHERE d.supersedes_id = $1 AND h.status = 'approved'`,
          [predecessor],
        );
        assert.equal(events.count, 1);
        const later = { ...PROPOSAL, supersedes_decision_id: winner.decision_id };
        const successor = await created(await proposal('replace-winner', later));
        await checkOwner();
        await client.query(`REVOKE INSERT ON projectos.decision_history FROM ${runtimeRole}`);
        try {
          assert.equal((await review(successor.decision_id, approve)).status, 503);
          assert.equal((await status(successor.decision_id)).status, 'pending');
          assert.equal((await status(winner.decision_id)).status, 'approved');
        } finally {
          await client.query(`GRANT INSERT ON projectos.decision_history TO ${runtimeRole}`);
        }
        assert.equal((await review(successor.decision_id, approve)).status, 200);
        assert.equal((await status(winner.decision_id)).status, 'superseded');
        assert.deepEqual(await created(await proposal(winnerKey, replacement)), winner);
      } finally {
        await server.stop();
      }
    }),
);
