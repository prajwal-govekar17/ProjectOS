import {
  createProjectInputSchema,
  projectIdSchema,
  projectListQuerySchema,
  repositoryVerificationInputSchema,
} from '@projectos/contracts';
import { Router } from 'express';
import type { Pool } from 'pg';
import { authenticate, requireHuman } from '../../auth/authorize.ts';
import { requireCsrf } from '../../auth/session.ts';
import { ApiFailure } from '../../errors.ts';
import {
  createProject,
  getProject,
  listProjects,
  verifyProjectRepository,
} from './project.service.ts';

export function createProjectRoutes(pool: Pool, appOrigin: string) {
  const router = Router();
  router.post('/', async (request, response) => {
    const actor = requireHuman(await authenticate(pool, request));
    requireCsrf(request, appOrigin);
    const input = createProjectInputSchema.safeParse(request.body);
    if (!input.success) throw new ApiFailure(400, 'INVALID_INPUT', 'Invalid project input.');
    response.status(201).json(await createProject(pool, actor, input.data));
  });

  router.get('/', async (request, response) => {
    const actor = requireHuman(await authenticate(pool, request));
    const input = projectListQuerySchema.safeParse(request.query);
    if (!input.success) throw new ApiFailure(400, 'INVALID_INPUT', 'Invalid project list query.');
    response.json(await listProjects(pool, actor, input.data));
  });

  router.get('/:projectId', async (request, response) => {
    const actor = await authenticate(pool, request);
    const id = projectIdSchema.safeParse(request.params.projectId);
    if (!id.success) throw new ApiFailure(400, 'INVALID_INPUT', 'Invalid project ID.');
    response.json(await getProject(pool, actor, id.data));
  });

  router.post('/:projectId/repository-verifications', async (request, response) => {
    const actor = await authenticate(pool, request);
    const id = projectIdSchema.safeParse(request.params.projectId);
    if (!id.success) throw new ApiFailure(400, 'INVALID_INPUT', 'Invalid project ID.');
    const input = repositoryVerificationInputSchema.safeParse(request.body);
    if (!input.success)
      throw new ApiFailure(400, 'INVALID_INPUT', 'Invalid repository verification input.');
    response.json(
      await verifyProjectRepository(pool, actor, id.data, input.data.repository_identity),
    );
  });

  return router;
}
