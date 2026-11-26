import { resolve, sep } from 'node:path';
import { pathToFileURL } from 'node:url';
import { loadMigrations, runMigrations } from './migrate.ts';
import { createPool, DatabaseSetupError } from './pool.ts';
import { parseMigrationTarget } from './target.ts';

async function main() {
  const [mode, fixtureDirectory, ...extra] = process.argv.slice(2);
  if (
    (mode !== 'development' && mode !== 'production' && mode !== 'test') ||
    (fixtureDirectory && mode !== 'test') ||
    extra.length
  ) {
    throw new DatabaseSetupError('Select a development, production, or test migration target.');
  }

  const target = parseMigrationTarget(mode, process.env);
  const directory = fixtureDirectory && pathToFileURL(resolve(fixtureDirectory) + sep);
  const migrations = await loadMigrations(directory || undefined);
  const pool = createPool(target.url, target.caFile, true);
  try {
    const count = await runMigrations(pool, target, migrations);
    console.info(`Applied ${count} migration(s) to the ${mode} target.`);
  } finally {
    await pool.end();
  }
}

try {
  await main();
} catch (error) {
  console.error(
    error instanceof DatabaseSetupError
      ? error.message
      : 'Unable to migrate the configured database.',
  );
  process.exitCode = 1;
}
