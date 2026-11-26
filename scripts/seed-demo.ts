import { spawnSync } from 'node:child_process';
import { fileURLToPath } from 'node:url';

const args = process.argv.slice(2);
const envFile =
  args[0] === 'development'
    ? [
        '--env-file-if-exists=' +
          fileURLToPath(new URL('../.env.migration.development', import.meta.url)),
      ]
    : [];
const command = fileURLToPath(new URL('../apps/api/src/db/seed-demo-command.ts', import.meta.url));
const { status } = spawnSync(process.execPath, [...envFile, command, ...args], {
  stdio: 'inherit',
});
process.exitCode = status ?? 1;
