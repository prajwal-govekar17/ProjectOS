# ProjectOS — Product Requirements Document

## 1. Product definition and scope

ProjectOS is an MCP-centric developer tool that preserves approved architectural decisions, investigates proposed changes using real repository evidence, and records the relationship between approved decisions and actual Git commits. It works with existing AI coding agents rather than replacing them.

**Companion specification:** [ProjectOS Implementation Reference Detailed](./ProjectOS_Implementation_Reference_Detailed.md). Read both files before implementation. The companion defines the seven MCP tools, their inputs and outputs, the TeamFlow example, the technology stack, component responsibilities and the complete user flow. This PRD defines the requirements, quality gates and delivery plan that the implementation must satisfy.

- **Product requirements** describe required behavior, not completed work.
- **Recommended implementation** describes a practical engineering default that has not been independently approved by the team. Validate it against the actual repository before adopting it.
- **Open decisions** require resolution where indicated. Do not treat an unverified assumption as implemented functionality.

### Problem and target users

| User | Problem | Desired outcome |
|---|---|---|
| Developer using a coding agent | Important architectural reasoning is scattered across conversations and documentation. | Retrieve the team's approved decisions before changing code. |
| Developer planning a feature or refactor | Search results alone do not explain how related code may be affected. | Inspect actual dependency paths, relevant decisions and explicitly labelled AI predictions. |
| Project maintainer / reviewer | Reviewing an architectural change requires context; repeatedly switching applications adds friction. | Review meaningful proposals in the authenticated dashboard first; later reduce switching through trusted in-client elicitation. |
| Developer returning to an existing project | Git history may show what changed without preserving the reasoning behind the decision. | Retrieve the recorded decision and its association with real commits, even in a fresh agent session. |

The initial target is an individual developer using an interactive MCP-capable coding client with a local JavaScript/TypeScript repository. Codex is the first intended client. Shared project access from multiple machines is enabled later by the hosted backend; enterprise collaboration and universal language support are not MVP claims.

These user problems are product hypotheses based on the team's development experience and design discussions, not validated market research. Do not claim measured productivity improvements or uniqueness without evidence.

### Goals and measurable success

The following are proposed release targets for the hackathon, not measured results.

| Goal | Verification target |
|---|---|
| Preserve architectural knowledge | A fresh agent session retrieves the correct approved decision and rationale from persistent storage. |
| Produce useful code evidence | The prepared TeamFlow repository yields real direct relationships and at least one genuine two-edge dependency path; source locations are inspectable. |
| Keep human control | A proposal cannot be approved by an ordinary agent request. An authorized dashboard review succeeds; an abandoned review remains pending. |
| Preserve Git provenance | A real full commit hash, changed files and linked decision version can be retrieved in both directions. |
| Reduce review friction | Dashboard review resumes using one status check when the developer returns. Later, trusted elicitation can complete within the active agent interaction without switching applications. |
| Demonstrate persistence | Decisions, reports and commit associations survive a backend restart. |
| Demonstrate integration | Complete a single real TeamFlow change across all three features without hand-entering fake analysis outputs. |
| Control cost | ProjectOS itself makes no separately billed LLM calls. Confirm coding-agent allowance and AWS account costs before relying on them. |

No target implies perfect impact recall, automatic agent compliance, verified business ROI or production-grade scalability.

### Release priorities

| Priority | Deliverable |
|---|---|
| P0 — Basic checkpoint | Local runnable slice: project setup, persistent approved decision, one actual Codex-to-ProjectOS MCP retrieval. Simple functional UI. |
| P0 — Integrated hackathon MVP | All three core features with the seven-tool contract, dependency evidence, authenticated dashboard approval and manual resumption, explicit Git association, persistence, tests and a coherent demo. |
| P1 — MCP Elicitation (after local core gate) | Add trusted in-client review to the existing proposal workflow; retain dashboard fallback. Not a prerequisite for the P0 local MVP. |
| P1 — Deployment | AWS EC2 + EBS hosting of the verified local backend/dashboard. Local MCP, Git and analysis stay local. Aim to deliver after the local release gate passes. |
| P2 — Enhancements within scope | Richer filters, polished graph navigation, optional precise file associations and broader supported JS/TS syntax where time permits. |

The November 26–27 checkpoint is not the scope ceiling for the final product. Do not sacrifice the integrated local MVP to finish elicitation or AWS first. Both follow the verified local core; prioritize elicitation integration before AWS work where practical, without blocking the dashboard-based release if the trusted channel is unresolved.

### Non-goals and deferred capabilities

- No standalone coding agent, proprietary model, custom model training or dedicated paid inference API.
- No automatic committing, pushing, experimental branch creation or execution/comparison of experimental architectures.
- No guarantee of complete impact prediction, automatic architectural compliance enforcement, or interception of every agent code edit.
- No mandatory GitHub OAuth/API integration, universal dependency analyzer, distributed database, or production-grade multi-tenant organization administration.
- On hold: Proof Engine, Cross-Agent Conflict Detection, Decision Comparison, automated testing orchestration/CI as a product feature, automatic architectural-violation detection, universal model/token optimization, Intent Drift Detector (including post-edit scope auditing), Assumption Radar, MCP Tool Trust Sentinel, MCP RetryShield and MCP Value Meter. Additional IDE code-acceptance integration is also deferred.

Normal tests of ProjectOS, input validation and duplicate-safe writes are engineering requirements, not implementations of the deferred Proof Engine, RetryShield or automated testing products.

## 2. Functional requirements and acceptance criteria

Each requirement has a stable ID for implementation tasks and tests. The MCP behavior and detailed examples in the companion reference apply throughout. Unless identified as a later-phase requirement, these are integrated MVP requirements.

### Workspace and agent connectivity

| ID | Requirement | Acceptance criteria |
|---|---|---|
| WS-01 | Register a project with stable identity and associate a local Git repository. | Restart both processes; the same configured project resolves to the same backend records and local repository. Invalid roots are rejected. |
| WS-02 | Connect an existing interactive MCP client. | A real Codex session discovers the seven tools and invokes a retrieval tool successfully. MCP Inspector is a diagnostic fallback, not proof of an agent integration. |
| WS-03 | Scope project data and local operations. | A request naming a different project or an unauthorized path cannot access its data. Errors do not leak sensitive configuration. |
| WS-04 | Use a single authoritative backend for shared state. | A decision saved through an authorized UI operation is visible through MCP and vice versa for permitted proposal writes. No competing client-side decision store. |

