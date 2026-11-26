CREATE TABLE projectos.users (
  user_id uuid PRIMARY KEY,
  email text NOT NULL UNIQUE CHECK (email = lower(email)),
  password_hash text NOT NULL,
  created_at timestamptz NOT NULL DEFAULT now()
);

CREATE TABLE projectos.projects (
  id uuid PRIMARY KEY,
  project_id text NOT NULL UNIQUE,
  name text NOT NULL,
  repository_identity text NOT NULL,
  created_at timestamptz NOT NULL DEFAULT now(),
  updated_at timestamptz NOT NULL DEFAULT now()
);

CREATE TABLE projectos.project_memberships (
  project_id uuid NOT NULL REFERENCES projectos.projects (id),
  user_id uuid NOT NULL REFERENCES projectos.users (user_id),
  role text NOT NULL CHECK (role IN ('owner', 'member')),
  PRIMARY KEY (project_id, user_id)
);

CREATE INDEX project_memberships_user_idx ON projectos.project_memberships (user_id, project_id);

CREATE TABLE projectos.sessions (
  sid text PRIMARY KEY,
  sess json NOT NULL,
  expire timestamptz NOT NULL
);

CREATE INDEX sessions_expire_idx ON projectos.sessions (expire);

CREATE TABLE projectos.agent_credentials (
  credential_id uuid PRIMARY KEY,
  project_id uuid NOT NULL REFERENCES projectos.projects (id),
  token_digest bytea NOT NULL UNIQUE,
  capabilities text[] NOT NULL,
  expires_at timestamptz NOT NULL,
  revoked_at timestamptz,
  created_at timestamptz NOT NULL DEFAULT now()
);

REVOKE ALL ON ALL TABLES IN SCHEMA projectos FROM PUBLIC;
