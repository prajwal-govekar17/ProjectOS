# ProjectOS development context

Use this file for current backend setup, contracts, and implementation notes. The backend uses PostgreSQL for application state and sessions.

### Current Repository Status

The npm workspace contains the Express API and `@projectos/contracts`. The API supports PostgreSQL readiness, browser sessions, project access, repository verification reports, and Project Brain retrieval, proposals, and dashboard review.

### Run the backend locally

Use Node.js 24.12.0 and npm 11.6.2 from the repository root.

```sh
npm ci
npm start
```

In a second terminal, run `curl -fsS http://127.0.0.1:3000/healthz` to get `{"status":"ok"}`. The server binds to loopback. Set `DATABASE_URL` and `SESSION_SECRET` together in `.env` to enable the database-backed API. Set `APP_ORIGIN` to the dashboard origin and generate the session secret with `openssl rand -hex 32`. `GET /readyz` returns `200` after the database is reachable and the required migration checksums match. Until then it returns `503`.

Run `npm run check` for lint, formatting, types, tests, and builds. HTTP tests bind a temporary loopback port. `npm run format` applies the workspace formatter.

### PostgreSQL setup and access

Use the designated Supabase database and create separate PostgreSQL login roles for the migration operator and API runtime. Have a database administrator create the private `projectos` schema owned by the migration role and grant both roles database `CONNECT`. Use dedicated roles without memberships, superuser, database creation, role creation, replication, or row-level security bypass privileges. Keep the runtime role separate from the schema owner.