### Project Brain

| ID | Requirement | Acceptance criteria |
|---|---|---|
| PB-01 | Maintain decision statements, rationale, status, reviewer information, related paths and history. | Human creates/approves a decision; a restart does not lose any required fields. An initially empty Brain does not fabricate architecture. |
| PB-02 | Retrieve relevant decisions without requiring their IDs. | Search by topic or path returns matching records; exact ID and history lookups work; non-approved records do not silently become active context. |
| PB-03 | Support new and replacement proposals. | A proposal remains pending until review; a proposed replacement does not remove the old active decision. Rejection does not modify the active rule. |
| PB-04 | Preserve history on approval of a replacement. | Approving the exact pending version activates the replacement and supersedes the predecessor atomically. Historical rationale and Git links remain readable. |
| PB-05 (P1) | After the core local workflow passes, request explicit in-client human approval through MCP Elicitation. | In a supporting, trusted interactive client, the exact proposal and rationale are shown; explicit approval is persisted before success is returned. Cancellation, automated denial or uncertain identity cannot approve it. |
| PB-06 (P0) | Provide authenticated dashboard review and manual resumption as the initial primary approval path. | Submit a proposal; receive pending status and review location; end the agent task; approve or reject it in the dashboard; a resumed agent reads the persisted status. Repeated automatic polling is unnecessary. |
| PB-07 | Restrict architectural approval to authorized human review. | Direct agent credential, forged tool arguments, unauthorized browser request, stale version and replayed review are rejected. |
| PB-08 | Avoid unnecessary approvals. | A routine implementation compatible with approved architecture can proceed without creating a new proposal. A significant new or replacement decision follows the review flow. |

### Change Impact Intelligence

| ID | Requirement | Acceptance criteria |
|---|---|---|
| CI-01 | Analyze real JS/TS source starting from agent-selected paths or resolvable symbols. | A valid input produces evidence from the registered repo; invalid or missing starting points produce clear errors. No invented source paths. |
| CI-02 | Discover direct and indirect code dependencies. | A prepared fixture containing a two-edge chain returns the correct path, even if the final file contains none of the original feature keywords. |
| CI-03 | Explain evidence and its limitations. | Each verified edge identifies source, target, relationship and source location; unresolved imports and excluded files are reported. A dependency is not labelled a guaranteed edit or breakage. |
| CI-04 | Retrieve related architectural decisions. | The report returns active decisions explicitly mapped to relevant files; the agent can also supply contextual reasoning about other decisions. |
| CI-05 | Persist and distinguish evidence, starting hypotheses and AI interpretations. | An assessment submitted after analysis appears in the dashboard as AI-generated; it cannot overwrite verified edges or alter approval state. |
| CI-06 | Make report freshness explicit. | After a relevant worktree or decision change, an earlier report is marked stale or shown as an earlier snapshot. A new analysis produces fresh evidence. |
| CI-07 | Visualize the saved graph and supporting evidence. | Select a node/edge to inspect its connection and actual source location. Predictions and decision associations are visually distinct from structural edges. |
| CI-08 | Bound work and communicate incomplete results. | A cyclic graph terminates; node/edge/depth or timeout limits return a labelled partial result. An unsupported language does not receive fabricated JS/TS analysis. |

### AI Git

| ID | Requirement | Acceptance criteria |
|---|---|---|
| GT-01 | Link an existing commit explicitly to an approved decision. | Actual Git CLI resolves the full hash and obtains changed paths; the backend stores the association to the correct project and decision version. No commit is created by ProjectOS. |
| GT-02 | Preserve association provenance. | The UI distinguishes agent-recorded, human-recorded and any human-confirmed association. A valid SHA alone is not shown as proof of intent. |
| GT-03 | Support bidirectional retrieval. | A decision lookup returns associated commits; a commit lookup returns the recorded decisions and rationale. A file lookup shows associated changes and distinguishes explicit file-level links from commit-level membership. |
| GT-04 | Handle multiple and missing associations. | Two decisions may link to one commit, one decision may link to multiple commits, and repeated identical links do not duplicate records. No applicable decision means unlinked, not inferred rationale. |
| GT-05 | Preserve historical evidence. | Superseding a decision does not rewrite the rationale recorded for its earlier commits. Missing local commit objects are labelled; available stored evidence remains retrievable. |

The required workflow uses deliberate association by the agent or developer. Automatically inferring links for arbitrary historical commits and requiring a separate confirmation for every link are not required. A human confirmation/correction control is recommended if time permits; do not label an agent association as human-confirmed without that action.

### Dashboard experience

The dashboard is the initial primary human review and inspection surface, not another chatbot. It remains the fallback after trusted elicitation is added. The developer should not have to open it for every routine action.

| View | Required experience |
|---|---|
| Project setup | Create/select a project; see connection/configuration guidance; show whether repository binding and agent setup have been verified. |
| Project Brain | Search/filter by status; show rationale, related code, decision history, and a dedicated review queue for pending proposals. Clearly show active versus historical decisions. |
| Decision review | Display exact proposal, predecessor where applicable, rationale and associated report. Explicit approve/reject; feedback when available; reject stale or resolved review requests. |
| Impact report | Show change description, repository snapshot, starting candidates, dependency graph, evidence details, related decisions and a separate predictions panel. Show freshness, partial/empty results and errors. |
| AI Git | Show full or shortened Git hash with access to full value, message, changed paths, linked decision versions, provenance and recorded rationale. Allow navigation from a decision to its linked commits. |

Include understandable loading, empty, unavailable and error states. Use keyboard-accessible buttons, visible focus and text labels rather than relying on color alone to differentiate decision states and evidence types. Desktop/laptop browsers are the initial target; detailed responsive/mobile design is not required.

## 3. Engineering specification — implementation defaults

The selected stack and component communication are defined in the companion. The following engineering specification turns that architecture into a practical implementation plan. The repository and coding standards are mandatory; other recommended defaults remain subject to team review. None is evidence that a repository, routes, schema or code already exist.

### Codebase organization and ownership

Required for a new repository: TypeScript monorepo with npm workspaces. If an existing repository provides equivalent separation, inspect it and obtain team approval before changing its structure; do not reorganize working code unnecessarily.

