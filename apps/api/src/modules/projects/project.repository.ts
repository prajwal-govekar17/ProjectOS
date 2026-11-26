import { randomUUID } from 'node:crypto';
import type { CreateProjectInput, Project } from '@projectos/contracts';
import type { Pool, PoolClient } from 'pg';

interface ProjectRecord extends CreateProjectInput {
  id: string;
  created_at: Date;
  updated_at: Date;
  last_repository_verified_at: Date | null;
}

function projectResponse(row: ProjectRecord): Project {
  return {
    project_id: row.project_id,
    name: row.name,
    repository_identity: row.repository_identity,
    created_at: row.created_at.toISOString(),
    updated_at: row.updated_at.toISOString(),
    last_repository_verified_at: row.last_repository_verified_at?.toISOString() ?? null,
  };
}

export async function insertProject(
  client: PoolClient,
  ownerId: string,
  input: CreateProjectInput,
) {
  const {
    rows: [project],
  } = await client.query<ProjectRecord>(
    `
    INSERT INTO projectos.projects (id, project_id, name, repository_identity)
    VALUES ($1, $2, $3, $4) RETURNING id, project_id, name, repository_identity, created_at, updated_at, last_repository_verified_at`,
    [randomUUID(), input.project_id, input.name, input.repository_identity],
  );
  await client.query(
    `
    INSERT INTO projectos.project_memberships (project_id, user_id, role) VALUES ($1, $2, 'owner')`,
    [project.id, ownerId],
  );
  return projectResponse(project);
}

export async function findProject(db: Pool, projectId: string, userId?: string) {
  const {
    rows: [project],
  } = await db.query<ProjectRecord>(
    `
    SELECT id, project_id, name, repository_identity, created_at, updated_at, last_repository_verified_at
    FROM projectos.projects AS p WHERE p.project_id = $1 AND ($2::uuid IS NULL OR EXISTS (
      SELECT 1 FROM projectos.project_memberships AS m WHERE m.project_id = p.id AND m.user_id = $2
    ))`,
    [projectId, userId ?? null],
  );
  return project ? projectResponse(project) : undefined;
}

export async function findProjectsForUser(
  db: Pool,
  userId: string,
  cursor: string | null,
  limit: number,
) {
  const { rows } = await db.query<ProjectRecord>(
    `
    SELECT p.id, p.project_id, p.name, p.repository_identity, p.created_at, p.updated_at, p.last_repository_verified_at
    FROM projectos.project_memberships AS m JOIN projectos.projects AS p ON p.id = m.project_id
    WHERE m.user_id = $1 AND ($2::text IS NULL OR p.project_id COLLATE "C" > $2::text COLLATE "C")
    ORDER BY p.project_id COLLATE "C" LIMIT $3`,
    [userId, cursor, limit],
  );
  return rows.map(projectResponse);
}

export async function recordRepositoryVerification(
  db: Pool,
  projectId: string,
  repositoryIdentity: string,
) {
  const {
    rows: [result],
  } = await db.query<{ last_repository_verified_at: Date }>(
    `
    UPDATE projectos.projects
    SET last_repository_verified_at = GREATEST(last_repository_verified_at, statement_timestamp())
    WHERE project_id = $1 AND repository_identity = $2
    RETURNING last_repository_verified_at`,
    [projectId, repositoryIdentity],
  );
  return result?.last_repository_verified_at.toISOString();
}
