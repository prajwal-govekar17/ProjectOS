ALTER TABLE projectos.projects ADD COLUMN last_repository_verified_at timestamptz;

CREATE TABLE projectos.decisions (
  id uuid PRIMARY KEY,
  project_id uuid NOT NULL REFERENCES projectos.projects (id),
  decision_id text NOT NULL CHECK (decision_id ~ '^DEC-(00[1-9]|0[1-9][0-9]|[1-9][0-9]{2,})$'),
  version integer NOT NULL DEFAULT 1 CHECK (version > 0),
  title text NOT NULL,
  decision text NOT NULL,
  rationale text NOT NULL,
  status text NOT NULL CHECK (status IN ('pending', 'approved', 'rejected', 'superseded')),
  provenance text NOT NULL CHECK (provenance IN ('fixture', 'human', 'agent')),
  supersedes_id uuid CHECK (supersedes_id <> id),
  created_at timestamptz NOT NULL DEFAULT now(),
  updated_at timestamptz NOT NULL DEFAULT now(),
  UNIQUE (project_id, id),
  UNIQUE (project_id, decision_id),
  FOREIGN KEY (project_id, supersedes_id) REFERENCES projectos.decisions (project_id, id)
);

CREATE INDEX decisions_project_status_idx ON projectos.decisions (project_id, status, created_at DESC, decision_id);
CREATE INDEX decisions_project_order_idx ON projectos.decisions (project_id, created_at DESC, decision_id);

CREATE TABLE projectos.decision_paths (
  project_id uuid NOT NULL,
  decision_id uuid NOT NULL,
  path text NOT NULL CHECK (
    octet_length(path) BETWEEN 1 AND 1024
    AND path COLLATE "C" !~ '^[A-Za-z]:|^/|/$|//|(^|/)[.]{1,2}(/|$)|[[:cntrl:]]'
    AND position(chr(92) IN path) = 0
  ),
  PRIMARY KEY (project_id, decision_id, path),
  FOREIGN KEY (project_id, decision_id) REFERENCES projectos.decisions (project_id, id)
);

CREATE INDEX decision_paths_project_path_idx ON projectos.decision_paths (project_id, path, decision_id);

CREATE TABLE projectos.decision_links (
  project_id uuid NOT NULL,
  decision_id uuid NOT NULL,
  related_id uuid NOT NULL CHECK (related_id <> decision_id),
  PRIMARY KEY (project_id, decision_id, related_id),
  FOREIGN KEY (project_id, decision_id) REFERENCES projectos.decisions (project_id, id),
  FOREIGN KEY (project_id, related_id) REFERENCES projectos.decisions (project_id, id)
);

CREATE TABLE projectos.decision_history (
  id uuid PRIMARY KEY,
  project_id uuid NOT NULL,
  decision_id uuid NOT NULL,
  version integer NOT NULL CHECK (version > 0),
  status text NOT NULL CHECK (status IN ('pending', 'approved', 'rejected', 'superseded')),
  occurred_at timestamptz NOT NULL DEFAULT now(),
  reviewer_id uuid REFERENCES projectos.users (user_id),
  feedback text,
  provenance text NOT NULL CHECK (provenance IN ('fixture', 'human', 'agent')),
  FOREIGN KEY (project_id, decision_id) REFERENCES projectos.decisions (project_id, id)
);

CREATE INDEX decision_history_project_order_idx ON projectos.decision_history (project_id, decision_id, occurred_at DESC, id DESC);

REVOKE ALL ON projectos.decisions, projectos.decision_paths, projectos.decision_links, projectos.decision_history FROM PUBLIC;