- Domain services in the API own decision rules, project authorization and durable writes. Route handlers validate and delegate rather than duplicating business rules.
- MCP handlers orchestrate local analysis and backend calls; no direct SQLite access. The React frontend uses REST, not direct filesystem or database access.
- Keep code-analysis and Git adapters independent. Shared contracts must not import application services. Avoid circular dependencies, oversized handlers and duplicated logic.
- Prefer small cohesive functions and typed boundaries. Do not create unnecessary files for trivial operations. Pin working dependency versions and commit the lockfile.
- Select the SQLite driver and migration tooling after checking the Node version and installation on the development machines. Use one API-owned database connection strategy, foreign keys and explicit transactions.

### Mandatory repository structure and coding conventions

The following rules are mandatory for both human developers and coding agents building ProjectOS. They are project-specific engineering conventions based on common TypeScript, React and Node.js practices; there is no single universal industry-mandated directory layout or filename casing. Existing working code must be inspected first; if its layout differs, agree on a migration rather than silently moving or rewriting it. These rules apply to ProjectOS, not to repositories that ProjectOS analyzes (including TeamFlow).

#### Repository layout (ORG-01)

Use the TypeScript monorepo with npm workspaces described above for a new repository. Keep one root lockfile and a private root package. Each application and shared package owns its `package.json`, TypeScript configuration and declared dependencies. Use the following target layout; create directories and files only when they have a real implementation responsibility. Example filenames illustrate conventions, not additional features or completed code.

```text
projectos/
├── apps/
│   ├── web/
│   │   ├── src/
│   │   │   ├── app/                  # App shell, routing, providers
│   │   │   ├── features/
│   │   │   │   ├── projects/
│   │   │   │   ├── project-brain/
│   │   │   │   │   ├── components/DecisionCard.tsx
│   │   │   │   │   ├── hooks/useDecisions.ts
│   │   │   │   │   ├── api/decisions.api.ts
│   │   │   │   │   └── pages/DecisionReviewPage.tsx
│   │   │   │   ├── impact-analysis/
│   │   │   │   └── ai-git/
│   │   │   ├── components/            # Reusable, feature-independent UI
│   │   │   ├── lib/                   # Shared browser API client and helpers
│   │   │   └── main.tsx
│   │   ├── public/
│   │   ├── index.html
│   │   ├── vite.config.ts
│   │   ├── tsconfig.json
│   │   └── package.json
│   ├── api/
│   │   ├── src/
│   │   │   ├── modules/
│   │   │   │   ├── projects/
│   │   │   │   ├── decisions/
│   │   │   │   │   ├── decision.routes.ts
│   │   │   │   │   ├── decision.controller.ts
│   │   │   │   │   ├── decision.service.ts
│   │   │   │   │   ├── decision.repository.ts
│   │   │   │   │   └── decision.service.test.ts
│   │   │   │   ├── impact-reports/
│   │   │   │   └── git-traceability/
│   │   │   ├── auth/                  # Session and authorization policies
│   │   │   ├── middleware/
│   │   │   ├── db/                    # SQLite connection and migration runner
│   │   │   ├── config/
│   │   │   ├── app.ts                 # Express composition; no listen()
│   │   │   └── server.ts              # Process entry point, startup/shutdown
│   │   ├── migrations/
│   │   │   └── 0001-initial-schema.sql
│   │   ├── tsconfig.json
│   │   └── package.json
│   └── mcp/
│       ├── src/
│       │   ├── tools/
│       │   │   ├── get-decisions.tool.ts
│       │   │   ├── analyze-change.tool.ts
│       │   │   ├── record-impact-assessment.tool.ts
│       │   │   ├── propose-decision.tool.ts
│       │   │   ├── get-decision-status.tool.ts
│       │   │   ├── link-commit-to-decision.tool.ts
│       │   │   └── get-git-traceability.tool.ts
│       │   ├── clients/               # Backend REST client
│       │   ├── repository/            # Local binding and path validation
│       │   ├── config/
│       │   ├── server.ts              # MCP server composition and registration
│       │   └── main.ts                # Transport startup
│       ├── tsconfig.json
│       └── package.json
├── packages/
│   ├── contracts/                     # Shared Zod schemas and DTOs
│   ├── repo-analysis/                 # Local ts-morph analysis
│   └── git-adapter/                   # Read-only local Git evidence
│       # Each package: src/, public src/index.ts, package.json, tsconfig.json
├── tests/
│   ├── integration/
│   ├── e2e/
│   └── fixtures/                      # Controlled real-source/Git test fixtures
├── scripts/
├── docs/
│   ├── ProjectOS_PRD.md
│   └── ProjectOS_Implementation_Reference_Detailed.md
├── .env.example                       # Placeholder configuration only
├── .gitignore
├── AGENTS.md
├── README.md
├── eslint.config.js
├── tsconfig.base.json
├── package.json
└── package-lock.json
```

The later elicitation integration belongs in a dedicated MCP review adapter (for example `apps/mcp/src/review/elicitation.adapter.ts`) and must reuse the API's existing human-approval domain service. Do not create placeholder elicitation code during P0 merely to complete the tree. The diagram shows a suggested config filename; use the extension consistent with the selected Node module mode.

#### Mandatory naming conventions (ORG-02)

| Item | Convention | Correct example |
|---|---|---|
| Directories and workspace names | Lowercase kebab-case; no spaces | `project-brain/`, `repo-analysis/`, `@projectos/contracts` |
| Non-component TypeScript files | Lowercase kebab-case, with role suffix when helpful | `decision.service.ts`, `git-client.ts` |
| React component and page files | PascalCase; filename matches primary component | `DecisionCard.tsx`, `ImpactReportPage.tsx` |
| React hook files and functions | camelCase, `use` prefix | `useDecisions.ts`, `useDecisions()` |
| Functions and local variables | camelCase, descriptive verbs for actions | `getApprovedDecisions()`, `projectId` |
| Types, interfaces, classes | PascalCase; no mandatory `I` prefix | `DecisionProposal`, `GitAdapter` |
| Module-level fixed constants | UPPER_SNAKE_CASE when genuinely constant | `MAX_TRAVERSAL_DEPTH` |
| Boolean variables/functions | Meaningful `is`, `has`, `can`, `should` prefixes | `isApproved`, `canReviewDecision()` |
| Zod schema symbols | camelCase with `Schema` suffix | `decisionProposalSchema` |
| Tests | Same stem as subject + `.test.ts` or `.test.tsx` | `decision.service.test.ts`, `DecisionCard.test.tsx` |
| SQL migrations | Ordered, immutable once applied, descriptive lowercase names | `0002-add-impact-reports.sql` |
| Environment variables | UPPER_SNAKE_CASE | `PROJECTOS_API_URL` |
| Database tables and columns | snake_case; consistent plural table names | `decision_revisions`, `project_id` |
| External MCP tool names and payload fields | Preserve documented snake_case contract | `get_decisions`, `decision_id` |