Set the runtime variables in `.env` and the migration variables in `.env.migration.development` using `.env.example` as a reference. Use a direct connection or the Supabase session pooler. Supply the Supabase root certificate with `DATABASE_CA_FILE` when required. The driver verifies the server certificate for remote connections. Use a PostgreSQL URL with credentials and the database name, without query parameters. [Supabase connection guide](https://supabase.com/docs/guides/database/connecting-to-postgres)

Hosted database connections have a 10-second connection timeout. The initial TLS connection to the Supabase development session pooler took about 2.9 seconds during setup.

```sh
npm run -w @projectos/api db:migrate:development
npm run -w @projectos/api db:verify-data-api:development
```

On the designated Supabase project, confirm that **Enable Data API** is off in the Data API integration and keep `projectos` out of exposed schemas. The grant check looks for direct privileges and readable dependent views for the standard API roles. Disabled Data API endpoints also prevent exposed RPC access. [Supabase Data API security](https://supabase.com/docs/guides/api/securing-your-api#disable-the-data-api)

After migration, grant these permissions as the schema owner, using the actual runtime role name.

```sql
GRANT USAGE ON SCHEMA projectos TO projectos_runtime;
GRANT SELECT ON projectos.schema_migrations, projectos.users, projectos.agent_credentials TO projectos_runtime;
GRANT SELECT, INSERT ON projectos.projects, projectos.project_memberships TO projectos_runtime;
GRANT SELECT, INSERT, UPDATE, DELETE ON projectos.sessions TO projectos_runtime;
GRANT SELECT, INSERT ON projectos.decisions, projectos.decision_paths, projectos.decision_links, projectos.decision_history, projectos.request_identities TO projectos_runtime;
GRANT UPDATE (status, updated_at) ON projectos.decisions TO projectos_runtime;
GRANT UPDATE (last_repository_verified_at) ON projectos.projects TO projectos_runtime;
```

Use `db:migrate:production` and `db:verify-data-api:production` with separate credentials in `.env.migration.production`. The migration command checks the configured database and role against the connected identity. It serializes migrations, records checksums, and rolls back a failed batch. Apply corrections as new migrations.

### Provision a development user and agent credential

Build the shared contracts, then use the development operator credentials. The password is read from stdin and stored as a salted hash. Provisioning the same email a second time leaves the existing account intact.

```sh
npm run build
read -rs projectos_password
printf '%s' "$projectos_password" | npm run -s -w @projectos/api auth:provision:development -- reviewer@example.test
unset projectos_password
```

Create a project with the human session, then issue an agent credential for that project. It grants `project:read`, `decision:read`, `repository:verify`, and `decision:propose`. The last argument is its lifetime in hours. Save the returned token when issued and give MCP only that project-scoped credential. Revocation uses the returned `credential_id`. Reissue older credentials when a caller needs a newly added capability.

```sh
npm run -s -w @projectos/api auth:agent:development -- issue "$projectos_project_id" 24
npm run -s -w @projectos/api auth:agent:development -- revoke "$projectos_credential_id"
```

Use `auth:agent:production` with the production operator credentials for a production project.

### Run the PostgreSQL integration test

Use a disposable database and two restricted login roles with names starting with `projectos_test`. Grant the roles `CONNECT` to that database only, give the test owner an empty `projectos` schema, and keep the runtime test role outside schema ownership. Set the test variables from `.env.example` in `.env.test` or export them in the test shell. Set `TEST_DATABASE_CA_FILE` for a custom certificate authority. The runner verifies the connected database, both roles, and the schema before writes. It creates and removes its own tables in that schema and skips when the test configuration is absent.

```sh
npm run build
node --env-file=.env.test --test tests/integration/projects-and-auth.test.ts
node --env-file=.env.test --test tests/integration/decision-retrieval.test.ts
node --env-file=.env.test --test tests/integration/decision-review.test.ts
```

### Dashboard and MCP contracts

Import runtime schemas and DTO types from the public `@projectos/contracts` entry point. See [bootstrap fixtures](tests/fixtures/contracts/bootstrap.json) for sample values. The project and auth payloads are proposed for caller review.

| Interface | Shared schema |
| --- | --- |
| JSON errors with `code`, `message`, and `request_id` under `error` | `apiErrorSchema`, `apiErrorCodeSchema` |
| Lowercase kebab-case project IDs and project-local `DEC-001` and `IMP-001` IDs | `projectIdSchema`, `decisionIdSchema`, `reportIdSchema` |
| `GET /api/auth/csrf`, `POST /api/auth/login`, `GET /api/auth/session` | `csrfResponseSchema`, `loginInputSchema`, `sessionResponseSchema` |
| `POST /api/projects`, `GET /api/projects`, `GET /api/projects/:projectId` | `createProjectInputSchema`, `projectListQuerySchema`, `projectListResponseSchema`, `projectSchema` |
| `POST /api/projects/:projectId/repository-verifications` | `repositoryVerificationInputSchema`, `repositoryVerificationResponseSchema` |
| `GET /api/projects/:projectId/decisions` | `decisionListQuerySchema`, `decisionListResponseSchema`, `decisionSchema` |
| `POST /api/projects/:projectId/decisions` | `createDecisionProposalInputSchema`, `idempotencyKeySchema`, `decisionCreationSchema` |
| `GET /api/projects/:projectId/decisions/:decisionId/status` | `decisionStatusResponseSchema` |
| `POST /api/projects/:projectId/decisions/:decisionId/review` | `decisionReviewInputSchema`, `decisionStatusResponseSchema` |

Application routes use `/api`, snake_case JSON fields, and a 2 MiB decoded JSON limit. The API generates `X-Request-ID` and repeats that ID in error responses. Errors use `400` for invalid input, `401` for missing or invalid credentials, `403` for denied actions on visible projects, `404` for missing or inaccessible records, `409` for conflicts, `413` for oversized bodies, and `503` for temporary dependency failures.

The dashboard uses a same-origin, HttpOnly, SameSite=Lax cookie with an eight-hour lifetime. Use a development proxy for `/api` to `http://127.0.0.1:3000`. Set an HTTPS `APP_ORIGIN` behind a loopback reverse proxy that sets `X-Forwarded-Proto` to enable Secure cookies. On mutations, the browser sends `Origin` and `X-CSRF-Token`, including for login and logout. Login returns the session and a rotated token. Logout returns `204`.

Project listing uses `limit` from 1 to 50 with a default of 20. Send the response's `next_cursor` as `cursor` to continue. MCP keeps the repository root in its local configuration and uses a project-scoped bearer credential to retrieve a project. A repository identity is a remote host and path such as `git.example.test/organization/repository`.

### Project Brain retrieval

Use `GET /api/projects/:projectId/decisions` with a dashboard session or an agent credential that has `decision:read`. Results contain `{ decisions, truncated }`. Records contain related decision IDs and a separate `supersedes_decision_id`. The API sorts by newest creation time and breaks ties by decision ID.

| Request | Result |
| --- | --- |
| No `decision_id` or `status` | Active approved decisions |
| `status` | Records with that explicit status |
| `decision_id` | The accessible record in any status, subject to explicit filters |
| Accessible exact ID fails an explicit filter | `200` with an empty list |
| Missing exact ID or inaccessible project | `404` |

Filters combine with AND. Whitespace-separated keywords match case-insensitive substrings in the title, decision, or rationale. Keywords within `query` combine with OR. Pass up to 50 repeated `related_files` keys for exact repository-relative path matches. Each path can use up to 1,024 UTF-8 bytes. Paths within `related_files` combine with OR. The default `limit` is `10` and the maximum is `50`. `include_history` accepts `true` or `false` and defaults to `false`. When requested, each decision includes up to 20 newest history entries and `history_truncated`. [Decision contract fixture](tests/fixtures/contracts/decision-retrieval.json)

After MCP checks its local repository root and confirms its identity, it can report the identity to `POST /api/projects/:projectId/repository-verifications` with `repository:verify`. Project metadata exposes `last_repository_verified_at`. This timestamp records a past check reported by MCP.

### Propose and review decisions

Submit a proposal with a dashboard session and CSRF token, or a project-scoped agent credential with `decision:propose`. Include `Idempotency-Key` on creation. The key accepts letters, digits, `.`, `_`, `:`, and `-`, with a maximum of 128 characters. Send `title`, `decision`, `rationale`, and `related_paths`. Optional `related_decision_ids` may refer to visible historical decisions. Use `supersedes_decision_id` for a replacement. A new replacement must target an active approved decision. The title limit is 160 characters. Decision text and rationale allow up to 10,000 characters each. Path and related-decision lists allow up to 50 entries each. Send an empty `related_paths` array when paths are unknown.

Creation returns HTTP `201` with `decision_id`, `version`, `status: pending`, and a relative `review_url`. The same principal can replay the same key and canonical input after an API restart or a decision status change. The response remains the original `201` creation result. Changes to content under that key return `409`. Use a fresh key for every new proposal. The backend retains the saved response with the original transaction. MCP key recovery across client reconnections still needs agreement and verification with the client owner. If the client loses operation correlation, recover the existing proposal by a known ID or scoped search.

Use the status endpoint for current state. It returns `decision_id`, `version`, and `status` with `reviewed_at`, `reviewer.user_id`, and `feedback` when available. Pending responses include `review_url`. Fetch the exact decision through Project Brain to display its statement, rationale, and predecessor.

Review requires a project owner’s dashboard session and CSRF token. Submit `version`, `outcome` (`approve` or `reject`), and optional `feedback` up to 2,000 characters. A review of an already resolved or stale version returns `409`. Agent credentials cannot review. Approval of a replacement supersedes its active predecessor in the same transaction. Rejection leaves the predecessor active. Review events record the authenticated reviewer, dashboard channel, and server-generated request ID.

### Seed a selected repository

Choose a supported JavaScript or TypeScript Git repository and register it under your own project ID. Run the migrations and build the contracts. Create a JSON file with a decision for that repository, then pass the registered project ID and JSON path to the seed command.

```sh
npm run build
npm run seed:demo -- development "$projectos_project_id" "$projectos_fixture_path"
```

Each file contains one decision. Replace the sample values with your own. Use your project's registered `repository_identity` and supply any related paths relative to the repository root. An empty `related_paths` array is valid.

```json
{
  "repository_identity": "git.example.test/organization/repository",
  "decision_id": "DEC-042",
  "title": "Decision title",
  "decision": "Record the architectural choice.",
  "rationale": "Explain the reason for the choice.",
  "status": "approved",
  "related_paths": []
}
```

The seed records fixture provenance and checks the repository identity before writing. Reruns preserve an existing matching record and refuse conflicting decision content. Use `test` with the isolated test credentials to seed test data. Pass `-` as the source to read JSON from stdin. Ordinary projects start with an empty Project Brain.

### Prioritized Delivery Roadmap (`P0` → `P2`)

| Priority | Milestone | Deliverable & Verification Target |
| :--- | :--- | :--- |
| **`P0`** | **Basic Prototype Checkpoint** | Bootstrap npm workspaces monorepo (`E01`), persist an approved decision in PostgreSQL (`E02`), demonstrate one live Codex-to-ProjectOS MCP retrieval (`E03`), and render a minimal functional UI. |
| **`P0`** | **Integrated Local Hackathon MVP** | All three core features with the 7-tool MCP contract, two-hop `ts-morph` dependency evidence (`E05`–`E06`), authenticated dashboard approval and manual resumption (`E04`), explicit `Git CLI` commit linking (`E07`), React views with React Flow (`E08`), persistence across restarts, and full verification on the team's chosen repository (`E09` / acceptance tests `T01`–`T13`). |
| **`P1`** | **Trusted MCP Elicitation** *(After Local Gate)* | Extend `propose_decision` with interactive in-client human review (`elicitation/create`) backed by the same Express review service and reviewer-bound verification, while preserving fail-closed dashboard fallback (`E10` / `T04`). |
| **`P1`** | **AWS Cloud Deployment** *(After Local Gate)* | Host the verified Express 5 API and React build on **AWS EC2** over HTTPS with shared data and sessions persisted in Supabase PostgreSQL (`E11` / `T14`). Local MCP server, `ts-morph`, `Git CLI`, and the repository remain local. |
| **`P2`** | **Scoped Enhancements** | Richer dashboard filters, graph navigation polish, optional file-level commit associations, and broader JS/TS syntax support where time permits. |

## Architecture and workflow wording

These passages capture the remaining architecture and walkthrough updates moved from the README.

```markdown
  <a href="#end-to-end-example-the-teamflow-scenario">Optional Walkthrough</a> ·
```

```markdown
ProjectOS does **not** replace the developer's coding agent, host a separate LLM, or wrap Git in automatic commits. Instead, it runs a local **Model Context Protocol (MCP)** server next to the developer's repository and pairs it with a shared **Express.js 5 + PostgreSQL** backend and a **React** governance dashboard:
```

```markdown
ProjectOS is built around three capabilities—**Project Brain**, **Change Impact Intelligence**, and **AI Git**—that read and write to **one authoritative decision record** in PostgreSQL.
```

```markdown
| *"What have we already decided on this topic or file, and why?"* | **Before Coding** | **Project Brain** | Parameterized PostgreSQL lookup over decision titles, statements, rationale, and normalized repository-relative file bindings (`get_decisions`). |
```

```markdown
   * The MCP server never opens the PostgreSQL database directly; it exchanges structured JSON records and bounded evidence snippets with the Express backend over REST.
3. **Layer 03 — Express.js 5 Backend & PostgreSQL Database:**
   * **Express.js 5** (`Node.js`, `TypeScript`) is the single authoritative service (`WS-04`) for project scoping, **Zod** runtime schema validation, decision lifecycle rules, and durable writes to **PostgreSQL**.
```

```markdown
| **`P0` — Local Hackathon MVP** *(Current Priority)* | Developer IDE/CLI, Codex agent, Local ProjectOS MCP server, `ts-morph`, `Git CLI`, and the Local Git Repository — plus the local Express 5 API and React dashboard over loopback HTTP. | Supabase hosts PostgreSQL for shared application state and sessions. |
| **`P1` — Planned Cloud Deployment** *(After Local Gate Passes)* | Developer IDE/CLI, Codex agent, Local ProjectOS MCP server, `ts-morph`, `Git CLI`, and the Local Git Repository **remain strictly local**. | Express 5 API and the built React frontend run on **AWS EC2** over HTTPS, with shared data and session state persisted in Supabase PostgreSQL. EC2 never mounts or reads the developer's raw local disk. |
```

```markdown
   * ProjectOS runs `ts-morph` locally to trace direct (1-hop) and indirect (2-hop) reverse dependencies, looks up active decisions linked to those paths in Project Brain, and saves an impact report in PostgreSQL.
```

```markdown
   * The agent (or developer) calls `link_commit_to_decision`. Local `Git CLI` verifies the full commit hash and changed file paths, storing the association in PostgreSQL.
```

```markdown
* **Bounded, Deterministic Retrieval (`PB-02`):** `get_decisions` uses parameterized PostgreSQL keyword matching over title, statement, and rationale plus exact file-path joins (default limit `10`, hard cap `50` with truncation indicators). It does not rely on an external embedding service or claim fuzzy semantic omniscience. Discovery defaults to active approved records. Use an explicit status or exact ID to retrieve pending, rejected, or superseded records. Set `include_history: true` to include review history for matching records.
```

```markdown
  3. **AI Predictions (`predictions`):** Saved via `record_impact_assessment` with agent attribution, rationale, and optional references to `evidence_ids` or `decision_ids`. Stored in a separate PostgreSQL table so predictions can never overwrite verified edges.
```

```markdown
| **How review is triggered** | `propose_decision` saves the proposal as `pending` in PostgreSQL and immediately returns `decision_id`, `version`, `status: "pending"`, and the dashboard review location. | `propose_decision` saves the proposal as `pending` first, negotiates client support, and issues a server-initiated protocol request (`elicitation/create` or input-required retry). |
```

```markdown
| **1** | **`get_decisions`** | Project Brain *(Read-only)* | `project_id` | `query`, `decision_id`, `related_files`, `status`, `include_history`, `limit` | Queries PostgreSQL via Express for matching decisions, statements, rationale, status, file bindings, and opt-in history. Defaults to active `approved` decisions. |
```

```markdown
| **3** | **`record_impact_assessment`** | Change Impact *(Write Predictions)* | `project_id`, `report_id`, `predictions` | Per prediction: `evidence_ids`, `decision_ids` | Validates referenced IDs and saves the coding agent's semantic predictions and conflict warnings in PostgreSQL separately from verified AST edges. |
```

```markdown
This optional walkthrough uses **TeamFlow**, a TypeScript project-management application built by **Rahul** using Codex and later continued by his teammate **Ananya**. Its project ID, decisions, filenames, and business logic are illustrative. Teams select their own JavaScript or TypeScript repository for the demonstration.
```

```markdown
8. **Normal Git commit & AI Git link (Steps 15–17):** Rahul reviews and tests the code, then creates a normal Git commit (`feat: add manager-approved task reassignment`, short display hash `a7c92f1`). Codex calls `link_commit_to_decision` with the full commit SHA and `DEC-004`. Local `Git CLI` verifies the commit and changed paths, persisting the link in PostgreSQL.
```

```markdown
| **Database** | **Supabase PostgreSQL** | Relational persistence for projects, decisions, review events, impact reports, dependency edges, AI predictions, and Git commit associations |
```

```markdown
| **Planned Cloud** | **AWS EC2**, **Amazon EBS** *(P1 after local release gate)* | Hosts the shared Express API and built React frontend on EC2 with EBS for instance storage and Supabase PostgreSQL for shared data |
```

```markdown
│   ├── api/                           # Express.js 5 + TypeScript + PostgreSQL authoritative backend
```

```markdown
│   │   │   ├── db/                    # PostgreSQL connection & migration runner
```
