import type {
  CreateProjectInput,
  ProjectListQuery,
  ProjectListResponse,
} from '@projectos/contracts';
import type { Pool } from 'pg';
import { requireAgentCapability, requireHuman } from '../../auth/authorize.ts';
import type { Actor } from '../../auth/authorize.ts';
import { withTransaction } from '../../db/with-transaction.ts';
import { ApiFailure } from '../../errors.ts';
import {
  findProject,
  findProjectsForUser,
  insertProject,
  recordRepositoryVerification,
} from './project.repository.ts';

export async function createProject(pool: Pool, actor: Actor, input: CreateProjectInput) {
  const human = requireHuman(actor);
  try {
    return await withTransaction(pool, (client) => insertProject(client, human.userId, input));
  } catch (error) {
    if (
      error instanceof Error &&
      'code' in error &&
      error.code === '23505' &&
      'constraint' in error &&
      error.constraint === 'projects_project_id_key'
    ) {
      throw new ApiFailure(409, 'CONFLICT', 'Project ID is already in use.');
    }
    throw error;
  }
}

export async function getProject(pool: Pool, actor: Actor, projectId: string) {
  return requireProjectAccess(pool, actor, projectId, 'project:read');
}

export async function requireProjectAccess(
  pool: Pool,
  actor: Actor,
  projectId: string,
  capability: string,
) {
  if (actor.kind === 'agent') requireAgentCapability(actor, projectId, capability);
  const project = await findProject(
    pool,
    projectId,
    actor.kind === 'human' ? actor.userId : undefined,
  );
  if (!project) throw new ApiFailure(404, 'NOT_FOUND', 'Project not found.');
  return project;
}

export async function verifyProjectRepository(
  pool: Pool,
  actor: Actor,
  projectId: string,
  repositoryIdentity: string,
) {
  if (actor.kind !== 'agent')
    throw new ApiFailure(403, 'FORBIDDEN', 'A scoped agent credential is required.');
  await requireProjectAccess(pool, actor, projectId, 'repository:verify');
  const verifiedAt = await recordRepositoryVerification(pool, projectId, repositoryIdentity);
  if (!verifiedAt)
    throw new ApiFailure(409, 'CONFLICT', 'Repository identity does not match the project.');
  return { last_repository_verified_at: verifiedAt };
}

export async function listProjects(
  pool: Pool,
  actor: Actor,
  query: ProjectListQuery,
): Promise<ProjectListResponse> {
  const human = requireHuman(actor);
  const results = await findProjectsForUser(
    pool,
    human.userId,
    query.cursor ?? null,
    query.limit + 1,
  );
  const projects = results.slice(0, query.limit);
  return {
    projects,
    next_cursor: results.length > query.limit ? (projects.at(-1)?.project_id ?? null) : null,
  };
}
