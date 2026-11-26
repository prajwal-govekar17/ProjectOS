import { createHash, randomBytes, randomUUID } from 'node:crypto';
import type { Pool } from 'pg';
import { findAgentCredential, insertAgentCredential } from './agent-credential.repository.ts';

const PROTOTYPE_CAPABILITIES = [
  'project:read',
  'decision:read',
  'repository:verify',
  'decision:propose',
] as const;

function digestToken(token: string) {
  return createHash('sha256').update(token).digest();
}

export async function authenticateAgent(db: Pick<Pool, 'query'>, authorization: string) {
  const token = /^Bearer ([A-Za-z0-9_-]{43})$/i.exec(authorization)?.[1];
  return token ? findAgentCredential(db, digestToken(token)) : undefined;
}

export async function issueAgentCredential(
  db: Pick<Pool, 'query'>,
  projectId: string,
  ttlHours: number,
) {
  const token = randomBytes(32).toString('base64url');
  const credentialId = randomUUID();
  const expiresAt = new Date(Date.now() + ttlHours * 60 * 60 * 1000);
  const isIssued = await insertAgentCredential(
    db,
    projectId,
    credentialId,
    digestToken(token),
    PROTOTYPE_CAPABILITIES,
    expiresAt,
  );
  return isIssued
    ? { credential_id: credentialId, token, expires_at: expiresAt.toISOString() }
    : undefined;
}
