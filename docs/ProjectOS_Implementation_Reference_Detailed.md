# TeamFlow — the example project

TeamFlow is a project-management application that allows companies to create projects, assign tasks to employees, track progress, manage employee availability and send notifications. Rahul develops TeamFlow using Codex; his teammate Ananya later continues work on the same repository in a fresh coding session.

ProjectOS is the separate developer tool connected to their coding agent and repository, not part of TeamFlow's business logic.

Their existing architecture has three approved decisions:

| Decision ID | Approved decision | Reason | Associated code (example) |
|---|---|---|---|
| DEC-001 | Only project managers can authorize task ownership changes. | Preserve accountability. | `src/services/taskAssignmentService.ts` |
| DEC-002 | Every ownership change must appear in the activity log. | Maintain an audit trail. | `src/services/activityLog.ts` |
| DEC-003 | Notifications are sent only after a change is successfully saved. | Avoid notifying people about failed changes. | `src/services/notificationService.ts` |

Rahul wants to introduce automatic reassignment of unfinished tasks when an employee goes on leave. This may conflict with DEC-001. The example follows him from connecting the repository through impact analysis, human approval, implementation, Git linking and Ananya's later reuse of the same knowledge. All example IDs, paths and records are illustrative.

## MCP calls

ProjectOS exposes seven tools through MCP. The coding agent discovers and invokes them through `tools/call`. The tools use the local repository and Express backend; the agent does not access SQLite or human approval endpoints directly.

| MCP tool name                 | Feature / responsibility | Main input | Result / side effect |
| ----------------------------- | --- | --- | --- |
| `get_decisions`               | **Project Brain / read** — Find relevant decisions or retrieve a known decision in detail. | `project_id`; optional `query`, `decision_id`, `related_files`, `status`, `include_history`, `limit` | Decision IDs, statements, rationale, status, code links and requested history. Defaults to active approved decisions for discovery. |
| `analyze_change`              | **Change Impact / analysis + report write** — Find actual code relationships around a proposed change and retrieve relevant approved decisions. | `project_id`, `change_description`; starting files/symbols | Report ID, repository snapshot, dependency chains, source evidence, decision IDs and limitations; saves report. |
| `record_impact_assessment`    | **Change Impact / optional report write** — Save the agent’s interpretation separately from verified code evidence. | `project_id`, `report_id`, `predictions` (with reasons and optional evidence/decision IDs) | Adds labelled AI predictions and potential conflicts; does not change approved decisions or verified findings. |
| `propose_decision`            | **Project Brain / proposal + interactive review** — Save a new or replacement decision as pending for dashboard review; later, request human review through trusted MCP elicitation. | `project_id`, `title`, `decision`, `rationale`, `related_paths`; optional related decision IDs, report ID and superseded decision ID | Decision ID, version, pending status and dashboard review location in P0; later, approved/rejected may be returned after trusted elicitation. Only authorized human review can change approval state. |
| `get_decision_status`         | **Project Brain / read** — Check the current review outcome of a known proposal when resuming later. | `project_id`, `decision_id` | Current status, version, review feedback and timestamp where available. No repeated polling required. |
| `link_commit_to_decision`     | **AI Git / write association** — Connect an existing real Git commit to an approved decision. | `project_id`, `commit_hash`, `decision_id`; optional `file_associations` | Validated link and actual changed-file evidence; does not create a commit, branch or push. |
| `get_git_traceability`        | **AI Git / read** — Find commits for a decision, or recorded reasoning for a commit or file. | `project_id`, one of `decision_id`, `commit_hash` or `file_path` | Recorded decision links, rationale, history and Git evidence; identifies unlinked changes. |

### How each MCP tool works

Each tool receives structured inputs chosen by the coding agent. Its input schema tells the agent which fields are required and what the optional fields mean. **Required** means the tool cannot run without that input; **optional** means the agent supplies it only when relevant.

The field names and example payloads below define the intended interface in practical terms; exact Zod schemas and response formats are still to be implemented. `project_id` is required in every tool and identifies the authorized ProjectOS workspace, not a local folder path. The agent learns it from the project setup/configuration.

#### 1. `get_decisions`

`get_decisions` is a **read-only MCP tool** that helps a coding agent understand what the team has already decided and why. It retrieves architectural decisions from Project Brain without requiring the agent to know their IDs beforehand.

**Input parameters**

| Parameter | Required? | What it means and when to use it |
|---|---|---|
| `project_id` | Yes | Identifies the project, e.g. `teamflow`. |
| `query` | No | Searches by topic or keywords, e.g. `task reassignment`. Use when the agent does not know a decision ID. |
| `decision_id` | No | Retrieves one known decision, e.g. `DEC-001`. Use when its ID came from an earlier tool result or the developer. |
| `related_files` | No | Finds decisions explicitly linked to the supplied repository-relative file paths. Useful before editing those files. |
| `status` | No | Filters by `approved`, `pending`, `rejected` or `superseded`. Discovery defaults to active approved decisions; use another status when looking for proposals or historical records. |
| `include_history` | No | Set to `true` when the agent needs previous versions and supersession history. Ordinary context retrieval does not need the full history. |
| `limit` | No | Limits the number of matching decisions, helping control context size. A bounded default applies if omitted. |

Only `project_id` is required. The agent includes the optional parameters when it needs a more specific answer.

**When does the agent use it?**

Suppose Rahul asks Codex to add automatic task reassignment when an employee goes on leave. Codex needs to find out whether TeamFlow already has rules about task ownership.

It calls `get_decisions` with a topic rather than guessing a decision ID:

```json
{
  "project_id": "teamflow",
  "query": "task reassignment",
  "status": "approved"
}
```

**Other examples of when to use the parameters**

1. Starting a new coding session — retrieve active approved decisions within the default result limit.

   ```json
   {"project_id": "teamflow"}
   ```

2. Before modifying a particular file — retrieve decisions explicitly linked to that file.

   ```json
   {"project_id": "teamflow", "related_files": ["src/services/taskAssignmentService.ts"]}
   ```

3. Understanding an old decision — use its known ID and ask for history.

   ```json
   {"project_id": "teamflow", "decision_id": "DEC-001", "include_history": true}
   ```

4. Limiting context — return at most five matching decisions.

   ```json
   {"project_id": "teamflow", "query": "permissions", "limit": 5}
   ```

5. Recovering a pending proposal from a previous session — search for pending decisions on the relevant topic.

   ```json
   {"project_id": "teamflow", "query": "leave-related task reassignment", "status": "pending"}
   ```

**What does ProjectOS do internally?**

1. The local MCP server receives the query and forwards it to the Express REST API.
2. Express checks access to TeamFlow and validates the parameters using Zod.
3. The backend queries SQLite for matching decision records and their associated paths.
4. It returns the relevant records to Codex through MCP, including history only when requested.

**What does the agent receive?**

| Field | Example result |
|---|---|
| Decision ID | DEC-001 |
| Decision | Only managers can authorize task ownership changes. |
| Rationale | Preserve accountability. |
| Status | Approved |
| Related file | `src/services/taskAssignmentService.ts` |

Codex can now recognize that the proposed automatic reassignment may conflict with the existing rule. It also knows the ID for future lookups.

**Who does what?**

| Component | Responsibility |
|---|---|
| Codex | Chooses the search terms and optional filters based on the developer's request. |
| MCP server | Receives arguments and returns decision records to Codex. |
| Express + Zod | Checks project access, validates inputs and applies retrieval rules. |
| SQLite | Stores and retrieves decisions, code links and history. |

**Important distinction:** No separate AI model is needed for retrieval. Topic/path matching is not guaranteed semantic search. No results do not prove that no relevant decision exists.

