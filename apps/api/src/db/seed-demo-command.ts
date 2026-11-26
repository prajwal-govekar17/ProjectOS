import { randomUUID } from 'node:crypto';
import { readFileSync } from 'node:fs';
import {
  decisionIdSchema,
  decisionStatusSchema,
  projectIdSchema,
  repositoryIdentitySchema,
  repositoryPathSchema,
} from '@projectos/contracts';
import { z } from 'zod';
import { createPool, DatabaseSetupError } from './pool.ts';
import { parseMigrationTarget, verifyMigrationTarget } from './target.ts';
import { withTransaction } from './with-transaction.ts';

const fixtureTextSchema = z
  .string()
  .min(1)
  .refine((value) => !value.includes('\0'));
const fixtureSchema = z.strictObject({
  repository_identity: repositoryIdentitySchema,
  decision_id: decisionIdSchema,
  title: fixtureTextSchema,
  decision: fixtureTextSchema,
  rationale: fixtureTextSchema,
  status: decisionStatusSchema,
  related_paths: z.array(repositoryPathSchema).transform((paths) => [...new Set(paths)]),
});

function readFixture(source: string) {
  let value: unknown;
  try {
    value = JSON.parse(readFileSync(source === '-' ? 0 : source, 'utf8'));
  } catch {
    throw new DatabaseSetupError('Unable to read the fixture JSON.');
  }
  const fixture = fixtureSchema.safeParse(value);
  if (!fixture.success) throw new DatabaseSetupError('Invalid fixture fields.');
  return fixture.data;
}

async function main() {
  const [mode, projectId, source, ...extra] = process.argv.slice(2);
  if (
    (mode !== 'development' && mode !== 'test') ||
    !projectIdSchema.safeParse(projectId).success ||
    !source ||
    extra.length
  ) {
    throw new DatabaseSetupError(
      'Usage: seed:demo -- <development|test> <project-id> <fixture.json|->',
    );
  }

  const target = parseMigrationTarget(mode, process.env);
  const fixture = readFixture(source);
  const pool = createPool(target.url, target.caFile, true);
  try {
    const didInsert = await withTransaction(pool, async (client) => {
      await verifyMigrationTarget(target, (sql, values) => client.query(sql, values));
      const {
        rows: [project],
      } = await client.query<{ id: string }>(
        `
        SELECT id FROM projectos.projects WHERE project_id = $1 AND repository_identity = $2 FOR NO KEY UPDATE`,
        [projectId, fixture.repository_identity],
      );
      if (!project) throw new DatabaseSetupError('Project does not match the fixture repository.');

      const id = randomUUID();
      const { rowCount } = await client.query(
        `
        INSERT INTO projectos.decisions (id, project_id, decision_id, title, decision, rationale, status, provenance)
        VALUES ($1, $2, $3, $4, $5, $6, $7, 'fixture')
        ON CONFLICT (project_id, decision_id) DO NOTHING`,
        [
          id,
          project.id,
          fixture.decision_id,
          fixture.title,
          fixture.decision,
          fixture.rationale,
          fixture.status,
        ],
      );
      if (!rowCount) {
        const { rowCount: matches } = await client.query(
          `
          SELECT 1 FROM projectos.decisions AS d WHERE d.project_id = $1 AND d.decision_id = $2
            AND d.provenance = 'fixture' AND d.title = $3 AND d.decision = $4 AND d.rationale = $5
            AND ARRAY(SELECT p.path FROM projectos.decision_paths AS p
              WHERE p.project_id = d.project_id AND p.decision_id = d.id ORDER BY p.path COLLATE "C")
            = ARRAY(SELECT path FROM unnest($6::text[]) AS path ORDER BY path COLLATE "C")`,
          [
            project.id,
            fixture.decision_id,
            fixture.title,
            fixture.decision,
            fixture.rationale,
            fixture.related_paths,
          ],
        );
        if (!matches) throw new DatabaseSetupError('Existing decision does not match the fixture.');
        return false;
      }

      await client.query(
        `INSERT INTO projectos.decision_paths (project_id, decision_id, path)
        SELECT $1, $2, path FROM unnest($3::text[]) AS path`,
        [project.id, id, fixture.related_paths],
      );
      await client.query(
        `
        INSERT INTO projectos.decision_history (id, project_id, decision_id, version, status, provenance)
        VALUES ($1, $2, $3, 1, $4, 'fixture')`,
        [randomUUID(), project.id, id, fixture.status],
      );
      return true;
    });
    console.info(
      didInsert
        ? `Seeded fixture decision ${fixture.decision_id}.`
        : `Fixture decision ${fixture.decision_id} already exists.`,
    );
  } finally {
    await pool.end();
  }
}

try {
  await main();
} catch (error) {
  console.error(
    error instanceof DatabaseSetupError ? error.message : 'Unable to seed the fixture decision.',
  );
  process.exitCode = 1;
}
