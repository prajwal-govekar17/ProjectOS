import { createHash } from 'node:crypto';
import type {
  CreateDecisionProposalInput,
  DecisionCreation,
  DecisionListQuery,
  DecisionListResponse,
} from '@projectos/contracts';
import type { Pool } from 'pg';
import { requireAgentCapability } from '../../auth/authorize.ts';
import type { Actor } from '../../auth/authorize.ts';
import { findRequest, saveRequest } from '../../db/request-identity.repository.ts';
import { withTransaction } from '../../db/with-transaction.ts';
import { ApiFailure } from '../../errors.ts';
import { requireProjectAccess } from '../projects/project.service.ts';
import { DECISION_HISTORY_LIMIT, findDecisionRows, hasDecision } from './decision.repository.ts';
import {
  findDecisionTarget,
  findRelatedDecisionIds,
  insertProposal,
  lockDecision,
  lockProposalProject,
} from './decision-write.repository.ts';

export function decisionReviewUrl(projectId: string, decisionId: string) {
  return `/projects/${projectId}/decisions/${decisionId}/review`;
}

export async function proposeDecision(
  pool: Pool,
  actor: Actor,
  projectId: string,
  input: CreateDecisionProposalInput,
  requestKey: string,
): Promise<DecisionCreation> {
  if (actor.kind === 'agent') requireAgentCapability(actor, projectId, 'decision:propose');
  const digest = createHash('sha256').update(JSON.stringify(input)).digest('hex');
  return withTransaction(pool, async (client) => {
    const internalId = await lockProposalProject(
      client,
      projectId,
      actor.kind === 'human' ? actor.userId : undefined,
    );
    if (!internalId) throw new ApiFailure(404, 'NOT_FOUND', 'Project not found.');
    const identity = {
      projectId: internalId,
      principalKind: actor.kind,
      principalId: actor.kind === 'human' ? actor.userId : actor.credentialId,
      operation: 'decision:propose',
      requestKey,
    };
    const replay = await findRequest<DecisionCreation>(client, identity);
    if (replay) {
      if (replay.payload_digest !== digest)
        throw new ApiFailure(409, 'CONFLICT', 'Request key already used for different input.');
      return replay.response;
    }

    let predecessorId: string | null = null;
    if (input.supersedes_decision_id) {
      const predecessor = await findDecisionTarget(
        client,
        internalId,
        input.supersedes_decision_id,
      );
      if (!predecessor) throw new ApiFailure(404, 'NOT_FOUND', 'Decision not found.');
      const locked = await lockDecision(client, internalId, predecessor.id);
      if (locked?.status !== 'approved')
        throw new ApiFailure(409, 'CONFLICT', 'The predecessor must be active and approved.');
      predecessorId = locked.id;
    }
    const relatedIds = await findRelatedDecisionIds(client, internalId, input.related_decision_ids);
    if (relatedIds.length !== input.related_decision_ids.length) {
      throw new ApiFailure(404, 'NOT_FOUND', 'Related decision not found.');
    }

    const decisionId = await insertProposal(
      client,
      internalId,
      input,
      relatedIds,
      predecessorId,
      actor.kind,
    );
    const response: DecisionCreation = {
      decision_id: decisionId,
      version: 1,
      status: 'pending',
      review_url: decisionReviewUrl(projectId, decisionId),
    };
    await saveRequest(client, identity, digest, response);
    return response;
  });
}

export async function findDecisions(
  pool: Pool,
  actor: Actor,
  projectId: string,
  query: DecisionListQuery,
): Promise<DecisionListResponse> {
  await requireProjectAccess(pool, actor, projectId, 'decision:read');
  const rows = await findDecisionRows(pool, projectId, query);
  if (
    query.decision_id &&
    rows.length === 0 &&
    !(await hasDecision(pool, projectId, query.decision_id))
  ) {
    throw new ApiFailure(404, 'NOT_FOUND', 'Decision not found.');
  }

  return {
    decisions: rows.slice(0, query.limit).map(({ history, created_at, updated_at, ...record }) => ({
      ...record,
      created_at: created_at.toISOString(),
      updated_at: updated_at.toISOString(),
      ...(history && {
        history: history.slice(0, DECISION_HISTORY_LIMIT).map((entry) => ({
          ...entry,
          occurred_at: new Date(entry.occurred_at).toISOString(),
        })),
        history_truncated: history.length > DECISION_HISTORY_LIMIT,
      }),
    })),
    truncated: rows.length > query.limit,
  };
}