- Use `.ts` for non-JSX source and `.tsx` for JSX source. Standard tool-required filenames (`package.json`, `README.md`, `AGENTS.md`, `tsconfig.json`, `main.tsx`, `.gitignore`) and existing specification filenames are intentional exceptions.
- Retain the API/MCP field naming already defined in the specifications. Map wire and SQLite names to internal TypeScript names at the appropriate boundary; do not rename public contracts to satisfy an internal naming preference.
- Avoid vague filenames such as `helpers.ts`, `stuff.ts`, `new.ts`, `final2.ts`, and unbounded `utils/` dumping grounds. Name modules after their actual domain or operation. Avoid case-only duplicate files and ensure import casing matches disk casing.

#### Layering, module boundaries and code ownership (ORG-03)

| Layer | Must own | Must not own |
|---|---|---|
| React feature/page/component | Rendering, user input, client state and view composition | SQLite, Git/ts-morph, authoritative approval rules |
| React hooks / API client | REST calls, data fetching and UI state coordination | Server-side authorization decisions |
| Express route/controller | Routing, boundary validation, HTTP response/error mapping | Raw SQL or duplicated approval/business rules |
| API domain service | Authorization-aware use cases, decisions, invariants and transaction orchestration | HTTP rendering, MCP transport or local source scanning |
| API repository / db | SQL, persistence mapping, migration and transaction implementation | Business approval policy or UI decisions |
| MCP tool handler | Input validation, local adapter calls, backend requests, MCP result mapping | Direct database access or independent approval authority |
| Shared contracts package | Zod schemas, DTOs and transport-independent contract types | App services, database connections, Node-only code used by the browser |
| Repository analysis / Git packages | Safe local source analysis or Git evidence respectively | React, REST handlers, decision writes or LLM inference |

Dependency direction is mandatory: applications may import declared shared packages; shared packages never import application internals. API routes delegate to controllers/services, and services use repositories or explicit interfaces. Web and MCP communicate with the API over REST, never by importing `apps/api/src` or opening its database. The API does not invoke local repository scanners directly. Cross-workspace imports use declared package dependencies and explicit public exports, not `../../../../apps/...` or deep imports into another package's private `src/`. Keep dependency graphs acyclic. Use a small package-level `index.ts` only as an intentional public entry point, not a blanket barrel in every folder.

Each module/function must have a clear responsibility. Keep feature-specific code next to its feature; move code to shared modules only when it represents genuine reuse or a common contract. Do not introduce empty abstractions, one class per trivial operation, arbitrary line-count limits or speculative layers. Extract code when responsibilities become mixed or testing/review becomes difficult. Do not copy approval, validation or persistence rules into multiple clients.

#### Mandatory TypeScript, configuration and repository hygiene (ORG-04)

- Enable TypeScript `strict` and `forceConsistentCasingInFileNames`. Use a shared base config and target-specific browser/Node configs. No blanket `any`, `@ts-ignore`, unchecked casts or disabled rules to make builds pass; narrow `unknown` and validate external input with Zod. Any narrowly scoped exception requires a documented reason and review.
- Use one consistent module system per runtime package, with compatible TypeScript/Node settings. Prefer named exports for reusable logic; framework-required or clearly documented entry-point defaults are acceptable. Use `import type` for type-only imports. Keep import grouping consistent through linting/formatting.
- Centralize runtime config in typed config modules; validate required environment values at startup. Never hardcode credentials, database locations, deployment endpoints or developer-specific absolute paths in source. Commit `.env.example` with safe placeholders, never real `.env` secrets. Do not expose private server credentials through Vite client variables.
- Track source, migration files, test fixtures, configuration, documentation and the root npm lockfile. Ignore `node_modules/`, build artifacts (`dist/`, coverage), runtime logs, local credentials, live SQLite files and their `-wal`/`-shm` sidecars. Use a configurable API-owned persistent data path; never use a build output directory for durable storage. Deliberately versioned safe test fixtures are exceptions, not production data.
- Keep dependency changes explicit and minimal. Commit `package-lock.json` alongside dependency changes; use `npm ci` from the root for reproducible installs. Do not introduce new infrastructure or production dependencies without team review.
- Keep unit tests close to the code they test. Place cross-component integration and E2E tests under root `tests/`; fixtures must not depend on a developer's private repository or production database. Use isolated temporary databases and Git repositories in tests. Keep test-only dependencies out of production modules.

#### Enforcement and definition of done (ORG-05)

Establish these checks at E01, using the existing toolchain if equivalent checks already exist. Configure ESLint (including TypeScript and React rules where applicable), a consistent formatter, and enforce import boundaries/cycle checks and naming with suitable lint rules or a small repository validation script. Exclude generated and third-party files from source-specific checks. Do not add multiple competing tools for the same purpose.

| Root command contract | Required result |
|---|---|
| `npm ci` | Reproducible installation from the committed lockfile |
| `npm run lint` | Lint, naming and module-boundary checks pass (or invoke a separately documented mandatory structure check) |
| `npm run format:check` | No unintended formatting differences |
| `npm run typecheck` | All workspace TypeScript checks pass |
| `npm test` | Configured unit/integration tests pass; report actual coverage of the changed behavior |
| `npm run build` | All buildable workspaces compile successfully |

Provide a root verification command (for example `npm run check`) that runs these non-install checks, and document the real startup/test commands in `README.md`. Run relevant checks on each task and the complete gate before merging/release. CI may run the same commands when configured; a new hosted CI system is not required for P0. Add a short `AGENTS.md` pointing to both specifications and this mandatory standard; do not create a third PRD. No change is complete merely because it compiles or looks correct. Report command results, violations and any explicit team-approved exception; never quietly suppress a failing check. Existing code that violates a rule must be identified, and corrections scoped with the team rather than mixed into unrelated feature changes.