Discovery defaults to active approved decisions. Exact-ID lookup can return a historical or pending record, subject to authorization and any explicit status filter. A bounded response indicates whether more results exist. Exact defaults and combinations of optional filters must be defined during implementation.

**In simple words:** What have we already decided, and why?

#### 2. `analyze_change`

`analyze_change` is an MCP tool that helps the coding agent understand **what parts of the existing project might be affected by a proposed change, before writing any code.**

**Input parameters**

| Parameter | Required? | What it means and when to use it |
|---|---|---|
| `project_id` | Yes | Selects the project and its registered local repository. |
| `change_description` | Yes | Describes what the developer wants to change. It is stored with the report and provides context for the analysis. |
| `starting_files` | Conditional | Repository-relative paths selected by the agent as likely starting points. Use when the relevant code files are known. |
| `starting_symbols` | Conditional | Known code symbols, such as a function or class name, to locate as starting points. Use when the relevant symbol is known; it must resolve to actual code. |

`project_id` and `change_description` are mandatory. The agent must also supply at least one usable starting file or resolvable symbol. The scanner cannot reliably infer starting points from an arbitrary natural-language request alone.

**When does the agent use it?**

Suppose Rahul asks Codex:

> Automatically reassign unfinished tasks when an employee goes on leave.

Codex understands the request and searches the repository. It identifies `taskAssignmentService.ts` as a relevant starting file, then invokes `analyze_change`:

```json
{
  "project_id": "teamflow",
  "change_description": "Automatically reassign tasks when an employee goes on leave",
  "starting_files": ["src/services/taskAssignmentService.ts"]
}
```

The agent can instead supply a known, resolvable function or class through `starting_symbols`. It should rerun the analysis after material redesign or a relevant repository change. If it cannot find a reliable starting point, it asks for more context or reports the limitation.

**What does ProjectOS do internally?**

1. Validates the starting paths or symbols against the registered local repository.
2. Uses `ts-morph` to discover which files depend on the starting code.
3. Traces indirect dependencies using the dependency engine. A two-hop traversal bound is proposed for the MVP.
4. Retrieves architectural decisions associated with the discovered paths from Project Brain through Express.
5. Saves an impact report in SQLite through the backend and returns the findings to Codex.

**What does the agent receive?**

| Finding | Reason |
|---|---|
| `taskAssignmentService.ts` | Agent-selected starting file containing assignment logic. |
| `taskRoutes.ts` | Directly depends on the assignment service. |
| `bulkTaskService.ts` | Directly depends on the assignment service. |
| `projectOperations.ts` | Indirectly depends on the assignment service through bulk task operations. |
| DEC-001 | Approved decision requiring manager authorization for task ownership changes. |

The result also includes a report ID such as `IMP-001`, repository state, actual source locations/snippets, dependency chains, evidence IDs and known analysis limitations.

Codex can now reason that automatic reassignment might conflict with DEC-001. This interpretation is an AI prediction, not a verified conclusion produced by the import graph.

**Who does what?**

| Component | Responsibility |
|---|---|
| Codex | Understands the request, identifies starting code and interprets the results. |
| MCP server | Runs local analysis and exchanges requests and results with Codex. |
| `ts-morph` + dependency engine | Discovers actual code relationships and traces indirect connections. |
| Project Brain | Provides relevant architectural decisions through Express. |
| Express + Zod | Validates and persists the structured report and decision references. |
| SQLite | Stores the impact report. |
| React Flow | Visualizes the saved dependency relationships in the dashboard. |

**Important distinction:** No separate AI model is required for the dependency analysis. A verified dependency does not prove that a file must be edited or will break. Unsupported languages, unresolved imports and uncertain runtime effects must be reported honestly.

**In simple words:** If we make this change, what connected code should we review, and which existing decisions matter?

#### 3. `record_impact_assessment`

`record_impact_assessment` saves **the coding agent’s interpretation of an existing impact report**, so the developer can see possible consequences and decision conflicts in ProjectOS, not just in Codex.

**Input parameters**

| Parameter | Required? | What it means and when to use it |
|---|---|---|
| `project_id` | Yes | Identifies the project that owns the impact report. |
| `report_id` | Yes | Identifies the saved report being interpreted. The agent obtains it from `analyze_change`. |
| `predictions` | Yes | One or more possible consequences or potential decision conflicts identified by the agent. Each entry includes an explanation of why the agent thinks it matters. |
| `evidence_ids` | Optional per prediction | References to actual evidence in the saved report, when available. Omit if the prediction has no verified code evidence. |
| `decision_ids` | Optional per prediction | Relevant decisions referenced by the prediction, e.g. `DEC-001` for a potential manager-authorization conflict. |

The report ID comes from `analyze_change`. `evidence_ids` and `decision_ids` are optional fields inside each prediction, not independent top-level arguments.

**When does the agent use it?**

Codex receives report `IMP-001` and sees that the task assignment code is connected to DEC-001. It reasons that automatic reassignment might bypass manager approval. It also predicts that TeamFlow may need an interface for employees to report leave.

If Rahul wants these predictions visible in the saved report, Codex calls:

```json
{
  "project_id": "teamflow",
  "report_id": "IMP-001",
  "predictions": [
    {
      "prediction": "Automatic reassignment may conflict with manager-only authorization.",
      "reason": "The proposed workflow changes ownership without manager approval.",
      "decision_ids": ["DEC-001"]
    },
    {
      "prediction": "A leave-status interface may be needed.",
      "reason": "Employees need a way to report that they are unavailable."
    }
  ]
}
```

If a prediction has supporting code evidence, the agent can include the corresponding `evidence_ids` from the report. It must not invent these IDs.

**What does ProjectOS do internally?**

1. Receives the predictions through MCP and forwards them to Express.
2. Validates the report ID, project access and referenced decisions/evidence.
3. Saves the agent's assessment separately from the verified dependency findings in SQLite.
4. Makes the stored assessment available to the dashboard through REST.

**What does the agent receive?**

| Field | Example result |
|---|---|
| Report ID | IMP-001 |
| Assessment result | Predictions saved successfully. |
| Saved findings | Potential manager-authorization conflict; possible leave-status interface. |
| Classification | AI predictions, not verified code relationships. |

**Who does what?**

| Component | Responsibility |
|---|---|
| Codex | Reasons about possible consequences using the report and developer request. |
| MCP server | Receives and forwards the structured assessment. |
| Express + Zod | Validates references and saves the assessment. |
| SQLite | Stores predictions separately from verified evidence. |
| React dashboard | Shows the predictions alongside the impact report, clearly labelled. |

**Important distinction:** The dashboard cannot read Codex's private conversation. This tool is how the agent explicitly shares its conclusions with ProjectOS. It is optional for evidence-only reports and cannot modify approved decisions or promote a prediction to a verified fact.

**In simple words:** Save what the AI thinks could happen, without confusing it with what our code analysis actually found.

#### 4. `propose_decision`

`propose_decision` lets the coding agent submit a **new or replacement architectural decision for human review**. Project Brain saves the proposal as pending for dashboard approval. After the complete local core is working, the MCP server can additionally request human input through trusted elicitation.

**Input parameters**

| Parameter | Required? | What it means and when to use it |
|---|---|---|
| `project_id` | Yes | Identifies the project where the proposal belongs. |
| `title` | Yes | Short name for the proposed decision. |
| `decision` | Yes | The exact architectural rule or approach being proposed. |
| `rationale` | Yes | Why the team should make this decision. |
| `related_paths` | Yes | Repository-relative paths associated with the decision, when known; an empty list can represent a proposal whose code does not exist yet. |
| `related_decision_ids` | No | Existing decisions that the proposal builds upon or relates to. Does not replace those decisions. |
| `impact_report_id` | No | Links the proposal to a saved impact report, e.g. `IMP-002`. Use when review should include its findings. |
| `supersedes_decision_id` | No | Identifies an existing decision that this proposal would replace if approved. Omit for a new decision that does not replace another. |

