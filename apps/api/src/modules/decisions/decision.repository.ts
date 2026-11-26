import type { Decision, DecisionHistoryEntry, DecisionListQuery } from '@projectos/contracts';
import type { Pool } from 'pg';

export const DECISION_HISTORY_LIMIT = 20;

interface DecisionRecord
  extends Omit<Decision, 'created_at' | 'updated_at' | 'history' | 'history_truncated'> {
  created_at: Date;
  updated_at: Date;
  history: DecisionHistoryEntry[] | null;
}

export async function findDecisionRows(db: Pool, projectId: string, query: DecisionListQuery) {
  const status = query.status ?? (query.decision_id ? null : 'approved');
  const { rows } = await db.query<DecisionRecord>(
    `
    WITH matching AS (
      SELECT d.*
      FROM projectos.decisions AS d JOIN projectos.projects AS p ON p.id = d.project_id
      WHERE p.project_id = $1
        AND ($2::text IS NULL OR d.decision_id = $2)
        AND ($3::text IS NULL OR d.status = $3)
        AND ($4::text[] IS NULL OR EXISTS (
          SELECT 1 FROM unnest($4::text[]) AS keyword
          WHERE strpos(lower(d.title), lower(keyword)) > 0
             OR strpos(lower(d.decision), lower(keyword)) > 0
             OR strpos(lower(d.rationale), lower(keyword)) > 0
        ))
        AND ($5::text[] IS NULL OR EXISTS (
          SELECT 1 FROM projectos.decision_paths AS path
          WHERE path.project_id = d.project_id AND path.decision_id = d.id AND path.path = ANY($5)
        ))
      ORDER BY d.created_at DESC, d.decision_id ASC LIMIT $6
    )
    SELECT d.decision_id, d.version, d.title, d.decision, d.rationale, d.status, d.provenance,
      d.created_at, d.updated_at, predecessor.decision_id AS supersedes_decision_id,
      ARRAY(SELECT path.path FROM projectos.decision_paths AS path
        WHERE path.project_id = d.project_id AND path.decision_id = d.id ORDER BY path.path) AS related_paths,
      ARRAY(SELECT related.decision_id FROM projectos.decision_links AS link
        JOIN projectos.decisions AS related ON related.project_id = link.project_id AND related.id = link.related_id
        WHERE link.project_id = d.project_id AND link.decision_id = d.id ORDER BY related.decision_id) AS related_decision_ids,
      CASE WHEN $7::boolean THEN (
        SELECT COALESCE(jsonb_agg(jsonb_build_object(
          'version', event.version, 'status', event.status, 'occurred_at', event.occurred_at,
          'reviewer_id', event.reviewer_id, 'feedback', event.feedback, 'provenance', event.provenance
        ) ORDER BY event.occurred_at DESC, event.id DESC), '[]'::jsonb)
        FROM (SELECT h.* FROM projectos.decision_history AS h
          WHERE h.project_id = d.project_id AND h.decision_id = d.id
          ORDER BY h.occurred_at DESC, h.id DESC LIMIT $8) AS event
      ) END AS history
    FROM matching AS d
    LEFT JOIN projectos.decisions AS predecessor ON predecessor.project_id = d.project_id AND predecessor.id = d.supersedes_id
    ORDER BY d.created_at DESC, d.decision_id ASC`,
    [
      projectId,
      query.decision_id ?? null,
      status,
      query.query?.split(/\s+/u) ?? null,
      query.related_files ?? null,
      query.limit + 1,
      query.include_history,
      DECISION_HISTORY_LIMIT + 1,
    ],
  );
  return rows;
}

export async function hasDecision(db: Pool, projectId: string, decisionId: string) {
  const { rowCount } = await db.query(
    `
    SELECT 1 FROM projectos.decisions AS d JOIN projectos.projects AS p ON p.id = d.project_id
    WHERE p.project_id = $1 AND d.decision_id = $2`,
    [projectId, decisionId],
  );
  return rowCount === 1;
}