Reference practices: [npm workspaces](https://docs.npmjs.com/cli/using-npm/workspaces/), [TypeScript strict mode](https://www.typescriptlang.org/tsconfig/strict.html), [TypeScript consistent filename casing](https://www.typescriptlang.org/tsconfig/forceConsistentCasingInFileNames.html), [TypeScript project references](https://www.typescriptlang.org/docs/handbook/project-references.html), [React file organization guidance](https://legacy.reactjs.org/docs/faq-structure.html), and [Mozilla React style guide](https://mozilla.github.io/ecosystem-platform/reference/style-guides/react-style-guide). These references support the practices; the exact ProjectOS folder names, filename suffixes and command contract are our mandatory project conventions, not universal standards.

### Logical persistence model

These entities are recommended schema boundaries, not finalized SQL migrations. Keep immutable history distinct from current state and store timestamps in a consistent UTC format.

| Entity | Key fields / constraints |
|---|---|
| Projects | Stable ID, name, repository identity, owner, timestamps. Local absolute path bindings remain in each local client's config. |
| Users / project access | Authorized human identity and project membership. One reviewer account is sufficient initially; check authorization on every request. |
| Decisions | Project ID, stable decision ID, reviewed version, statement, title, rationale, status, predecessor ID, created/updated timestamps. Unique project + decision ID. |
| Decision paths / relations | Decision version, normalized repo-relative path; related decision and relationship type. Do not imply automatic mapping. |
| Review events | Decision ID/version, reviewer, channel, explicit outcome, feedback, timestamp, request correlation. Append-only for completed reviews. |
| Impact reports | Project ID, report ID, change description, starting candidates, analyzer options, repo snapshot, consulted decision versions, freshness/completeness indicators. |
| Dependency edges | Report ID, stable evidence ID, source/target paths, relationship type, source location, bounded snippet and traversal chain. |
| Predictions | Report ID, prediction, reason, agent attribution, referenced evidence/decisions; never stored as verified edges. |
| Git commits / changed paths | Repository/project identity, full Git hash, parent hashes, message, author metadata, timestamp and changed paths. Optional bounded diff evidence. |
| Commit associations | Commit ID, decision ID/version, origin, author/agent attribution, timestamp, optional file links and confirmation provenance. Unique commit/decision-version association. |
| Sessions / scoped credentials | Expiry, revocation and permission scope. Store token hashes where feasible; do not store credentials in source control. |
| Request identities | Operation scope, stable idempotency identity, request fingerprint and result reference for duplicate-safe writes/retries. |

For the initial implementation, use stable decision IDs for submitted proposals; an approved replacement receives its own ID and points to the predecessor. Never overwrite an approved decision's statement or rationale in place. A pending proposal may be revised only with a version increment or a new proposal; review must bind to the exact text/version.

Recommended decision transitions:

| Current state | Action | Next state |
|---|---|---|
| New | Submit valid proposal | Pending |
| Pending | Authorized approval of exact version | Approved |
| Pending | Authorized explicit rejection | Rejected |
| Pending | Defer, timeout, cancel, untrusted response | Pending |
| Approved | Replacement is approved in same transaction | Superseded |
| Rejected / superseded | New proposal needed | Historical record remains unchanged |

A replacement may target only the currently active approved predecessor. Reject competing stale approvals with a conflict response. Retain historical versions for impact and Git queries.

### REST contracts

Recommended route families below are illustrative. Agree on actual paths and shared Zod DTOs before parallel development. The seven MCP tool names and inputs remain those in the companion; routes are internal implementation details, not additional MCP tools.

| Method and route | Caller / function |
|---|---|
| `POST /api/projects` | Human session; create a project. |
| `GET /api/projects/:id` | Authorized client; retrieve scoped project information. |
| `GET /api/projects/:id/decisions` | Human or scoped agent; filtered retrieval and exact-ID lookup. |
| `POST /api/projects/:id/decisions` | Human or scoped agent; create pending proposal only. |
| `GET /api/projects/:id/decisions/:decisionId/status` | Human or scoped agent; fresh state for resumption. |
| `POST /api/projects/:id/decisions/:decisionId/review` | Authenticated authorized human dashboard; version-bound approval/rejection. |
| `POST /api/projects/:id/impact-reports` | Scoped local MCP component; persist real analysis findings. |
| `GET /api/projects/:id/impact-reports/:reportId` | Authorized client; read stored report. |
| `POST /api/projects/:id/impact-reports/:reportId/assessments` | Scoped agent; persist labelled predictions. |
| `POST /api/projects/:id/git-links` | Scoped local MCP component; submit real Git metadata and explicit association. |
| `GET /api/projects/:id/git-traceability` | Authorized client; query captured associations and evidence. |
| `GET /api/projects/:id/impact-reports` / `GET /api/projects/:id/git-links` | Dashboard history/list views, bounded and paginated. |

Implement session login/logout and authenticated dashboard review first; design the trusted elicitation review transport only for the later phase, following the security requirements below. Both channels must use the same backend review service. Do not expose a generic agent-callable review endpoint. A trusted in-client review transport is separate from ordinary proposal creation and must not trust a caller-supplied human identity.

All network requests have runtime schema validation and server-side authorization. Return structured data rather than raw SQL or shell output. Recommended response conventions: HTTP 400 for invalid arguments, 401/403 for authentication/authorization, 404 for missing authorized records, 409 for stale versions/conflicts and 503 for temporarily unavailable dependencies. MCP tool errors translate these into actionable messages. Avoid leaking unauthorized record existence.

### Analysis and retrieval defaults

Recommended initial bounds, subject to profiling on the real demo repository:

| Area | Initial implementation recommendation |
|---|---|
| Decision retrieval | Parameterized SQLite keyword matching over title, statement and rationale; exact path joins. Case-insensitive token matching and deterministic sorting. No semantic-search claim or embedding service. |
| Filters | Exact ID selects one accessible record; without ID, discovery defaults to approved active decisions. Combine supplied discovery filters with AND, with OR among paths/keywords within a filter. History is opt-in. |
| Retrieval limit | Default 10 records, hard cap 50; return a truncation indication and support narrowing the query. Preserve enough rationale for a useful result. |
| Source scan | Use tsconfig where available; include supported JS/TS source files; exclude dependencies, generated output, `.git`, secret files and irrelevant binary content. |
| Traversal | Reverse dependency traversal from the starting nodes, initially up to two edges. Use a visited set and retain actual directed dependency chains. Inspect direct references where supported; label unresolved relationships. |
| Graph limits | Initially cap displayed/returned graph at 100 files and 300 edges, with a configurable analysis time budget. Report when any bound is reached. Tune after measuring. |
| Freshness | Capture full HEAD (or unborn state), worktree content fingerprint for analyzed paths/config, analyzer version/options and decision versions. Dirty changes cannot be identified from HEAD alone. Revalidate locally before relying on an older report. |
| Evidence | Use normalized repo-relative paths and source line/range; short snippets only. Do not ingest entire files or secret-bearing content into the shared database. |
| Git inspection | Use safe subprocess argument arrays with a fixed Git executable and repository cwd; resolve commits and capture parent/changed-path metadata. Limit any diff returned to the agent, flag truncation. |

For cloud dashboards, distinguish **snapshot recorded at analysis time** from **freshness verified now**. The hosted backend cannot know whether a laptop's worktree has changed unless the local component supplies fresh information. Do not display a misleading live-current badge. For merge commits, either document comparison against a specified parent or report that detailed diff interpretation is unsupported in the initial version.

### Authentication, authorization and human-review trust

The most important security boundary is the difference between an agent submitting a proposal and a human authorizing it. The backend, not the UI, owns the authoritative review state.

| Boundary | Requirement / recommended control |
|---|---|
| Browser | Authenticated Express Session, persistent session store, HttpOnly cookies, Secure cookies under HTTPS, suitable SameSite policy, CSRF protection for mutations, session expiry and logout. |
| Ordinary MCP-to-API traffic | Use a revocable, project-scoped credential with minimum permissions. It may read decisions and create permitted proposals/reports/associations, never approve decisions by itself. |
| Elicitation (P1, later) | Negotiate client support; request explicit structured review for the exact pending proposal. Verify trusted reviewer binding, version, expiry, and one-time response. Never accept a model-supplied approval boolean as human input. |
| Untrusted review | Fail closed: leave pending and provide dashboard review location. No silent promotion to approved or rejected from a client policy action. |
| Local repository | Canonicalize paths and check containment, including symlinks; avoid arbitrary commands or filesystem access. Reject unknown repo/project bindings. |
| Stored evidence | Treat repository text, commit messages and AI predictions as untrusted data. Escape displayed text; do not execute instructions embedded in them. Redact sensitive snippets and never log secrets or credentials. |
| Network | Loopback development services only by default. Use HTTPS and authenticated APIs for networked deployment. Do not expose SQLite or a local filesystem server publicly. |

**Unresolved security-critical design: trusted elicitation reviewer binding.** Dashboard approval is the initial primary review path. Elicitation is a planned later enhancement; its exact trusted implementation has not been verified. MCP capability negotiation and a structured form response alone do not prove human identity to the backend. In an interactive single-developer demo, a controlled local client may be part of the trust model, with its assumptions documented. It is not a defense against a hostile agent with unrestricted access to the same machine.

Implementation sequence: complete steps 1–2 and the full local P0 workflow before starting steps 3–5.

1. Persist the pending proposal first, including a stable request identity and version.
2. Implement the dashboard review path with server-side authorization and transactional state changes in a reusable backend review service. Return pending immediately from `propose_decision`, then use `get_decision_status` on manual resumption. Keep proposal creation separate from approval transport.
3. After T13 passes, integrate the negotiated SDK elicitation mechanism into the same proposal workflow; reuse the backend review service rather than creating a second approval implementation. Configure interactive human review, request an explicit decision rather than an empty confirmation, and test that model/tool arguments cannot supply the human response.
4. Define and implement the restricted reviewer-bound channel for persisting that response. A challenge bound to project, proposal, version, reviewer and expiry can prevent replay; it does not by itself establish reviewer identity. Do not give the ordinary agent credential a review permission or place human session secrets in model context.
5. If the local trust boundary cannot be established, use the authenticated dashboard fallback. For hosted/shared operation, enable immediate elicitation approval only when reviewer identity and authorization can actually be established; otherwise use fallback rather than weaken authorization.

The P0 security acceptance gate requires actual authorized dashboard review and denial of ordinary agent approval attempts. The separate P1 elicitation gate requires actual trusted human review evidence in the selected client, not a simulated approval. ProjectOS can protect its own records and guide the intended workflow; it cannot promise to stop an external agent with independent file-editing privileges.

### Reliability and non-functional requirements

| ID | Requirement | Verification |
|---|---|---|
| NF-01 | Local-first operation, no separate paid LLM API. | Run the full backend, MCP and dashboard locally; model reasoning occurs only in the connected client. The client may require internet and has usage limits. |
| NF-02 | Durable, consistent state. | Restart processes; verify saved records. Interrupt or repeat a write; confirm no half-applied supersession, duplicate link or duplicate proposal. |
| NF-03 | Bounded responsiveness. | Recommended demo targets: context retrieval under 2 seconds locally and small-repository analysis under 10 seconds on the demo laptop, excluding LLM reasoning and human review. Measure; if missed, document rather than claim compliance. |
| NF-04 | Clear recovery. | Invalid input, missing records, no applicable decision, unsupported source constructs, repository errors, timeout and backend failure all have distinguishable outcomes. No fake success or silent data loss. |
| NF-05 | Maintainability. | All mandatory ORG-01–ORG-05 rules are satisfied; naming, boundary, lint, formatting, type, test and build checks pass, with any approved exceptions documented. |
| NF-06 | Observability and data minimization. | Log correlation IDs, operation, duration, result and error category; avoid logging credentials, entire source files or model conversations. Show analysis limits and evidence origins. |
| NF-07 | Accessibility and usability. | Main review and navigation actions usable by keyboard; meaningful text labels and visible error/retry feedback. Graph detail is also accessible as a readable list. |
| NF-08 | Compatibility. | Document the tested OS, Node, Git, Codex client and MCP SDK versions. Do not claim universal agent compatibility solely from MCP support. |

Keep expected no-result states distinct from errors. An unlinked commit is valid; an invalid commit hash is not. A pending proposal is valid; failed authentication is not. A graph with no dependencies is valid only when the scanner actually completed or reports its incomplete scope.

Do not hold a SQLite transaction open while waiting for human input. Persist first, release database resources, then process an authorized review using a short transaction. Handle concurrent dashboard/elicitation reviews by checking the current version/status again; an earlier or duplicate response must not override an already resolved state.

## 4. Verification, milestones and implementation workflow

### Verification plan

Use normal engineering tests for ProjectOS, not a new product feature. The exact test framework is an implementation choice; use a repeatable command that teammates and coding agents can run. Tests must exercise actual persisted state and real repository fixtures where the behavior depends on them.

| Test ID | Requirement coverage | Test / expected result |
|---|---|---|
| T01 | WS-01–04, NF-08 | Create project, bind a valid repo, start real Codex MCP client, retrieve seeded approved decision. Wrong project or root fails. |
| T02 | PB-01–02 | Query by text, path, status and exact ID; verify bounded response, history opt-in, empty state and no cross-project leakage. |
| T03 | PB-03–04, NF-02 | Submit replacement; old decision remains active. Reject it; old decision remains active. Approve a valid alternative; supersession is atomic and history retained. |
| T04 (P1 only) | PB-05, PB-07 | Use actual interactive Codex elicitation. Confirm exact proposal is presented and authorized approval returns persisted state. Reject model-supplied/automatic/untrusted approval. |
| T05 | PB-06–07 | Submit a proposal and verify that it persists pending even after agent exit. Approve or reject later in dashboard; resume with one status lookup. Check stale, replayed and unauthorized review attempts. In P1 additionally test cancelled, deferred, timed-out and untrusted elicitation leaves the proposal pending and dashboard fallback works. |
| T06 | PB-08 | Implement an ordinary change within approved architecture without a redundant new proposal. A material change still requires review. |
| T07 | CI-01–03, CI-08 | Real fixture with direct and two-hop imports, cyclic dependencies and an unresolved import; assert correct direction, source evidence, bounded traversal and limitations. |
| T08 | CI-04–05 | Attach approved path-linked decisions; submit a reasoned AI assessment; verify predictions are separate and invalid evidence references are rejected. |
| T09 | CI-06–07 | Modify a relevant file without committing; older report remains a historical snapshot or becomes stale after local revalidation. Rerun and inspect graph evidence in UI. |
| T10 | GT-01–04 | Create real commit using normal Git; link it explicitly; verify same data from decision, commit and file lookup. Repeat association, link multiple decisions, reject nonexistent hash and invalid file link. |
| T11 | GT-02, GT-05 | Show association origin correctly; supersede a decision; older commit retains original rationale. Simulate clone without the object; show stored evidence and live-evidence limitation. |
| T12 | NF-01–07 | Restart, validate persistence, test malformed payloads and path traversal, measure retrieval/analysis, inspect logs, review keyboard usability and confirm no separate LLM API calls. |
| T13 | All P0 requirements | Run the complete TeamFlow scenario with a real MCP client and actual Git repository, then retrieve the result in a fresh session. |
| T14 | P1 deployment | Only after T13 local pass: repeat core workflow using HTTPS-hosted backend; verify EBS persistence, scoped credentials, dashboard approval (and fallback if elicitation is enabled) and local analysis/Git behavior. |

Use a small test repository with known relationships so expected graph edges are independently checkable. Add an extra dependent file or modify an import during the demo preparation and verify that results change dynamically. Hardcoded outputs do not satisfy CI-01 or CI-02.

### Delivery checkpoints

| Date / milestone | Work and exit condition |
|---|---|
| November 26–27 — basic prototype | Inspect repository; define shared contracts and project binding; start local API/SQLite and MCP server; demonstrate real decision retrieval in Codex with minimal UI. |
| November 27–30 — core development | Build Project Brain lifecycle with dashboard approval, ts-morph evidence engine, Git associations, React views and tests. Integrate continuously, not just at the end. |
| December 1 — full-day hackathon | Close remaining core integration issues; verify entire local workflow and rehearse. Only once local gate is satisfied, begin trusted elicitation integration and then AWS work as capacity permits. |
| December 2 — full-day hackathon | Resolve remaining failures; verify later elicitation and deployment if ready; polish and rehearse with real data; preserve working local fallback and final deliverables. |

These are targets, not an estimate that every task is guaranteed to finish. Exact hackathon submission time and current prototype completion are not confirmed. Adjust assignments to actual repository status and available team hours.

### Build sequence for a four-person team

Recommended workstream allocation; assign actual people at kickoff. One person must own integration and contract changes even when agents write much of the code.

| Task | Owner role | Depends on | Done when |
|---|---|---|---|
| E01 — inspect repo, bootstrap workspace, ORG-01–ORG-05 checks, setup commands and shared contracts | Integration lead | None | Existing work preserved; mandatory structure/naming/boundary checks configured; all members can start local services and agree on shared IDs/DTOs. |
| E02 — SQLite migrations, project scope, decision retrieval and lifecycle | Backend lead | E01 | WS/PB foundation tests pass; approved/pending states persist. |
| E03 — MCP registration, local binding, backend REST client | Integration lead | E01, E02 retrieval contract | Real client retrieves approved context; errors handled. |
| E04 — dashboard review and reusable backend approval service | Backend + integration leads | E02, E03 | T03, T05 (P0 portion), T06 pass; proposal returns pending and manual resumption works. |
| E05 — dependency analyzer and real fixtures | Analysis lead | E01 | T07 passes on independent real files. |
| E06 — impact storage and predictions | Analysis + backend leads | E02, E05 | T08–T09 pass; report visible through API and MCP. |
| E07 — Git evidence and association services | UI/Git lead + backend lead | E01, E02 | T10–T11 pass; no automatic Git writes. |
| E08 — React views and graph | UI/Git lead | E01; API contracts from E02, E06, E07 | Main views render and use real API data; primary dashboard review usable. |
| E09 — full integration, security checks, setup and demo | Entire team; integration lead accountable | E03–E08 | All P0 tests pass, including T12–T13; no unexplained mock behavior. |
| E10 — trusted MCP Elicitation (later phase) | Backend + integration leads | E09 local gate | T04 and T05 P1 checks pass; otherwise remain on dashboard approval and record the blocker. |
| E11 — AWS deployment | Assigned deployment owner | E09 local gate | T14 passes; local fallback still runs. |

Start E05, E07 and frontend work against agreed contracts in parallel with E02/E03. Keep a shared real fixture and avoid separate incompatible demo datasets. UI placeholders during isolated development are fine; replace them with live data before marking acceptance tests complete.

### Rules for AI-assisted implementation

- At the start of each task, read both specification files and inspect the actual code, tests and configuration. Do not assume a blank repository or assume earlier chat-generated code exists.
- Identify the requirement IDs being implemented, the files/components affected, the relevant shared contract and the tests that prove the change. Keep each task independently reviewable.
- Build a small vertical slice before expanding breadth. Do not regenerate the whole project merely to fix a small defect.
- Respect the finalized technologies, seven MCP tools and non-goals. Do not introduce a vector database, additional paid model API, automatic Git writes or another coding environment to bypass a difficult requirement.
- Follow mandatory repository standards ORG-01–ORG-05 for every new or modified file. Maintain cohesive modules and avoid duplicated business logic. Changes to a shared contract must be coordinated with the other workstreams and tested against both caller and receiver.
- Run relevant tests, type checking and linting/build checks after each task. If any command cannot be run, state why; do not mark it passed. Do not treat generated code as implemented until verified.
- If blocked by an unresolved decision, record the blocker and proposed smallest safe change. Security requirements must not be weakened to make a demo pass. Humans approve scope or architecture changes to ProjectOS itself.
- Report completed requirement IDs, modified files, test commands/results, remaining limitations and next dependency. Humans review before merging changes. Do not commit/push without the team's normal authorization.

These rules are intended for the agents building ProjectOS; they are distinct from the runtime MCP workflow for agents using ProjectOS. Keep a short repository instruction file (e.g. `AGENTS.md`) pointing to both documents and the actual development commands once the codebase exists. No third specification is needed to begin implementation.

### Demonstration and release gate

Use the TeamFlow journey in the companion rather than inventing a new flow for the presentation. The final demo must demonstrate real interactions:

1. A fresh Codex session retrieves an approved architectural decision.
2. A proposed change produces an actual dependency path and separately labelled AI assessment, with source evidence visible in the dashboard.
3. A revised approach becomes a pending architectural proposal. Approve it through the dashboard, resume Codex and verify persisted status with `get_decision_status`. After the local core is verified, demonstrate trusted immediate elicitation and dashboard fallback separately if the later phase passes.
4. A normal Git commit is created and explicitly linked; the dashboard and a fresh agent session retrieve the stored rationale and actual commit evidence.
5. Persisted records survive restart. Show that a no-link or rejected/pending state is handled honestly.

The P0 MVP is complete when all P0 gates and the ORG-05 repository quality gate pass with dashboard approval; elicitation is not a blocker. Do not claim P1 elicitation is complete unless its trusted review path and fallback have been verified. Do not claim cloud deployment or multi-agent/multi-device testing unless actually performed. A second session of Codex demonstrates persistent context, not cross-vendor interoperability.

The local release gate is passing core acceptance checks with the actual repository and chosen client. Maintain a reproducible local launch/seed procedure and a known working configuration. For AWS, host the web build and API on EC2 with persistent SQLite and session data on EBS; use HTTPS, scoped credentials and documented backup/restore and cost controls. Keep all repository operations local. Verify persistence and actual endpoint access before calling the deployment done.

## 5. Open decisions and risks

### Decisions to resolve during implementation

| Question | Recommended default / resolution point |
|---|---|
| Actual development repository and environment | Inspect before E01; TeamFlow is the agreed example, not evidence of an existing repository. Prepare a small real JS/TS fixture/demo application if needed. |
| Repository onboarding | Explicit project ID + canonical repository root in local MCP config; validate project access and repository identity. Resolve in E01–E03. |
| SQLite driver and sessions | Select compatible driver/migrations and durable session store based on installed Node version. Resolve in E02. |
| MCP SDK/client versions | Pin a tested SDK and interactive Codex version for core tool calls in E03. Verify the supported elicitation mechanism in E10 after the local gate. |
| Reviewer-bound elicitation channel | Security-critical. Define local trust model and authorized review transport; use dashboard fallback when trust cannot be established. Resolve in E10 before enabling or claiming trusted in-client approval; not a blocker for E04 or the P0 core. |
| Retrieval rules and analyzer bounds | Start with the proposed bounded defaults above; adjust only after actual tests. Resolve in E02/E05. |
| Exact REST and database schemas | Agree on shared DTOs, constraints, migrations and error shape before parallel component integration. Resolve in E01–E02. |
| Analysis freshness | Worktree-aware snapshot/fingerprint and explicit historical/stale state; hosted backend cannot verify local freshness unaided. Resolve in E05–E06. |
| Git association capture and provenance | Prefer explicit agent-initiated linking after the normal commit. No background auto-committing or mandatory AI-generated historical matching. Record origin; optional human correction UI. Resolve in E07. |
| Deployment and credentials | Confirm AWS account, cost/credits, HTTPS setup, reviewer authorization and EBS path after local integration. Resolve in E11. |
| Delivery ownership and final deadline | Team assigns roles and confirms final submission time. Do not infer completion from milestone dates. |

### Main engineering risks

| Risk | Impact | Mitigation / fallback |
|---|---|---|
| Elicitation lacks reliable human authorization | Critical for later elicitation: agent could bypass review or in-client approval cannot be demonstrated; dashboard-based P0 remains viable. | Version-bound review, controlled interactive client, trusted channel and integration checks; fail closed to dashboard. |
| Coding agent omits tools or uses an incorrect order | High: integrated workflow incomplete. | Give explicit demo instructions and clear tool descriptions; verify real invocation; persistent pending state and manual resume. MCP is not an enforcement engine. |
| Agent chooses poor starting files | High: actual dependency map misses relevant modules. | Show starting candidates and limitations, let agent refine inputs, demonstrate known real paths rather than promise complete coverage. |
| Static analysis misses runtime effects | High: misleading predictions. | Keep structural evidence separate from hypotheses, explicitly report unsupported behavior. |
| Large repository parsing / graph overload | Medium–high: slow or unusable output. | Limit scope, traversal, snippets and graph size; profile on demo repo, return partial labelled results. |
| Incorrect Git-to-decision association | High: false historical narrative. | Record who created link and its basis; no fabricated reasons; allow unlinked records and correction where implemented. |
| Subscription usage limits | High: slowed development or unavailable live model. | Small focused tasks, concise evidence, monitor account usage and reserve capacity for demo; MCP Inspector diagnostic fallback is not a full agent demo. |
| Team integration / incomplete scope | High: separate components cannot demonstrate one workflow. | Shared contracts, early vertical slice, requirement-to-test tracking, integration ownership; stop adding features. |
| AWS cost or deployment complexity | Medium–high: cloud failure delays demo. | Local gate first, single EC2/EBS deployment, billing controls and a working local fallback. |
| Misleading demo claims | High: weak credibility. | Actual Git SHA, actual source relationships, explicit provenance, label mocks and untested claims. |