**When does the agent use it?**

Rahul reviews the impact report and decides that automatic reassignment should not bypass managers. Instead, TeamFlow should suggest reassignments and let managers approve them.

Codex re-analyzes the revised approach and receives `IMP-002`. The team wants the new rule recorded for future sessions, so Codex submits:

```json
{
  "project_id": "teamflow",
  "title": "Leave-related task reassignment",
  "decision": "Suggest reassignment options when an employee is unavailable; a manager must authorize any ownership change.",
  "rationale": "Reduce manual coordination while preserving managerial accountability.",
  "related_decision_ids": ["DEC-001"],
  "related_paths": ["src/services/taskAssignmentService.ts"],
  "impact_report_id": "IMP-002"
}
```

This adds a new decision consistent with DEC-001. If the team instead wants to replace DEC-001, Codex supplies `supersedes_decision_id: "DEC-001"` with the exact replacement rule and rationale. The old decision stays active until authorized approval.

Routine edits within existing approved architecture do not require this call.

**What does ProjectOS do internally?**

1. Express checks project access and validates the proposal, related records and paths.
2. Saves the proposal as pending in SQLite and assigns an ID such as `DEC-004`.
3. Returns the pending proposal ID, version and dashboard review location to Codex immediately.
4. The developer reviews the exact proposal, rationale and impact context in the authenticated dashboard and approves or rejects it.
5. Express validates reviewer authorization and proposal version before saving the outcome using a reusable backend review service. For an approved replacement, it supersedes the old decision and activates the replacement in one transaction.
6. When the developer asks Codex to continue, `get_decision_status` returns the persisted outcome. Retries reuse the same proposal rather than creating duplicates.

**Later phase — MCP Elicitation:** After the full local core workflow is verified, extend the proposal tool to request explicit human input inside a supported, trusted coding client. Use the same backend review service and return the persisted outcome directly when review succeeds. If review is unavailable, interrupted or untrusted, return pending and use the dashboard.

**What does the agent receive?**

| Review outcome | Result returned to Codex | What Codex does |
|---|---|---|
| Initial dashboard-first flow | DEC-004, version, `pending`, dashboard review location | Stops work on the pending architectural change; resumes after the developer requests it and checks status. |
| Later: authorized immediate elicitation approval | DEC-004, version, `approved` | Continues with the exact approved plan. |
| Later: trusted explicit elicitation rejection | DEC-004, version, `rejected`, available feedback | Stops or revises and re-analyzes the plan. |
| Later: deferred, unsupported, interrupted or untrusted review | DEC-004, version, `pending`, dashboard review location | Uses the existing dashboard review and manual resumption flow. |

For example, the initial proposal returns a record equivalent to:

```json
{
  "decision_id": "DEC-004",
  "status": "pending"
}
```

The complete response also provides the version and dashboard review location.

**Who does what?**

| Component | Responsibility |
|---|---|
| Codex | Drafts the decision and submits it; cannot approve it. |
| MCP server / SDK | Returns pending in P0; later initiates elicitation and processes the client response. |
| Coding client | Later presents the human-input interface when supported. |
| Human reviewer | Makes the architectural decision. |
| Express + Zod | Authorizes review, validates the response and applies lifecycle changes. |
| SQLite | Persists the proposal, review status and history. |
| React dashboard | Provides primary authenticated review in P0 and fallback review after elicitation is added; displays decisions. |

**Important distinction:** Dashboard review is the primary and only enabled review path in P0. Elicitation is added after the core local workflow is verified; the dashboard then remains the fallback. Cancellation, timeouts, automatic client denial or untrusted responses must not be interpreted as authorized approval or rejection. The proposal remains pending and the agent stops rather than continuously polling.

The agent has no approval flag or agent-callable approval tool. Elicitation support and trustworthy reviewer authorization must be verified during later-phase integration, not before the dashboard-based core is complete. If human authorization cannot be established, use dashboard approval.

**In simple words:** Ask the human to approve a new architectural rule in the dashboard first; later, allow trusted approval without leaving the coding environment.

#### 5. `get_decision_status`

`get_decision_status` is a **read-only MCP tool** that checks whether a previously submitted proposal has been approved, rejected or is still pending. It lets the agent safely resume development after a delayed review.

**Input parameters**

| Parameter | Required? | What it means and when to use it |
|---|---|---|
| `project_id` | Yes | Identifies the project containing the proposal. |
| `decision_id` | Yes | Identifies the proposal to check, e.g. `DEC-004`. The agent receives it from `propose_decision`, or discovers it through `get_decisions` if the earlier session is lost. |

Both parameters are mandatory. The agent gets the decision ID from `propose_decision`, or finds it using `get_decisions` if the previous session is lost.

**When does the agent use it?**

Suppose Rahul chooses to review DEC-004 later and goes on a break. Codex ends its current task. Rahul later approves the proposal in the ProjectOS dashboard and returns to Codex:

> I have reviewed the proposal. Continue implementing the approved approach.

Codex verifies the saved status instead of relying on the chat message alone:

```json
{
  "project_id": "teamflow",
  "decision_id": "DEC-004"
}
```

**What does ProjectOS do internally?**

1. The MCP server requests the decision's current state from Express.
2. Express validates the project and decision ID, checks access and reads SQLite.
3. Returns the latest persisted review status, version and available review details to Codex.

**What does the agent receive?**

| Status | Agent's next step |
|---|---|
| `approved` | Continue with the exact approved version, refreshing context if necessary. |
| `pending` | Stop and tell the developer that review is still needed. |
| `rejected` | Do not implement the rejected proposal; revise or abandon it. |
| `superseded` | Retrieve the current decision rather than relying on the old one. |

The response includes the proposal ID, current version and review timestamp or feedback where available.

**Who does what?**

| Component | Responsibility |
|---|---|
| Developer | Returns when ready and asks Codex to resume. |
| Codex | Identifies the proposal and checks its status once. |
| MCP server | Carries the status request and result. |
| Express + SQLite | Return the authoritative stored review state. |

**Important distinction:** No continuous polling. In the later phase, if elicitation approved the proposal immediately and `propose_decision` already returned the persisted outcome, this call is normally unnecessary. An idle agent does not need to stay active while a proposal is pending.

**In simple words:** Has the human approved the architectural change I was waiting for?

#### 6. `link_commit_to_decision`

`link_commit_to_decision` connects **an existing real Git commit to the approved architectural decision it implements**. This is how AI Git records the link between code changes and their reasoning.

**Input parameters**

| Parameter | Required? | What it means and when to use it |
|---|---|---|
| `project_id` | Yes | Identifies the project and registered Git repository. |
| `commit_hash` | Yes | Identifies an actual commit. Use its full hash for storage; the local Git CLI resolves and verifies it. |
| `decision_id` | Yes | Identifies the approved decision the commit implements. The agent obtains it from a proposal result or decision retrieval. |
| `file_associations` | No | Explicitly identifies which changed files relate to this particular decision when a commit contains several kinds of changes. Omit if only a commit-level link is known. |

**When does the agent use it?**

Rahul approves DEC-004, Codex implements the manager-approved reassignment feature, and Rahul reviews and tests the changes. A normal Git commit is then created through the team's usual Git workflow.

Codex knows the approved decision ID from the proposal result and can obtain the actual commit hash using Git. It calls:

```json
{
  "project_id": "teamflow",
  "commit_hash": "<full hash of the actual local Git commit>",
  "decision_id": "DEC-004"
}
```

The placeholder above represents a real hash that must be obtained from the repository. If a commit contains work for several decisions, optional `file_associations` can identify the changed files explicitly associated with this particular decision. If only a commit-level link is known, omit it.

