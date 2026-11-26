import { randomUUID } from 'node:crypto';
import type { CreateDecisionProposalInput, DecisionStatusResponse } from '@projectos/contracts';
import type { Pool, PoolClient } from 'pg';

type Status = DecisionStatusResponse['status'];

interface DecisionTarget {
  id: string;
  version: number;
  status: Status;
  supersedes_id: string | null;
}

export async function lockProposalProject(client: PoolClient, projectId: string, userId?: string) {
  const {
    rows: [project],
  } = await client.query<{ id: string }>(
    `
    SELECT p.id FROM projectos.projects AS p
    WHERE p.project_id = $1 AND ($2::uuid IS NULL OR EXISTS (
      SELECT 1 FROM projectos.project_memberships AS m WHERE m.project_id = p.id AND m.user_id = $2
    )) FOR NO KEY UPDATE OF p`,
    [projectId, userId ?? null],
  );
  return project?.id;
}

export async function findDecisionTarget(
  client: PoolClient,
  projectId: string,
  decisionId: string,
) {
  const {
    rows: [decision],
  } = await client.query<DecisionTarget>(
    `
    SELECT id, version, status, supersedes_id FROM projectos.decisions
    WHERE project_id = $1 AND decision_id = $2`,
    [projectId, decisionId],
  );
  return decision;
}

export async function findRelatedDecisionIds(client: PoolClient, projectId: string, ids: string[]) {
  if (!ids.length) return [];
  const { rows } = await client.query<{ id: string }>(
    `
    SELECT id FROM projectos.decisions WHERE project_id = $1 AND decision_id = ANY($2::text[])`,
    [projectId, ids],
  );
  return rows.map(({ id }) => id);
}

export async function insertProposal(
  client: PoolClient,
  projectId: string,
  input: CreateDecisionProposalInput,
  relatedIds: string[],
  supersedesId: string | null,
  provenance: 'human' | 'agent',
) {
  const {
    rows: [sequence],
  } = await client.query<{ next_id: string }>(
    `
    SELECT (COALESCE(max(substring(decision_id, 5)::numeric), 0) + 1)::text AS next_id
    FROM projectos.decisions WHERE project_id = $1`,
    [projectId],
  );
  const decisionId = `DEC-${sequence.next_id.padStart(3, '0')}`;
  const id = randomUUID();
  await client.query(
    `
    INSERT INTO projectos.decisions (id, project_id, decision_id, title, decision, rationale, status, provenance, supersedes_id)
    VALUES ($1, $2, $3, $4, $5, $6, 'pending', $7, $8)`,
    [
      id,
      projectId,
      decisionId,
      input.title,
      input.decision,
      input.rationale,
      provenance,
      supersedesId,
    ],
  );
  await client.query(
    `INSERT INTO projectos.decision_paths (project_id, decision_id, path)
    SELECT $1, $2, path FROM unnest($3::text[]) AS path`,
    [projectId, id, input.related_paths],
  );
  await client.query(
    `INSERT INTO projectos.decision_links (project_id, decision_id, related_id)
    SELECT $1, $2, related_id FROM unnest($3::uuid[]) AS related_id`,
    [projectId, id, relatedIds],
  );
  await client.query(
    `INSERT INTO projectos.decision_history (id, project_id, decision_id, version, status, provenance)
    VALUES ($1, $2, $3, 1, 'pending', $4)`,
    [randomUUID(), projectId, id, provenance],
  );
  return decisionId;
}

export async function findReviewProject(client: PoolClient, projectId: string, userId: string) {
  const {
    rows: [project],
  } = await client.query<{ id: string; role: string }>(
    `
    SELECT p.id, m.role FROM projectos.projects AS p
    JOIN projectos.project_memberships AS m ON m.project_id = p.id
    WHERE p.project_id = $1 AND m.user_id = $2`,
    [projectId, userId],
  );
  return project;
}

export async function lockDecision(client: PoolClient, projectId: string, id: string) {
  const {
    rows: [decision],
  } = await client.query<DecisionTarget>(
    `
    SELECT id, version, status, supersedes_id FROM projectos.decisions
    WHERE project_id = $1 AND id = $2 FOR NO KEY UPDATE`,
    [projectId, id],
  );
  return decision;
}

export async function applyDecisionReview(
  client: PoolClient,
  projectId: string,
  decision: DecisionTarget,
  status: 'approved' | 'rejected' | 'superseded',
  reviewerId: string,
  requestId: string,
  feedback?: string,
) {
  await client.query(
    `UPDATE projectos.decisions SET status = $3, updated_at = now()
    WHERE project_id = $1 AND id = $2`,
    [projectId, decision.id, status],
  );
  await client.query(
    `INSERT INTO projectos.decision_history
    (id, project_id, decision_id, version, status, reviewer_id, request_id, feedback, provenance, review_channel)
    VALUES ($1, $2, $3, $4, $5, $6, $7, $8, 'human', 'dashboard')`,
    [
      randomUUID(),
      projectId,
      decision.id,
      decision.version,
      status,
      reviewerId,
      requestId,
      feedback ?? null,
    ],
  );
}

export async function findDecisionStatus(
  db: Pick<Pool, 'query'>,
  projectId: string,
  decisionId: string,
) {
  const {
    rows: [decision],
  } = await db.query<{
    decision_id: string;
    version: number;
    status: Status;
    reviewed_at: Date | null;
    reviewer_id: string | null;
    feedback: string | null;
  }>(
    `
    SELECT d.decision_id, d.version, d.status, review.occurred_at AS reviewed_at, review.reviewer_id, review.feedback
    FROM projectos.decisions AS d JOIN projectos.projects AS p ON p.id = d.project_id
    LEFT JOIN LATERAL (
      SELECT h.occurred_at, h.reviewer_id, h.feedback FROM projectos.decision_history AS h
      WHERE h.project_id = d.project_id AND h.decision_id = d.id AND h.version = d.version
        AND h.reviewer_id IS NOT NULL AND h.status IN ('approved', 'rejected')
      ORDER BY h.occurred_at DESC, h.id DESC LIMIT 1
    ) AS review ON true
    WHERE p.project_id = $1 AND d.decision_id = $2`,
    [projectId, decisionId],
  );
  return decision;
}
