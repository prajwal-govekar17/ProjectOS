import { randomUUID } from 'node:crypto';
import type { Pool } from 'pg';

interface UserRecord {
  user_id: string;
  email: string;
}

export async function findUser(db: Pick<Pool, 'query'>, userId: string) {
  const { rows } = await db.query<UserRecord>(
    'SELECT user_id, email FROM projectos.users WHERE user_id = $1',
    [userId],
  );
  return rows[0];
}

export async function findUserForLogin(db: Pick<Pool, 'query'>, email: string) {
  const { rows } = await db.query<UserRecord & { password_hash: string }>(
    'SELECT user_id, email, password_hash FROM projectos.users WHERE email = $1',
    [email.toLowerCase()],
  );
  return rows[0];
}

export async function provisionUser(db: Pick<Pool, 'query'>, email: string, passwordHash: string) {
  const userId = randomUUID();
  const { rowCount } = await db.query(
    `
    INSERT INTO projectos.users (user_id, email, password_hash) VALUES ($1, $2, $3)
    ON CONFLICT (email) DO NOTHING`,
    [userId, email.toLowerCase(), passwordHash],
  );
  return rowCount ? userId : undefined;
}
