import { readFileSync } from 'node:fs';
import { loginInputSchema, projectIdSchema } from '@projectos/contracts';
import { z } from 'zod';
import { createPool, DatabaseSetupError } from '../db/pool.ts';
import { parseMigrationTarget, verifyMigrationTarget } from '../db/target.ts';
import { withTransaction } from '../db/with-transaction.ts';
import { revokeAgentCredential } from './agent-credential.repository.ts';
import { issueAgentCredential } from './agent-credentials.ts';
import { hashPassword } from './password.ts';
import { provisionUser } from './user.repository.ts';

const issueInputSchema = z.tuple([
  projectIdSchema,
  z.string().regex(/^\d+$/).transform(Number).pipe(z.number().int().min(1).max(720)),
]);

async function main() {
  const [mode, operation, ...args] = process.argv.slice(2);
  if (mode !== 'development' && mode !== 'production' && mode !== 'test') {
    throw new DatabaseSetupError('Select an explicit operator database target.');
  }

  const target = parseMigrationTarget(mode, process.env);
  let user: { email: string; hash: string } | undefined;
  if (operation === 'provision') {
    if (mode === 'production' || args.length !== 1) {
      throw new DatabaseSetupError('User provisioning requires a development target and an email.');
    }
    const password = readFileSync(0, { encoding: 'utf8' });
    const input = loginInputSchema.safeParse({ email: args[0], password });
    if (!input.success || input.data.password.length < 12) {
      throw new DatabaseSetupError(
        'Provide a valid email and a password of at least 12 characters on stdin.',
      );
    }
    user = { email: input.data.email, hash: await hashPassword(input.data.password) };
  }
  const pool = createPool(target.url, target.caFile, true);
  try {
    const output = await withTransaction(pool, async (client) => {
      await verifyMigrationTarget(target, (sql, values) => client.query(sql, values));
      if (user) {
        const userId = await provisionUser(client, user.email, user.hash);
        if (!userId) throw new DatabaseSetupError('A user with that email already exists.');
        return { user_id: userId };
      }

      if (operation === 'issue') {
        const input = issueInputSchema.safeParse(args);
        if (!input.success)
          throw new DatabaseSetupError('Provide a project ID and a lifetime of 1–720 hours.');
        const result = await issueAgentCredential(client, ...input.data);
        if (!result) throw new DatabaseSetupError('Project not found.');
        return result;
      }

      if (operation === 'revoke' && args.length === 1 && z.uuid().safeParse(args[0]).success) {
        const isRevoked = await revokeAgentCredential(client, args[0]);
        if (!isRevoked) throw new DatabaseSetupError('Agent credential not found.');
        return { credential_id: args[0], revoked: true };
      }

      throw new DatabaseSetupError(
        'Select provision, issue, or revoke and supply the required arguments.',
      );
    });
    process.stdout.write(`${JSON.stringify(output)}\n`);
  } finally {
    await pool.end();
  }
}

try {
  await main();
} catch (error) {
  console.error(
    error instanceof DatabaseSetupError ? error.message : 'Database operator command failed.',
  );
  process.exitCode = 1;
}
