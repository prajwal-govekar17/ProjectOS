import type { Pool } from 'pg';

interface CredentialRecord {
  credential_id: string;
  project_id: string;
  capabilities: string[];
}

export async function findAgentCredential(db: Pick<Pool, 'query'>, tokenDigest: Buffer) {
  const { rows } = await db.query<CredentialRecord>(
    `
    SELECT c.credential_id, p.project_id, c.capabilities
    FROM projectos.agent_credentials AS c JOIN projectos.projects AS p ON p.id = c.project_id
    WHERE c.token_digest = $1 AND c.revoked_at IS NULL AND c.expires_at > now()`,
    [tokenDigest],
  );
  return rows[0];
}

export async function insertAgentCredential(
  db: Pick<Pool, 'query'>,
  projectId: string,
  credentialId: string,
  digest: Buffer,
  capabilities: readonly string[],
  expiresAt: Date,
) {
  const { rowCount } = await db.query(
    `
    INSERT INTO projectos.agent_credentials (credential_id, project_id, token_digest, capabilities, expires_at)
    SELECT $2, id, $3, $4, $5 FROM projectos.projects WHERE project_id = $1`,
    [projectId, credentialId, digest, capabilities, expiresAt],
  );
  return rowCount === 1;
}

export async function revokeAgentCredential(db: Pick<Pool, 'query'>, credentialId: string) {
  const { rowCount } = await db.query(
    `
    UPDATE projectos.agent_credentials SET revoked_at = COALESCE(revoked_at, now())
    WHERE credential_id = $1`,
    [credentialId],
  );
  return rowCount === 1;
}
