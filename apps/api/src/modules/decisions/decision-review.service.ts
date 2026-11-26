import type { DecisionReviewInput, DecisionStatusResponse } from '@projectos/contracts';
import type { Pool } from 'pg';
import type { Actor, HumanActor } from '../../auth/authorize.ts';
import { withTransaction } from '../../db/with-transaction.ts';
import { ApiFailure } from '../../errors.ts';
import { requireProjectAccess } from '../projects/project.service.ts';
import {
  applyDecisionReview,
  findDecisionStatus,
  findDecisionTarget,
  findReviewProject,
  lockDecision,
} from './decision-write.repository.ts';
import { decisionReviewUrl } from './decision.service.ts';

async function readStatus(
  db: Pick<Pool, 'query'>,
  projectId: string,
  decisionId: string,
): Promise<DecisionStatusResponse> {
  const decision = await findDecisionStatus(db, projectId, decisionId);
  if (!decision) throw new ApiFailure(404, 'NOT_FOUND', 'Decision not found.');
  return {
    decision_id: decision.decision_id,
    version: decision.version,
    status: decision.status,
    ...(decision.reviewed_at && { reviewed_at: decision.reviewed_at.toISOString() }),
    ...(decision.reviewer_id && { reviewer: { user_id: decision.reviewer_id } }),
    ...(decision.feedback !== null && { feedback: decision.feedback }),
    ...(decision.status === 'pending' && { review_url: decisionReviewUrl(projectId, decisionId) }),
  };
}

export async function getDecisionStatus(
  pool: Pool,
  actor: Actor,
  projectId: string,
  decisionId: string,
) {
  await requireProjectAccess(pool, actor, projectId, 'decision:read');
  return readStatus(pool, projectId, decisionId);
}

export async function reviewDecision(
  pool: Pool,
  reviewer: HumanActor,
  projectId: string,
  decisionId: string,
  input: DecisionReviewInput,
  requestId: string,
) {
  return withTransaction(pool, async (client) => {
    const project = await findReviewProject(client, projectId, reviewer.userId);
    if (!project) throw new ApiFailure(404, 'NOT_FOUND', 'Project not found.');
    if (project.role !== 'owner')
      throw new ApiFailure(403, 'FORBIDDEN', 'Project owner review is required.');

    const target = await findDecisionTarget(client, project.id, decisionId);
    if (!target) throw new ApiFailure(404, 'NOT_FOUND', 'Decision not found.');
    // Competing replacements acquire the same predecessor lock first.
    const predecessor = target.supersedes_id
      ? await lockDecision(client, project.id, target.supersedes_id)
      : undefined;
    const decision = await lockDecision(client, project.id, target.id);
    if (
      decision?.status !== 'pending' ||
      decision.version !== input.version ||
      decision.supersedes_id !== target.supersedes_id
    ) {
      throw new ApiFailure(
        409,
        'CONFLICT',
        'That exact decision version is no longer pending review.',
      );
    }

    const status = input.outcome === 'approve' ? 'approved' : 'rejected';
    if (status === 'approved' && decision.supersedes_id) {
      if (predecessor?.status !== 'approved')
        throw new ApiFailure(409, 'CONFLICT', 'The predecessor is no longer active.');
      await applyDecisionReview(
        client,
        project.id,
        predecessor,
        'superseded',
        reviewer.userId,
        requestId,
      );
    }
    await applyDecisionReview(
      client,
      project.id,
      decision,
      status,
      reviewer.userId,
      requestId,
      input.feedback,
    );
    return readStatus(client, projectId, decisionId);
  });
}