**What does ProjectOS do internally?**

1. The local MCP server uses Git CLI to resolve the commit hash and retrieve actual commit metadata and changed paths.
2. It sends the association and captured Git evidence to Express.
3. Express checks project access, verifies that the linked decision is approved for that project and validates the captured evidence structure.
4. Saves the decision-to-commit association and recorded Git evidence in SQLite. Repeated identical links do not create duplicates.

**What does the agent receive?**

| Field | Example result |
|---|---|
| Commit | Real full hash (short form `a7c92f1` for display). |
| Linked decision | DEC-004 and its approved version. |
| Changed files | Actual Git paths, e.g. `taskAssignmentService.ts`, `managerApproval.ts`, `leaveStatus.ts`. |
| Association | Commit linked successfully; explicit file-level links only if supplied and validated. |

If the commit does not exist or the decision is not approved for the project, the tool returns an error. If no architectural decision applies, the commit remains unlinked.

**Who does what?**

| Component | Responsibility |
|---|---|
| Developer / coding agent | Creates the normal commit and identifies the decision it implements. |
| Local MCP server + Git CLI | Resolves the commit and captures actual Git evidence. |
| Express + Zod | Validates the decision, project and association. |
| SQLite | Stores commit links and captured metadata. |
| AI Git dashboard | Displays the recorded association and changed files. |

**Important distinction:** This tool does not create commits, branches or pushes. A cloud backend cannot independently verify an unpushed commit; its evidence comes from the authorized local component. A commit can relate to multiple decisions, and one decision can have multiple commits. A commit-level link does not prove that every changed file implements the decision.

**In simple words:** This commit was made to implement that approved decision. Record the connection so it can be retrieved later.

#### 7. `get_git_traceability`

`get_git_traceability` is a **read-only MCP tool** that retrieves recorded connections between Git changes and approved architectural decisions. It helps an agent understand why code was changed, or find which commits implement a particular decision.

**Input parameters**

| Parameter | Required? | What it means and when to use it |
|---|---|---|
| `project_id` | Yes | Identifies the project and its stored Git associations. |
| `decision_id` | One selector required | Retrieves commits linked to a known decision. Useful when checking whether a decision has recorded implementation commits. |
| `commit_hash` | One selector required | Retrieves decisions and rationale linked to a particular Git commit. The hash may come from Git history or an earlier traceability result. |
| `file_path` | One selector required | Retrieves recorded commit/decision history for a repository-relative file. Useful when asking why a particular file changed. |

`project_id` is mandatory, along with one of the three selectors: `decision_id`, `commit_hash` or `file_path`. The agent chooses the selector based on what it already knows and what it wants to find.

**When does the agent use it?**

Ananya joins TeamFlow later and asks Codex:

> Why does task reassignment require manager approval?

Codex can look up the known file without already knowing which decision or commit is involved:

```json
{
  "project_id": "teamflow",
  "file_path": "src/services/taskAssignmentService.ts"
}
```

Two other useful requests are:

- Find the actual commits associated with DEC-004:

  ```json
  {"project_id": "teamflow", "decision_id": "DEC-004"}
  ```

- Find the decisions associated with a known commit:

  ```json
  {"project_id": "teamflow", "commit_hash": "<full hash of the actual commit>"}
  ```

**What does ProjectOS do internally?**

1. The MCP server validates the lookup and requests matching associations from Express.
2. Express checks project access and queries SQLite for the stored Git links and decision records.
3. If the relevant commit is available in the local clone, Git CLI can retrieve additional live Git evidence.
4. Returns the recorded associations, decision reasoning and available history to Codex. Missing local evidence or unlinked changes are identified explicitly.

**What does the agent receive?**

| Field | Example result |
|---|---|
| File | `src/services/taskAssignmentService.ts` |
| Associated commit | Recorded Git hash, e.g. short display form `a7c92f1`. |
| Decision | DEC-004 — Leave-related task reassignment. |
| Recorded rationale | Reduce manual coordination while preserving managerial accountability. |
| Evidence | Actual recorded changed paths and any explicit file-level associations. |

Codex can now explain the original reason for the manager-approval rule using stored records, not guesses about an earlier conversation.

**Who does what?**

| Component | Responsibility |
|---|---|
| Codex | Chooses the lookup selector and explains the returned records. |
| MCP server | Requests traceability data and obtains available local Git evidence. |
| Express + SQLite | Retrieve stored associations and decision rationale. |
| Git CLI | Provides additional actual commit information when available locally. |
| React AI Git timeline | Lets humans browse the same recorded information through REST without MCP. |

**Important distinction:** AI Git retrieves recorded reasons; it does not invent the reason for an unlinked historical commit. A file may have many changes related to different decisions. A commit-level association is not a proven file-level reason unless that more precise link was recorded.

**In simple words:** Which changes implemented this decision, or which recorded decision explains this Git change?

**Human approval workflow**

- **P0 — primary dashboard approval:** `propose_decision` saves a pending proposal and returns its ID, version and review location. The authorized human approves or rejects in the dashboard. This path must work end to end before adding elicitation.
- **P0 — resume:** When the developer asks the agent to continue, `get_decision_status` checks the persisted result. No continuous polling or automatic resumption of an idle agent is required.
- **P1 — MCP Elicitation:** After the full local core is verified, extend `propose_decision` to request human input inside the coding client. A trusted, authorized approval is saved through the same backend review service before the tool returns `approved`. If elicitation is unsupported, interrupted, deferred or untrusted, keep the proposal pending and use the dashboard fallback.

Only an authorized human can approve or reject an architectural proposal. The agent cannot authorize it through tool arguments.

### MCP protocol operations

MCP is the communication standard; the seven tools above are ProjectOS business operations. The agent's MCP client discovers them and calls them, and, in the later phase, the server can request human input during an interactive proposal. The exact elicitation exchange depends on the negotiated SDK/protocol revision.

| Protocol operation            | Easy description | When used |
| ----------------------------- | --- | --- |
| `tools/list`                  | Discover named tools and their input schemas. | When the agent connects or refreshes its tool list. |
| `tools/call`                  | Invoke one ProjectOS tool with structured arguments. | Whenever the agent retrieves context, analyzes impact, proposes a decision or uses Git traceability. |
| `elicitation/create`          | Server requests human input through a supporting MCP client (server-request protocol form). | Later-phase proposal review only; newer protocol/SDK variants may use a structured input-required exchange and retry instead. |

Connection setup discovers supported capabilities and negotiates the protocol. Elicitation is a protocol-level human-input exchange, not an agent-callable ProjectOS tool.

The client, rather than the model, presents the review and returns the response. The local server uses the negotiated SDK mechanism.

