import { createPool, DatabaseSetupError } from './pool.ts';
import { parseMigrationTarget, verifyMigrationTarget } from './target.ts';

async function main() {
  const [mode, ...extra] = process.argv.slice(2);
  if (extra.length || (mode !== 'development' && mode !== 'production' && mode !== 'test')) {
    throw new DatabaseSetupError('Select an explicit database target for the grant check.');
  }

  const target = parseMigrationTarget(mode, process.env);
  const pool = createPool(target.url, target.caFile, true);
  const client = await pool.connect().catch(async (error: unknown) => {
    await pool.end();
    throw error;
  });
  try {
    await verifyMigrationTarget(target, (sql, values) => client.query(sql, values));
    const { rows } = await client.query<{ unsafe: boolean }>(`
      WITH RECURSIVE
        private_schema AS (SELECT oid FROM pg_namespace WHERE nspname = 'projectos'),
        api_roles AS (SELECT oid FROM pg_roles WHERE rolname IN ('anon', 'authenticated', 'service_role', 'authenticator')),
        dependent_relations (oid) AS (
          SELECT c.oid FROM pg_class AS c JOIN private_schema AS s ON s.oid = c.relnamespace
          UNION
          SELECT r.ev_class FROM pg_rewrite AS r
          JOIN pg_depend AS d ON d.objid = r.oid AND d.classid = 'pg_rewrite'::regclass
          JOIN dependent_relations AS p ON p.oid = d.refobjid AND d.refclassid = 'pg_class'::regclass
        )
      SELECT EXISTS (
        SELECT 1 FROM api_roles AS r CROSS JOIN private_schema AS s
        WHERE has_schema_privilege(r.oid, s.oid, 'USAGE, CREATE')
      ) OR EXISTS (
        SELECT 1 FROM api_roles AS r CROSS JOIN pg_class AS c
        JOIN private_schema AS s ON s.oid = c.relnamespace
        WHERE c.relkind IN ('r', 'p', 'v', 'm', 'f') AND (
          has_table_privilege(r.oid, c.oid, 'SELECT, INSERT, UPDATE, DELETE, TRUNCATE, REFERENCES, TRIGGER')
          OR has_any_column_privilege(r.oid, c.oid, 'SELECT, INSERT, UPDATE, REFERENCES')
        )
      ) OR EXISTS (
        SELECT 1 FROM api_roles AS r CROSS JOIN dependent_relations AS d
        JOIN pg_class AS c ON c.oid = d.oid JOIN pg_namespace AS s ON s.oid = c.relnamespace
        WHERE s.nspname <> 'projectos' AND c.relkind IN ('v', 'm')
          AND has_schema_privilege(r.oid, s.oid, 'USAGE')
          AND has_any_column_privilege(r.oid, c.oid, 'SELECT')
      ) AS unsafe`);
    if (rows[0]?.unsafe !== false)
      throw new DatabaseSetupError(
        'A Data API role has access to private data or a dependent view.',
      );
    console.info(
      'PostgreSQL grants and dependent-view check passed. Verify the hosted Data API is disabled separately.',
    );
  } finally {
    client.release();
    await pool.end();
  }
}

try {
  await main();
} catch (error) {
  console.error(
    error instanceof DatabaseSetupError ? error.message : 'Unable to verify Data API grants.',
  );
  process.exitCode = 1;
}
