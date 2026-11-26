import type { PoolClient } from 'pg';

interface RequestIdentity {
  projectId: string;
  principalKind: 'agent' | 'human';
  principalId: string;
  operation: string;
  requestKey: string;
}

export async function findRequest<T>(client: PoolClient, identity: RequestIdentity) {
  const {
    rows: [request],
  } = await client.query<{ payload_digest: string; response: T }>(
    `
    SELECT payload_digest, response FROM projectos.request_identities
    WHERE project_id = $1 AND principal_kind = $2 AND principal_id = $3
      AND operation = $4 AND request_key = $5`,
    [
      identity.projectId,
      identity.principalKind,
      identity.principalId,
      identity.operation,
      identity.requestKey,
    ],
  );
  return request;
}

export async function saveRequest(
  client: PoolClient,
  identity: RequestIdentity,
  payloadDigest: string,
  response: object,
) {
  await client.query(
    `
    INSERT INTO projectos.request_identities
      (project_id, principal_kind, principal_id, operation, request_key, payload_digest, response)
    VALUES ($1, $2, $3, $4, $5, $6, $7)`,
    [
      identity.projectId,
      identity.principalKind,
      identity.principalId,
      identity.operation,
      identity.requestKey,
      payloadDigest,
      response,
    ],
  );
}
