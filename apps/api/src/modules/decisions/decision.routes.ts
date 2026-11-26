import {
  createDecisionProposalInputSchema,
  decisionIdSchema,
  decisionListQuerySchema,
  decisionReviewInputSchema,
  idempotencyKeySchema,
  projectIdSchema,
} from '@projectos/contracts';
import { Router } from 'express';
import type { Pool } from 'pg';
import { authenticate, requireHuman } from '../../auth/authorize.ts';
import { requireCsrf } from '../../auth/session.ts';
import { ApiFailure } from '../../errors.ts';
import { getDecisionStatus, reviewDecision } from './decision-review.service.ts';
import { findDecisions, proposeDecision } from './decision.service.ts';

export function createDecisionRoutes(pool: Pool, appOrigin: string) {
  const router = Router();
  router.get('/:projectId/decisions', async (request, response) => {
    const actor = await authenticate(pool, request);
    const id = projectIdSchema.safeParse(request.params.projectId);
    if (!id.success) throw new ApiFailure(400, 'INVALID_INPUT', 'Invalid project ID.');
    const query = decisionListQuerySchema.safeParse(request.query);
    if (!query.success) throw new ApiFailure(400, 'INVALID_INPUT', 'Invalid decision query.');
    response.json(await findDecisions(pool, actor, id.data, query.data));
  });
  router.post('/:projectId/decisions', async (request, response) => {
    const actor = await authenticate(pool, request);
    if (actor.kind === 'human') requireCsrf(request, appOrigin);
    const project = projectIdSchema.safeParse(request.params.projectId);
    const input = createDecisionProposalInputSchema.safeParse(request.body);
    const key = idempotencyKeySchema.safeParse(request.get('Idempotency-Key'));
    if (!project.success || !input.success || !key.success) {
      throw new ApiFailure(400, 'INVALID_INPUT', 'Invalid proposal or Idempotency-Key.');
    }
    response
      .status(201)
      .json(await proposeDecision(pool, actor, project.data, input.data, key.data));
  });

  router.get('/:projectId/decisions/:decisionId/status', async (request, response) => {
    const actor = await authenticate(pool, request);
    const project = projectIdSchema.safeParse(request.params.projectId);
    const decision = decisionIdSchema.safeParse(request.params.decisionId);
    if (!project.success || !decision.success)
      throw new ApiFailure(400, 'INVALID_INPUT', 'Invalid project or decision ID.');
    response.json(await getDecisionStatus(pool, actor, project.data, decision.data));
  });

  router.post('/:projectId/decisions/:decisionId/review', async (request, response) => {
    const reviewer = requireHuman(await authenticate(pool, request));
    requireCsrf(request, appOrigin);
    const project = projectIdSchema.safeParse(request.params.projectId);
    const decision = decisionIdSchema.safeParse(request.params.decisionId);
    const input = decisionReviewInputSchema.safeParse(request.body);
    if (!project.success || !decision.success || !input.success)
      throw new ApiFailure(400, 'INVALID_INPUT', 'Invalid review input.');
    const requestId = response.get('X-Request-ID');
    if (!requestId) throw new Error('Missing request ID.');
    response.json(
      await reviewDecision(pool, reviewer, project.data, decision.data, input.data, requestId),
    );
  });
  return router;
}
