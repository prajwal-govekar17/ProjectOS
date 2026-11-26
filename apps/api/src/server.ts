import { createApp } from './app.ts';
import { parseEnv } from './config/env.ts';
import { loadMigrations } from './db/migrate.ts';
import { createPool, DatabaseSetupError } from './db/pool.ts';

async function start() {
  const { port, appOrigin, database } = parseEnv(process.env);
  const migrations = database && (await loadMigrations());
  const pool = database && createPool(database.url, database.caFile);
  const host = '127.0.0.1';
  const server = createApp({
    database:
      database && pool && migrations
        ? { pool, migrations, appOrigin, sessionSecret: database.sessionSecret }
        : undefined,
  }).listen(port, host, () => {
    console.info(`ProjectOS API listening at http://${host}:${port}`);
  });

  function stop() {
    server.close(() => {
      pool?.end().catch(() => {
        process.exitCode = 1;
      });
    });
  }
  process.once('SIGINT', stop);
  process.once('SIGTERM', stop);
  server.on('error', () => {
    console.error('Unable to listen on the configured API port.');
    process.exitCode = 1;
    stop();
  });
}

try {
  await start();
} catch (error) {
  const isConfigError =
    error instanceof Error && error.message.startsWith('Invalid configuration variables:');
  console.error(
    isConfigError || error instanceof DatabaseSetupError
      ? error.message
      : 'Unable to start ProjectOS API.',
  );
  process.exitCode = 1;
}