The proposal is saved before requesting input; retries reuse the same pending proposal instead of creating duplicates. See [MCP TypeScript SDK — Elicitation](https://ts.sdk.modelcontextprotocol.io/v2/servers/elicitation) and [OpenAI — Building MCP servers for plugins](https://developers.openai.com/plugins/build/mcp-server).

Operations outside MCP include project registration, normal IDE editing and testing, normal Git commit creation, and browsing or approving through the dashboard (primary in P0, fallback in P1). Those operations use the appropriate local tooling or REST endpoints.

ProjectOS does not require resources, prompts, sampling, a separate model API or a custom IDE extension for the core workflow.

## Complete user flow

### Technology stack

| Layer | Technology | Role in ProjectOS |
|---|---|---|
| Frontend | React.js, TypeScript, Vite, React Flow | Reusable decision and Git views, typed UI data, static frontend builds and interactive impact graphs |
| Backend | Node.js, Express 5, TypeScript, Zod | REST endpoints, business logic, input validation, access control and human approval state transitions |
| Database | SQLite | Persistent project decisions, rationale, impact reports, approval history and Git associations without a separate database server |
| AI / LLM | Agent-agnostic LLM reasoning (Codex for the initial demo) | Connected coding agent interprets requests and reasons about evidence; ProjectOS does not host a separate model |
| MCP integration | MCP, official TypeScript MCP SDK | Expose the three core features as callable tools for compatible agents |
| Code intelligence | ts-morph, Git CLI | Local JS/TS dependency tracing and inspection of actual Git commits and changed files |
| Cloud | AWS EC2, Amazon EBS (planned deployment) | Host the shared application and preserve SQLite data on persistent storage |
| APIs and security | REST over HTTPS, Express Sessions | Connect local MCP server and dashboard to the backend; maintain human login sessions and protect approval operations |

### Who does what?

The architecture has four connected layers: developer and external coding agent; local MCP server and repository tools; Express backend and SQLite; React web dashboard.

| Component | Role | Data it handles |
|---|---|---|
| Developer / authorized human reviewer | Describes the desired change, reviews evidence, approves or rejects architectural decisions in the dashboard first, later optionally in Codex, reviews and tests code, and commits it | User requests, decision rationale, approval actions, code review |
| External AI coding agent (Codex initially; MCP host/client) | Interprets natural-language requests, finds candidate starting files, calls ProjectOS tools, reasons about results, implements the reviewed plan | User prompt, relevant source snippets, tool inputs and results, proposed edits |
| Local ProjectOS MCP server (TypeScript MCP SDK) | Exposes ProjectOS operations as callable tools; validates requests, runs local repository operations or requests backend records via REST, later initiates supported human elicitation, and returns structured results | Project ID, tool arguments, decision IDs, report IDs, commit hashes, errors |
| Project Brain (Express backend + SQLite) | Owns authoritative, human-approved decisions, pending proposals, rejected and superseded history, and links to relevant code | Decision text, rationale, status, relationships, reviewer and timestamps |
| Change Impact Intelligence (local ts-morph + Express backend) | Traces dependencies from actual local source and retrieves relevant decisions through REST; persists reports through the backend | Starting files, import/reference paths, source lines, repository revision, related decision IDs, separately labelled predictions |
| AI Git (local Git CLI + Express backend) | Reads real Git history locally and persists explicit commit-to-decision associations through REST | Full commit hashes, changed paths, commit metadata, decision IDs |
| React / TypeScript dashboard (Vite + React Flow) | Human-facing Project Brain view and primary approval controls (later also fallback), interactive impact graph and AI Git timeline | Displays records from the same application state used by MCP tools; sends human approval/rejection actions to backend |
| Node.js / Express 5 backend, Zod, Express Sessions, SQLite | Validates REST requests, authenticates and authorizes users, owns shared records and state transitions, and serves both dashboard and MCP server | Projects, decisions, code associations, reports, approvals, commit links |
| Local repository and Git | Source of actual code relationships and Git history | Source files, imports, working-tree state, commit objects and diffs |

### Communication and deployment boundaries

- **Developer → coding agent → local MCP server:** the developer uses the agent in the IDE or CLI. The agent discovers and calls tools using MCP and the official TypeScript SDK.

  For new or changed decisions, the server requests human review through the client when supported and trusted. Codex is the initial demonstration client, not a required model provider for the product.
- **Local MCP server → local repository:** `ts-morph` resolves supported JS/TS source relationships; Git CLI reads commit history and diffs. Both operate on the developer's registered repository, not on AWS. They are independent tools, not a pipeline in which Git must invoke ts-morph.
- **Local MCP server ↔ Express backend:** REST requests retrieve decisions and store impact reports, proposals and verified Git associations. The MCP server sends structured records and limited evidence, not the whole repository.

  Express 5 uses Zod to validate request data and owns SQLite access; the local MCP process does not open the remote SQLite file.
- **React dashboard ↔ Express backend:** REST retrieves the same stored records used by MCP tools and submits authenticated human decisions when dashboard review is used. Vite builds the frontend; React Flow renders the dependency graph returned by the backend, rather than analyzing source code itself.

  Project Brain, impact graph and AI Git timeline are separate dashboard views, not successive service dependencies.
- **Security:** Express Sessions maintains browser login state. Express verifies authenticated human identity, project access and reviewer permission on every dashboard review.

  Zod validates structure, not identity. Later-phase elicitation uses an interactive, human-reviewed client configuration and an explicit form response; the backend must trust the review channel and bind it to the authorized reviewer, proposal ID and exact version.

  The agent-facing REST credentials must not grant arbitrary approval privileges. A local elicitation response is not cryptographic proof of identity, and an agent with unrestricted local access could bypass weak local controls.

  For the later elicitation phase, use a controlled local client and document that trust boundary; for shared AWS state, permit elicitation-based approval only with a trusted, authorized review binding, otherwise route to authenticated dashboard approval. Define the agent credential mechanism for P0 and the trusted reviewer-binding mechanism in the later phase.

  Protect browser sessions with secure cookies and CSRF protection, and use HTTPS for networked REST traffic.
- **Local checkpoint:** run the backend, SQLite, dashboard and MCP server locally. Local REST may use loopback HTTP during development. The November 26–27 checkpoint only needs a basic working slice of the complete workflow.
- **Planned AWS deployment:** run the Express application and serve the React build on AWS EC2, with SQLite on mounted persistent Amazon EBS storage. The dashboard and local MCP server use the hosted HTTPS REST API.

  Each developer still runs their MCP server, ts-morph and Git CLI locally. They bind their own clone to the same authorized project ID.

  EC2 cannot directly read laptop files. The final December 1–2 hackathon targets the integrated features and planned cloud deployment; deployment, HTTPS setup, session persistence and authentication must still be implemented and tested.

### 01 — Setup and retrieve: start a project and establish its memory

**Step 1 — Start or connect the software project.**

Rahul creates TeamFlow or opens an existing TeamFlow repository in his IDE. He opens ProjectOS and registers the local project folder.

The setup process uses a local setup action to check that the folder exists and is a Git repository, then registers a stable project ID such as `teamflow` through Express. The local MCP component stores the machine-specific folder binding.

The setup UI or CLI mechanism is an open implementation detail; a hosted browser alone cannot grant the cloud backend direct filesystem access. A GitHub account is not required for local Git support.

The local MCP component uses ts-morph to scan during setup or on the first analysis request. It examines supported JavaScript/TypeScript files and imports.

It does not read the entire codebase into an AI model simply to build file relationships. The scan should exclude irrelevant generated/dependency directories and respect the registered repository boundary.

**MCP call:** None is required for dashboard-based project registration or the initial scan. These are normal application operations. The local repository binding must exist before tools can operate on it.

**Data:** Project ID, project name, local repository location and supported file types. The scanner creates file/reference relationships. A local path is machine-specific, not the shared identity of the project; if teammates use separate clones, they map their own path to the same shared project ID.

**Step 2 — Connect the AI coding agent.**

Rahul configures Codex to use the local ProjectOS MCP server. Codex connects to the official TypeScript SDK-based server using its MCP client, discovers the available tools and learns their input requirements. The initial connection does not require elicitation support; negotiate it when adding the later phase.

For the demo, prefer an interactive Codex configuration that requires human review rather than an automatic reviewer. Verify human review behavior in the installed client during integration.

At this point Codex can call ProjectOS, but it has not yet automatically retrieved every decision or analyzed every feature.

**MCP call:** Connection/capability discovery and `tools/list`.

**Data:** Server/client capabilities, tool names, descriptions and input schemas. No architectural decision is approved during tool discovery.

**Step 3 — Establish Project Brain.**

Rahul records the important decisions that the team wants future development to respect. These can be entered through the dashboard or drafted by Codex using `propose_decision`. Either way, a human must approve a decision before it becomes authoritative. ProjectOS must not infer decisions from code and silently approve them.

For TeamFlow, the team records DEC-001, DEC-002 and DEC-003, as described at the start of this document.

The team explicitly associates relevant repository-relative paths or symbols with decisions. The mapping can initially be provided by the human or suggested by Codex for review. A decision record is not automatically a complete map of every file that implements it.

**MCP call:** `propose_decision` if Codex submits a proposal. The local MCP server persists it as pending and returns the dashboard review location (Steps 10–12 describe this in detail).

The developer reviews in the dashboard and `get_decision_status` verifies the outcome when the developer resumes. Later, trusted immediate elicitation can return the final status directly.

No MCP call is required if a human creates and approves the decision directly in the dashboard. Express validates the review channel, reviewer permission and proposal version before recording an approval in SQLite.

**Data:** Stable decision ID, title, decision statement, rationale, status (`pending`, `approved`, `rejected` or `superseded`), code associations, related decisions, timestamps, and reviewer information where available. An empty Project Brain is a valid initial state; agents must be told that no approved context exists rather than inventing it.

**Step 4 — Start a coding session.**

Rahul opens TeamFlow in Codex and asks the agent to consult ProjectOS before making significant architectural changes. The agent retrieves the currently approved decisions.

**MCP call:** `get_decisions({project_id: "teamflow"})`.

The local MCP tool calls the Express REST API, which reads SQLite and returns the project-scoped context.

**Returned data:** The active decisions DEC-001, DEC-002 and DEC-003 with their reasons and relevant code associations. Pending/rejected/superseded decisions are not presented as active rules. Their history is available through the same `get_decisions` tool using an explicit ID, status or history filter.

Now Codex has project-specific context without needing Rahul's earlier chat history. The agent must be configured or instructed to consult the tools; MCP alone does not guarantee it will do so for every edit.

### 02 — Analyze: understand a proposed feature before writing code

**Step 5 — The developer requests a feature.**

Rahul tells Codex:

> Add a feature that automatically reassigns unfinished tasks when an employee goes on leave. Before editing, use ProjectOS to check what this might affect.

Codex interprets the request and identifies relevant existing concepts such as task assignment, employee availability and manager permissions. This is where AI reasoning is required: an ordinary code scanner cannot independently understand an arbitrary new feature described in natural language.

Codex may retrieve focused context with `get_decisions` again, then use its normal repository-reading capabilities to identify starting files such as `src/services/taskAssignmentService.ts`. If no reliable starting point exists, it should request more context or report uncertainty rather than manufacture one.

**MCP call:** `get_decisions` if refreshed or scoped context is needed; the agent's own initial file search is not a ProjectOS MCP call.

**Data:** Natural-language change request, relevant decision context, candidate starting files and symbols. A candidate is a hypothesis selected by the agent, not a verified required modification.

**Step 6 — Invoke Change Impact Intelligence.**

Codex sends the proposed change and starting files to ProjectOS. The tool validates that those paths belong to the registered repository and analyzes the actual source.

**MCP call:** `analyze_change`.

Example logical arguments (illustrative, not final JSON Schema):

```json
{
  "project_id": "teamflow",
  "change_description": "Automatically reassign unfinished tasks when an employee becomes unavailable",
  "starting_files": ["src/services/taskAssignmentService.ts"]
}
```

This is transmitted in a standard `tools/call` request with `name: "analyze_change"` and the arguments above. ProjectOS does not send the user prompt to a separate paid model API.

**Step 7 — ProjectOS traces real code relationships.**

The dependency analyzer uses `ts-morph` to examine JavaScript/TypeScript import/export relationships and supported source references. For example, the repository could contain these connections:

| Existing file | Relationship discovered from source | What this tells us |
|---|---|---|
| `taskAssignmentService.ts` | Agent-selected starting file, verified to exist | Contains the relevant task assignment logic if source inspection supports that conclusion |
| `taskRoutes.ts` | Imports functions from `taskAssignmentService.ts` | Direct consumer to review |
| `bulkTaskService.ts` | Imports assignment functionality | Another direct consumer to review |
| `projectOperations.ts` | Imports `bulkTaskService.ts` | Indirect consumer, two dependency steps away |

The engine starts at the identified file and follows reverse dependency edges to its consumers. For the MVP, a proposed traversal bound is two dependency hops.

Each discovered edge should have its source file, target file, import/reference location and a short matching source snippet. The scanner should track visited nodes to avoid cycles, and report unresolved imports or unsupported languages rather than quietly presenting a complete-looking result.

The local MCP server sends the relevant repository-relative paths to the Express REST API to look up active decisions in SQLite. ProjectOS then checks which active decisions are associated with the starting files and discovered code.

In this example it retrieves DEC-001 because the task assignment service is linked to that decision. It can also surface DEC-002 and DEC-003 if the related paths or other supplied context lead to those records.

It must not claim to discover a decision relationship without a mapping or an appropriately labelled inference.

**MCP call:** This entire operation runs inside the existing `analyze_change` tool call. The internal scanner, graph traversal and decision lookup are ordinary programming operations, not additional agent calls.

**Data:** Repository-relative paths, source positions, code snippets, dependency chains, decision IDs, current repository revision and whether uncommitted changes were present. Ideally the report records a snapshot identifier or equivalent so users can tell which state of the repository the evidence describes.

**Step 8 — Return and interpret the impact report.**

The local MCP server sends structured evidence and related decision IDs to Express over REST. Express validates and saves the report to SQLite, returns its report ID, and the MCP server returns structured findings to Codex.

A simplified example is shown below; the real tool must obtain its paths and source lines from the actual repository.

```json
{
  "report_id": "IMP-001",
  "project_id": "teamflow",
  "starting_files": ["src/services/taskAssignmentService.ts"],
  "verified_relationships": [
    {
      "file": "src/routes/taskRoutes.ts",
      "type": "direct_dependent",
      "depends_on": "src/services/taskAssignmentService.ts",
      "evidence_id": "E-001"
    },
    {
      "file": "src/services/bulkTaskService.ts",
      "type": "direct_dependent",
      "depends_on": "src/services/taskAssignmentService.ts",
      "evidence_id": "E-002"
    },
    {
      "file": "src/services/projectOperations.ts",
      "type": "indirect_dependent",
      "chain": ["projectOperations.ts", "bulkTaskService.ts", "taskAssignmentService.ts"],
      "evidence_ids": ["E-003", "E-002"]
    }
  ],
  "related_decisions": ["DEC-001"],
  "limitations": ["Static dependency tracing does not establish all runtime behavior or required edits"]
}
```

Each evidence ID in a real report would resolve to the captured code location/snippet and dependency relationship. It is not a confidence score. The full report also records repository state, scan scope and unresolved relationships.

Codex interprets the report. It notices that the proposed fully automatic reassignment might contradict DEC-001, which requires manager authorization. It may also predict a need for a leave-status interface, notifications and a manager approval screen. These are semantic judgments, not facts established by the import graph.

To display these judgments in the dashboard, Codex sends them back using `record_impact_assessment` with the report ID and supporting evidence/decision IDs. ProjectOS verifies referenced IDs and labels the submitted text as **AI prediction / potential conflict**, rather than upgrading it to a verified finding.

**MCP calls:** Result of `analyze_change`; optional `get_decisions` with a decision ID for more rationale; `record_impact_assessment` to persist agent interpretation when predictions are shown in the dashboard. The ProjectOS server does not call a separate LLM API. Codex's own reasoning and processing of tool results consume its applicable usage allowance.

The React dashboard retrieves the saved report through REST and uses React Flow to display file nodes and dependency edges. Clicking a node or edge shows its recorded source evidence, dependency chain and related decisions.

Predictions appear separately from verified relationships; agent-selected starting files are distinguished from discovered dependencies. The developer can review the compact findings directly in Codex and optionally open the ProjectOS dashboard for the interactive graph and full evidence.

The dashboard is not a mandatory stop for every request. It distinguishes verified code relationships, inferred consequences, relevant approved decisions and known limitations.

A file's dependency relationship does not prove that file needs editing or that it will break. The report is guidance before implementation, not a guarantee of completeness.

### 03 — Decide: human review and architectural approval

**Step 9 — Review the proposed plan.**

Rahul reviews the report in Codex (or optionally in the dashboard) and sees that fully automatic task reassignment may contradict DEC-001. The human decides whether the plan can proceed without changing existing architectural decisions, whether a new/replacement decision is necessary, or whether the plan needs redesign.

**MCP call:** None for reading the agent’s existing report or deciding which plan to pursue. Codex may use `get_decisions` to provide more context. Actual approval of a new architectural decision occurs in the next steps, using the dashboard first; server-requested human input is a later addition.

There are three possible paths, all of which matter:

- **No decision change:** The reviewed plan respects the existing architecture and no new decision needs recording. Continue to implementation using applicable approved decisions. It is not a way to bypass an actual architectural change.
- **New or changed decision:** Submit a pending proposal and obtain explicit human approval before proceeding with the architectural change.
- **Redesign or abandon:** Keep existing approved decisions. Revise the feature and return to Step 5/6 for another analysis, or stop the request altogether.

For the example, Rahul changes the plan: instead of reassigning tasks automatically, TeamFlow should suggest possible reassignments and notify the manager, who can then approve them. Codex can re-analyze the revised proposal so its report reflects the new plan. The existing manager-authorization rule remains intact.

**Step 10 — Propose a new decision if needed.**

The team wants this new leave-related design to become a durable architectural decision for future agents. Codex submits it as a pending proposal.

**MCP call:** `propose_decision`.

```json
{
  "project_id": "teamflow",
  "title": "Leave-related task reassignment",
  "decision": "Suggest reassignment options when an employee is unavailable; a manager must authorize any ownership change.",
  "rationale": "Reduce manual coordination while preserving managerial accountability.",
  "related_decision_ids": ["DEC-001"],
  "related_paths": ["src/services/taskAssignmentService.ts"],
  "impact_report_id": "IMP-002"
}
```

The MCP server sends the proposal to Express via REST. Express validates it with Zod and stores `DEC-004` with status `pending` in SQLite, then returns its ID and version.

`IMP-002` represents the revised impact report. The agent cannot approve a proposal by adding an approval field to its tool arguments.

The backend does not accept that action.

The server also records a stable proposal/request identity so retries or reconnections cannot silently create duplicate proposals. This new decision extends DEC-001, so it does not supersede it.

If the team instead chose to replace the manager-only rule, the proposal would explicitly name the earlier decision. That original decision remains active until a replacement is approved.

**Step 11 — The human reviews the proposal in the ProjectOS dashboard.**

In the initial implementation, `propose_decision` returns `DEC-004`, its version, `status: pending` and the dashboard review location. Codex stops work on the pending architectural change. Rahul can close Codex or go on a break.

Rahul opens the dashboard, reviews the exact decision, rationale, related DEC-001 and impact report IMP-002, and explicitly approves or rejects it. React sends the action through REST using his authorized human session. No MCP call needs to remain open.

**Data/state transition:** Express checks the project, reviewer authorization, exact pending version and permitted state transition. A reusable backend review service records the reviewer, channel and timestamp; for an approved replacement it atomically supersedes the predecessor. Rejection preserves existing active decisions. Abandoning the review leaves it pending. Stale or repeated responses cannot override an already resolved decision.

**Step 12 — Resume after dashboard review.**

After reviewing DEC-004, Rahul asks Codex to continue. The agent checks the authoritative persisted result before implementing the proposed architectural change.

**MCP call on resumption:** When Rahul returns to Codex and asks it to continue, the agent invokes `get_decision_status({project_id: "teamflow", decision_id: "DEC-004"})`. The ID came from the original proposal result; after a lost session/result, `get_decisions` filtered by pending/recent decisions or the dashboard can help identify the right proposal.

The tool reads fresh status through Express. If approved, proceed with the reviewed version; if pending, stop and report that approval is still needed; if rejected, revise or abandon.

Use `get_decisions` to refresh architectural context if needed.

There is no continuous polling, no indefinite blocking request, and no assumption that the dashboard can automatically restart an idle external coding agent. A timeout or interruption cannot authorize a change.

ProjectOS manages the authoritative approval record, but it cannot forcibly prevent Codex from editing files outside the agreed workflow. Ordinary changes within the existing approved architecture do not require a new proposal or an extra human approval prompt.

**Later phase — MCP Elicitation (after the complete local core passes).**

Extend `propose_decision` without changing the seven-tool catalog or the authoritative SQLite review state. Persist the proposal before requesting input. The local MCP server negotiates client support and requests a structured human response (for example, `elicitation/create` or the supported input-required retry mechanism). This is a protocol interaction, not another agent-callable tool.

Present the exact decision ID/version, statement, rationale, related decisions and report reference. Require explicit approve, reject or review later, without a preselected approval. Optional feedback is allowed. Configure human review in Codex (for example, `approval_policy = "on-request"` and `approvals_reviewer = "user"` where supported), and verify actual client behavior. An empty confirmation or model-generated response cannot authorize a proposal.

A trusted reviewer-bound channel must submit the human response to the same Express review service used by the dashboard. Capability negotiation alone does not prove identity; verify the reviewer, exact proposal/version, expiry and replay protection. Do not give ordinary agent credentials review privileges. Do not hold a database transaction open while waiting for input.

- **Trusted immediate approval:** return the persisted `approved` status; Codex can continue without another status call.
- **Trusted explicit rejection:** return `rejected`; Codex revises or abandons the plan.
- **Unsupported, interrupted, timed out, deferred, automatic denial or untrusted response:** keep pending, return the dashboard review location and use the P0 workflow. A protocol decline is not necessarily an authorized rejection.

Test this later path independently after the local core is working. If a trusted reviewer binding cannot be established, leave elicitation disabled and retain dashboard approval.


### 04 — Record: implement, review, commit and preserve reasoning

**Step 13 — Implement the reviewed plan.**

After dashboard approval and status verification, Codex resumes the task. In the later elicitation phase, trusted immediate approval can allow Codex to continue the active task directly. The agent implements the manager-approved reassignment feature. Codex uses the approved context and impact findings to plan its edits. It might add employee availability handling, update task assignment functionality and create an approval interface.

**MCP call:** No call is required merely to write the code. Codex uses its ordinary editing capabilities. It can call `get_decisions` or `analyze_change` again if it discovers a new architectural question while implementing. The ProjectOS server does not itself implement the feature.

**Data:** Actual changes in the local working tree. They are not yet committed. The approved decision is a statement of intent, not proof that the implementation is correct or complete.

**Step 14 — Developer reviews and tests.**

Rahul inspects the code changes in his IDE and runs normal tests. For example, he checks that managers alone can authorize reassignment and that notifications are sent only after a successful update. He accepts or rejects edits using the normal development workflow.

**MCP call:** None required. ProjectOS is not an automated testing orchestrator or an automatic architectural violation detector. Post-edit scope auditing is outside the MVP. The user is responsible for accepting the implementation.

**Step 15 — Create a normal Git commit.**

After reviewing and testing, Rahul or the coding agent acting at his direction creates a Git commit, such as `feat: add manager-approved task reassignment`. The commit is a real Git object with a full hash. GitHub is optional; the commit can remain local.

**MCP call:** None to create the commit. ProjectOS does not automatically commit every edit, create experimental branches, or push to GitHub.

**Data:** Full commit hash, commit message, parent(s), changed paths and diff. A short hash such as `a7c92f1` can be displayed for readability; use the full hash internally.

**Step 16 — Explicitly link the commit to the decision.**

AI Git connects that existing commit to DEC-004. One proposed capture approach is for Codex, after the developer's reviewed commit, to call the linking tool with the commit hash and decision ID.

Another is for the developer to link the same records through the dashboard, provided the local component has supplied the required Git evidence; a cloud dashboard cannot inspect the local commit itself.

Commit metadata containing a decision ID is another possible linking mechanism. The capture mechanism is an open implementation detail.

**MCP call:** `link_commit_to_decision` for the agent-driven linking approach.

```json
{
  "project_id": "teamflow",
  "commit_hash": "<full hash of the actual local Git commit>",
  "decision_id": "DEC-004"
}
```

The local MCP server uses Git CLI to resolve the commit and obtain real changed paths and metadata from the registered repository. It sends the association and captured Git evidence to Express via REST.

Express verifies the decision is approved for the same project, validates the payload, and persists the association and evidence in SQLite. The cloud backend cannot independently resolve an unpushed local commit; the recorded evidence comes from the authenticated local component.

It should handle duplicate links without creating duplicate history. If the commit does not exist or the decision is not approved, return a clear error instead of fabricating a link.

In the no-new-decision branch, a relevant existing approved decision can be linked. If no decision applies, leave the commit unlinked.

A commit can relate to more than one decision, and a decision can have several commits. The data model should therefore support many-to-many links.

The MVP demonstration uses one clear decision-to-commit link. A commit-level association is not proof that every changed file or line implements every linked decision.

More precise per-file associations, if recorded, should be distinguished from the list of all files changed in the commit.

**Step 17 — Inspect the recorded reasoning.**

In the ProjectOS dashboard, Rahul opens AI Git and selects the actual commit. The React AI Git timeline retrieves stored associations and Git evidence through Express REST.

ProjectOS displays the linked decision, recorded rationale, approval information, actual changed files and any superseded history. Any additional live Git inspection requires the local MCP component.

Alternatively, selecting DEC-004 in Project Brain shows the associated commits.

**MCP call:** None when Rahul browses the dashboard; `get_git_traceability` when Codex requests the same information. `get_decisions` with the relevant ID and history filter may provide more detailed decision history.

The value is bidirectional traceability: **decision → commits** and **commit/file history → recorded decision**. ProjectOS retrieves recorded rationale rather than asking AI to guess the true reason behind an old code change.

A file history view can show multiple historical commits and decisions; there may be no single answer to why an entire file exists.

**Step 18 — A future coding session reuses the same knowledge.**

Ananya later opens TeamFlow on her own coding session (or another compatible MCP agent) and asks:

> Why does task reassignment require manager approval? Can I remove that step?

Ananya must connect to the same ProjectOS project state. A fresh local installation with a different empty database cannot magically retrieve Rahul's decisions; multi-device sharing uses the planned AWS EC2 backend with SQLite on EBS; each machine needs its own local repository binding and authorized access.

A second session on the same configured project can demonstrate the principle without cloud hosting.

**MCP calls:** `get_decisions` with a task-reassignment query (or an exact decision ID if already known), and `get_git_traceability` using DEC-004 or the relevant commit/file. If Ananya actually proposes removing the step, `analyze_change` begins the next pre-change analysis cycle.

The local MCP server retrieves the recorded decisions and stored commit evidence from Express through REST. Where a commit exists in the current local clone, Git CLI can retrieve additional live evidence; an unpushed commit may be absent from that clone.

The agent retrieves the recorded decisions and the available associated Git changes. It can explain that manager approval was deliberately introduced to preserve accountability, and that removing it may conflict with the current approved architecture.

It is not dependent on remembering Rahul's earlier conversation. If Ananya decides the policy should change, the same proposal, approval, implementation and recording workflow repeats.

## Implementation guardrails

SQLite stores the shared logical records below through the Express backend. The exact table definitions and migrations remain implementation decisions. Machine-specific repository paths stay in the local configuration.

| Record | Essential information | Owner / use |
|---|---|---|
| Project and local repository binding | Stable project ID; local path mapping; repository identity | Setup and MCP request scoping |
| Decision | Decision ID/version, statement, rationale, status, reviewer, review channel, reviewed version, timestamps, related paths and predecessor | Project Brain; only human approval changes authoritative state |
| Impact report | Report ID, change request, starting candidates, repository state, decision versions, evidence and limitations | Change Impact Intelligence; dashboard and agent |
| Dependency evidence | Source/target paths, relationship type, source position/snippet, chain and analysis scope | Repository analysis; supports verified relationships |
| AI assessment (if stored) | Report ID, candidate consequences, explanation, evidence/decision references and AI attribution | Codex interpretation, separate from verified evidence |
| Commit association | Project ID, full Git commit hash, decision ID/version, link origin, timestamps, optional precise file associations | AI Git; bidirectional history |

All tools should validate project identity, repository boundaries and referenced records. Reads must not silently mutate approval state.

Write tools must not accept arbitrary filesystem paths or unrestricted shell commands; Git operations use controlled arguments. An impact report is a snapshot, not a permanent statement about the latest repository.

If files or decisions change materially, generate a new report or clearly mark the earlier result as stale. Avoid sending secrets or entire repositories in MCP results; return focused evidence.

Express must enforce authentication and project authorization in both deployments. Express Sessions protects human dashboard operations; the agent-facing REST credential mechanism remains unresolved for P0, and trusted elicitation-to-reviewer binding remains unresolved for the later phase.

The backend must authorize every review and enforce version-aware, idempotent state transitions. Elicitation responses from unsupported, automatic or untrusted review channels must not authorize a decision.

Pending proposals survive disconnects and timeouts. AWS stores captured commit metadata and links, not a complete copy of local Git history.

A commit unavailable in the current clone can still have stored traceability evidence, but its live diff may not be available. These details must be tested during implementation.

The engine's JS/TS import/reference analysis uses ordinary code rather than AI tokens. Codex supplies the natural-language interpretation, starting-file hypotheses and possible semantic consequences.

The coding agent’s usage allowance applies to reasoning and processing MCP results. Actual usage capacity and performance must be checked on the accounts used for development and the demo.

Other repository languages can use language-independent Project Brain and Git functions and basic search where implemented, but advanced dependency tracing is initially limited to JavaScript/TypeScript. Static analysis cannot guarantee runtime impact coverage, particularly across dynamic imports, external services or data flows not visible in the supported analysis.

For the basic prototype, prove a small real slice of this workflow.

For the final demo, prove that the three features share real state: an agent retrieves an approved decision through MCP, gets a dynamically generated dependency report with source evidence, submits a pending proposal, a human approves it through the authenticated dashboard and the resumed agent verifies the approved state, a normal Git commit is explicitly linked, and a fresh session retrieves the rationale.

Also demonstrate that leaving a proposal unreviewed keeps it pending and that `get_decision_status` resumes the dashboard workflow without polling. After the core local demo passes, verify trusted elicitation and dashboard fallback separately, including cancellation and timeout handling. Elicitation is not required to pass the core local demo. Demonstrate the no-decision-change or rejection path as appropriate.

Any mocked or incomplete functionality must be identified as such.

Capabilities outside the MVP: Proof Engine, cross-agent conflict detection, decision comparison, automated testing orchestration, automatic architectural-violation detection, experimental Git branch creation, running/comparing experimental architectures, universal model/token optimization, Intent Drift Detector, Assumption Radar, MCP Tool Trust Sentinel, MCP RetryShield and MCP Value Meter.

Pre-change guidance about potential decision conflicts does not enforce policies on subsequent code edits.
