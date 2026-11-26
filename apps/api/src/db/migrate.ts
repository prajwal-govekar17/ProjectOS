import { createHash } from 'node:crypto';
import { readFile, readdir } from 'node:fs/promises';
import type { Pool } from 'pg';
import { DatabaseSetupError } from './pool.ts';
import { verifyMigrationTarget } from './target.ts';
import type { MigrationTarget } from './target.ts';
import { withTransaction } from './with-transaction.ts';

const ADVISORY_LOCK = 1484928371;
const MIGRATIONS_DIRECTORY = new URL('../../migrations/', import.meta.url);

export interface Migration {
  filename: string;
  version: string;
  checksum: string;
  sql: string;
}

interface AppliedMigration {
  version: string;
  filename: string;
  checksum: string;
}

export async function loadMigrations(directory = MIGRATIONS_DIRECTORY): Promise<Migration[]> {
  const files = (await readdir(directory)).filter((file) => file.endsWith('.sql')).sort();
  const versions = new Set<string>();
  const migrations = [];
  for (const filename of files) {
    const version = /^(\d{4})-[a-z0-9]+(?:-[a-z0-9]+)*\.sql$/.exec(filename)?.[1];
    if (!version || versions.has(version))
      throw new DatabaseSetupError('Invalid or duplicate migration version.');
    versions.add(version);
    const source = await readFile(new URL(filename, directory));
    migrations.push({
      filename,
      version,
      checksum: createHash('sha256').update(source).digest('hex'),
      sql: source.toString('utf8'),
    });
  }
  if (!migrations.length) throw new DatabaseSetupError('No migrations found.');
  return migrations;
}

const APPLIED_MIGRATIONS_SQL =
  'SELECT version, filename, checksum FROM projectos.schema_migrations ORDER BY version';

export async function runMigrations(pool: Pool, target: MigrationTarget, migrations: Migration[]) {
  return withTransaction(pool, async (client) => {
    await verifyMigrationTarget(target, (sql, values) => client.query(sql, values));
    await client.query('SELECT pg_advisory_xact_lock($1)', [ADVISORY_LOCK]);
    await client.query(`
      REVOKE ALL ON SCHEMA projectos FROM PUBLIC;
      CREATE TABLE IF NOT EXISTS projectos.schema_migrations (
        version text PRIMARY KEY,
        filename text NOT NULL,
        checksum text NOT NULL,
        applied_at timestamptz NOT NULL DEFAULT now()
      );
      REVOKE ALL ON TABLE projectos.schema_migrations FROM PUBLIC;
    `);
    const { rows: applied } = await client.query<AppliedMigration>(APPLIED_MIGRATIONS_SQL);
    for (const [index, row] of applied.entries()) {
      const expected = migrations[index];
      if (
        !expected ||
        row.version !== expected.version ||
        row.filename !== expected.filename ||
        row.checksum !== expected.checksum
      ) {
        throw new DatabaseSetupError(`Migration history differs at version ${row.version}.`);
      }
    }

    const pending = migrations.slice(applied.length);
    for (const migration of pending) {
      try {
        await client.query(migration.sql);
        await client.query(
          'INSERT INTO projectos.schema_migrations (version, filename, checksum) VALUES ($1, $2, $3)',
          [migration.version, migration.filename, migration.checksum],
        );
      } catch {
        throw new DatabaseSetupError(`Migration ${migration.filename} failed.`);
      }
    }
    return pending.length;
  });
}

export async function isDatabaseReady(pool: Pool, required: Migration[]) {
  const { rows } = await pool.query<AppliedMigration>(APPLIED_MIGRATIONS_SQL);
  return required.every(({ version, filename, checksum }, index) => {
    const row = rows[index];
    return row?.version === version && row.filename === filename && row.checksum === checksum;
  });
}
