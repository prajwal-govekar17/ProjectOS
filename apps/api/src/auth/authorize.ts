import type { Request } from 'express';
import type { Pool } from 'pg';
import { ApiFailure } from '../errors.ts';
import { authenticateAgent } from './agent-credentials.ts';
import { findUser } from './user.repository.ts';

export interface HumanActor {
  kind: 'human';
  userId: string;
  email: string;
}

export interface AgentActor {
  kind: 'agent';
  credentialId: string;
  projectId: string;
  capabilities: string[];
}

export type Actor = HumanActor | AgentActor;

export function unauthenticated() {
  return new ApiFailure(401, 'UNAUTHENTICATED', 'Valid credentials are required.');
}

export async function getHumanActor(pool: Pool, request: Request): Promise<HumanActor> {
  if (request.get('Authorization') !== undefined) throw unauthenticated();
  const user = request.session.userId && (await findUser(pool, request.session.userId));
  if (!user) throw unauthenticated();
  return { kind: 'human', userId: user.user_id, email: user.email };
}

export async function authenticate(pool: Pool, request: Request): Promise<Actor> {
  const authorization = request.get('Authorization');
  if (authorization === undefined) return getHumanActor(pool, request);
  const credential = await authenticateAgent(pool, authorization);
  if (!credential) throw unauthenticated();
  return {
    kind: 'agent',
    credentialId: credential.credential_id,
    projectId: credential.project_id,
    capabilities: credential.capabilities,
  };
}

export function requireHuman(actor: Actor): HumanActor {
  if (actor.kind !== 'human')
    throw new ApiFailure(403, 'FORBIDDEN', 'A human session is required.');
  return actor;
}

export function requireAgentCapability(actor: AgentActor, projectId: string, capability: string) {
  if (actor.projectId !== projectId) throw new ApiFailure(404, 'NOT_FOUND', 'Project not found.');
  if (!actor.capabilities.includes(capability))
    throw new ApiFailure(403, 'FORBIDDEN', 'Action not permitted.');
}
