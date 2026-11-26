ALTER TABLE projectos.decision_history ADD COLUMN review_channel text CHECK (review_channel IN ('dashboard', 'mcp_elicitation'));
ALTER TABLE projectos.decision_history ADD COLUMN request_id uuid;

CREATE UNIQUE INDEX decisions_approved_replacement_idx
  ON projectos.decisions (project_id, supersedes_id)
  WHERE supersedes_id IS NOT NULL AND status = 'approved';

CREATE TABLE projectos.request_identities (
  project_id uuid NOT NULL REFERENCES projectos.projects (id),
  principal_kind text NOT NULL CHECK (principal_kind IN ('agent', 'human')),
  principal_id uuid NOT NULL,
  operation text NOT NULL,
  request_key text NOT NULL,
  payload_digest text NOT NULL,
  response jsonb NOT NULL,
  created_at timestamptz NOT NULL DEFAULT now(),
  PRIMARY KEY (project_id, principal_kind, principal_id, operation, request_key)
);

REVOKE ALL ON projectos.request_identities FROM PUBLIC;
