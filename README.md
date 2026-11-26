# ProjectOS

**Architectural decision memory, repository-backed change-impact analysis, and Git commit provenance for MCP-compatible AI coding agents.**

[What Is ProjectOS?](#what-is-projectos) · [The Problem](#the-problem-projectos-solves) · [Why It Matters](#why-this-matters-in-ai-assisted-development) · [Core Features](#the-three-core-features) · [System Architecture](#system-architecture--boundaries) · [Operational Workflow](#end-to-end-operational-workflow) · [Feature Deep Dives](#deep-dive-how-each-core-feature-works) · [Human Governance](#human-approval--governance) · [7 MCP Tools](#the-seven-mcp-tools) · [TeamFlow Example](#end-to-end-example-the-teamflow-scenario) · [Deployment](#deployment-architecture) · [Roadmap & Status](#mvp-scope-roadmap--current-status)

---

## What Is ProjectOS?

**ProjectOS** is an MCP-centric software engineering platform that connects AI coding agents—starting with **Codex** alongside compatible clients such as Claude Code and Antigravity—with a project's human-approved architectural decisions, real source-code dependency relationships, and Git commit provenance.

When a developer works with an AI coding agent in an IDE or CLI, the agent can inspect files in the repository, but source code alone rarely explains *why* the system was designed a certain way. If you are unfamiliar with the **Model Context Protocol (MCP)**, it is an open communication standard that lets an AI coding agent discover and invoke external tools using structured JSON inputs and outputs.

ProjectOS does **not** replace the developer's coding agent, host a separate Large Language Model (LLM), or wrap Git in automatic commits. Instead, it runs a local **ProjectOS MCP Server** next to the developer's repository and pairs it with a shared **Express.js 5 + SQLite** backend and a **React** governance dashboard:

```text
==============================================================================
         HIGH-LEVEL OVERVIEW: AGENT <-> PROJECTOS MCP HUB
==============================================================================

  +-----------------------+       MCP Protocol       +-----------------------+
  |   AI Coding Agent     | <======================> | ProjectOS MCP Server  |
  |  (Codex / IDE Client) |  7 Callable Business     | (Local TypeScript SDK)|
  +-----------------------+          Tools           +-----------+-----------+
                                                                 |
                 +-----------------------------------------------+
                 |
                 +---> [1] Project Brain             (Before coding: retrieve
                 |     Approved decisions & rationale  rules & propose changes)
                 |
                 +---> [2] Change Impact Intelligence (During planning: trace
                 |     ts-morph AST + AI predictions   dependencies & conflicts)
                 |
                 +---> [3] AI Git                    (After committing: link
                       Git CLI commit <-> decision     commits to rationale)
```

1. **Before writing code**, the coding agent retrieves active, human-approved architectural decisions and rationale from **Project Brain**.
2. **While planning a change**, **Change Impact Intelligence** uses `ts-morph` to trace actual JavaScript/TypeScript code dependencies (initially proposed up to two hops), surfaces affected decisions, and separates verified source evidence from AI predictions.
3. **When an architectural rule needs to change**, the agent submits a pending proposal that only an **authorized human** can approve or reject.
4. **After the developer commits code**, **AI Git** uses `Git CLI` to bind the real commit hash and changed file paths to the approved decision version so future sessions can recover *why* the change was made.

---

## The Problem ProjectOS Solves

When a developer works with an AI coding agent, the source tree shows *what* the code looks like today, not the engineering decisions that shaped it. Across multiple coding sessions, feature branches, or teammates, architectural knowledge breaks down at three distinct stages of the software development lifecycle:

```text
================================================================================
         PROBLEM LIFECYCLE IN AI-ASSISTED SOFTWARE DEVELOPMENT
================================================================================

  STAGE 1: BEFORE A CHANGE
  +--------------------------------------------------------------------------+
  | Root Cause  : Architectural Context Fragmentation                        |
  | Mechanism   : Approved rules, rejected designs, and constraints sit      |
  |               scattered across expired chats, PR threads, and memory.    |
  | Consequence : Inconsistent implementation; a fresh agent session can     |
  |               propose code that violates an active architectural rule.   |
  +------------------------------------+-------------------------------------+
                                       |
                                       v
  STAGE 2: DURING CHANGE PLANNING
  +--------------------------------------------------------------------------+
  | Root Cause  : Dependency Blind Spots & Unchecked Decision Conflicts      |
  | Mechanism   : Keyword search or prompt-only LLM guesses miss indirect    |
  |               module consumers and path-linked architectural decisions.  |
  | Consequence : Unexpected downstream breakage, hidden policy violations,  |
  |               and avoidable rework across dependent services.            |
  +------------------------------------+-------------------------------------+
                                       |
                                       v
  STAGE 3: AFTER A CHANGE
  +--------------------------------------------------------------------------+
  | Root Cause  : Commit-to-Decision Traceability Gaps                       |
  | Mechanism   : Git records commit SHAs, authors, and line diffs, but not  |
  |               the approved architectural decision behind the change.     |
  | Consequence : Loss of engineering reasoning; returning developers see    |
  |               WHAT lines changed, but cannot verify WHY the rule exists. |
  +--------------------------------------------------------------------------+
```

| Development Stage | What Breaks Down | What Happens in Practice |
| :--- | :--- | :--- |
| **1. Before a Change** *(Context Fragmentation)* | Architectural rules, rejected alternatives, and system constraints sit in old chat threads, PR comments, or a single developer's memory. | A fresh coding session—or a teammate opening the same repository—has no reliable way to retrieve active architectural rules before editing files. |
| **2. Change Planning** *(Impact Blind Spots)* | Keyword search and prompt-only LLM guesses cannot reliably trace transitive module imports or check how a change interacts with existing rules. | A feature that looks local silently touches downstream consumers two imports away or contradicts an approved architectural decision. |
| **3. After a Change** *(Traceability Gaps)* | `git log` and `git diff` preserve commit hashes, authors, and line changes, but not the structured architectural decision or human approval that authorized them. | Months later, engineers and coding agents can see *which* lines changed in a service, but cannot answer *why* that design rule exists or whether it is safe to remove. |

> *Note on product scope:* These user problems represent product hypotheses grounded in the team's engineering experience and design discussions rather than validated market research or measured productivity benchmarks.

---

## Why This Matters in AI-Assisted Development

Modern AI coding agents can generate and edit multi-file changes in seconds, which shifts the engineering bottleneck from **writing syntax** to **maintaining architectural coherence**:

* **Speed amplifies architectural drift:** When an agent can modify five modules in one turn, an unspotted conflict with a permission rule or transaction boundary creates immediate rework.
* **Agents need structured tools, not longer system prompts:** Stuffing every past decision into a static instruction file scales poorly and provides no workflow for proposing, reviewing, or superseding rules as the system evolves.
* **Guesses are not evidence:** Developers reviewing an AI-proposed refactor need to know which warnings come from actual static imports in the repository (`ts-morph`) and which warnings are semantic hypotheses from the model.
* **Accountability requires a human checkpoint:** Allowing an AI tool to edit local files is an editor permission; changing a project's architectural policy is an engineering governance decision that must remain under explicit human control.

---

## The Three Core Features

ProjectOS is built around three capabilities—**Project Brain**, **Change Impact Intelligence**, and **AI Git**—that read and write to **one authoritative decision store** in SQLite through the Express.js 5 backend.

Importantly, these three features are **not mandatory sequential service dependencies** where one service must always call the next in a rigid pipeline. Instead, each feature is an independent capability operating over shared project state, allowing the developer and coding agent to invoke whichever capability fits the current development task.

```text
================================================================================
       CONTINUOUS ARCHITECTURAL KNOWLEDGE & SHARED DECISION RECORDS
================================================================================

       +----------------------------------------------------------------+
       |          SHARED AUTHORITATIVE STATE (SQLite via Express)       |
       |    Canonical Decision Records: decision_id, version, title,    |
       |    decision, rationale, status, related_paths, predecessor     |
       +----------+--------------------+---------------------+----------+
                  ^                    ^                     ^
                  |                    |                     |
      Reads &     |        Reads path- |         Links real  |
      proposes    |        linked      |         Git commits |
      decisions   |        decisions   |         & queries   |
                  |                    |         provenance  |
                  v                    v                     v
  +---------------+----+   +-----------+--------+   +--------+-----------+
  |   PROJECT BRAIN    |   |   CHANGE IMPACT    |   |       AI GIT       |
  |  (Architectural    |   |   INTELLIGENCE     |   |   (Commit-to-      |
  |   Memory & Rules)  |   | (Repo Blast Radius)|   |    Decision Links) |
  +--------------------+   +--------------------+   +--------------------+
  | - Stores approved  |   | - Traces 2-hop     |   | - Resolves real    |
  |   decisions &      |   |   JS/TS AST via    |   |   commit SHAs &    |
  |   rationale        |   |   ts-morph         |   |   paths via Git CLI|
  | - Enforces human-  |   | - Separates        |   | - Bidirectional    |
  |   only approval    |   |   verified edges   |   |   lookup: decision,|
  | - Atomic version   |   |   from labelled    |   |   commit, or file  |
  |   supersession     |   |   AI predictions   |   | - Preserves old    |
  |                    |   |                    |   |   commit rationale |
  +---------+----------+   +---------+----------+   +---------+----------+
            ^                        ^                        ^
            |                        |                        |
            |  1. get_decisions      |  2. analyze_change     |  6. link_commit_
            |  4. propose_decision   |  3. record_impact_     |     to_decision
            |  5. get_decision_status|     assessment         |  7. get_git_
            |                        |                        |     traceability
            +------------------------+------------------------+
                                     |
                                     v
       +----------------------------------------------------------------+
       |         CROSS-SESSION CONTINUITY OVER MCP (tools/call)         |
       |    Any fresh coding session or teammate connected to the       |
       |    same project state retrieves active rules and Git reasons   |
       +----------------------------------------------------------------+
```

*Supporting explanation:* All three features reference the same canonical decision IDs (such as `DEC-001` or `DEC-004`) stored in SQLite. **Project Brain** manages the lifecycle of those decisions (`pending`, `approved`, `rejected`, `superseded`); **Change Impact Intelligence** combines local `ts-morph` dependency paths with active path-linked decisions from Project Brain; and **AI Git** associates real Git commits (resolved locally via `Git CLI`) with specific approved decision versions. When a developer or teammate starts a fresh session later, querying ProjectOS over MCP recovers both the current architectural rules and the commit history that implemented them.

| Developer Question | Lifecycle Stage | Answering Feature | Underlying Mechanism |
| :--- | :--- | :--- | :--- |
| *"What have we already decided on this topic or file, and why?"* | **Before Coding** | **Project Brain** | Parameterized SQLite lookup over decision titles, statements, rationale, and normalized repository-relative file bindings (`get_decisions`). |
| *"Who approved replacing the old rule, and what did it supersede?"* | **Before / After** | **Project Brain** | Immutable decision versions with atomic supersession transitions (`pending` → `approved`, predecessor → `superseded`). |
| *"If we make this change, which connected files and active decisions are involved?"* | **Change Planning** | **Change Impact Intelligence** | Reverse AST dependency traversal via `ts-morph` (proposed 2-hop MVP default) combined with path-matched Project Brain decisions (`analyze_change`). |
| *"Which warnings are proven source imports versus AI hypotheses?"* | **Change Planning** | **Change Impact Intelligence** | Verified dependency edges (`E-001`..) stored separately from agent-submitted semantic predictions (`record_impact_assessment`). |
| *"Which real Git commits implemented this approved decision?"* | **After Commit** | **AI Git** | Local `Git CLI` commit resolution bound to the approved decision ID and version (`link_commit_to_decision`). |
| *"Why was this file or commit changed in an earlier session?"* | **After Commit** | **AI Git → Project Brain** | Bidirectional provenance lookup by `decision_id`, `commit_hash`, or `file_path` (`get_git_traceability`). |

---

## System Architecture & Boundaries

ProjectOS is structured into four connected layers that separate **local repository operations** on the developer's machine from **shared application state and human approval** in the backend and web dashboard.

```text
================================================================================
              PROJECTOS FOUR-LAYER SYSTEM ARCHITECTURE
================================================================================

  +--------------------------------------------------------------------------+
  | BOUNDARY A: LOCAL DEVELOPER WORKSTATION (Always Local)                   |
  |                                                                          |
  |  LAYER 1: DEVELOPER & EXTERNAL AI CODING AGENT                           |
  |  +------------------------+              +----------------------------+  |
  |  |       Developer        |   Prompts    |   External Coding Agent    |  |
  |  |  - Defines request     | -----------> |   (Codex — Initial Target) |  |
  |  |  - Reviews & approves  | <----------- |  - Selects starting files  |  |
  |  |  - Tests & git commits |  Code Edits  |  - Calls 7 MCP tools       |  |
  |  +-----------+------------+              +-------------+--------------+  |
  |              |                                         ^                 |
  |              | Normal IDE edits                        | Internal client |
  |              | & git commit                            v model inference |
  |              |                           +----------------------------+  |
  |              |                           |   External LLM Reasoning   |  |
  |              |                           |  (Outside ProjectOS; zero  |  |
  |              |                           |   ProjectOS LLM API cost)  |  |
  |              |                           +----------------------------+  |
  |              |                                         ^                 |
  |              |                                         | MCP Protocol    |
  |              |                                         | (tools/list,    |
  |              |                                         |  tools/call,    |
  |              |                                         |  P1 elicitation)|
  |              |                                         v                 |
  |  LAYER 2: LOCAL MCP SERVER & REPOSITORY INTELLIGENCE   |                 |
  |              |        +--------------------------------+--------------+  |
  |              |        |      Local ProjectOS MCP Server (apps/mcp)    |  |
  |              |        |  - Official TypeScript MCP SDK                |  |
  |              |        |  - Validates local repo binding & path scope  |  |
  |              |        |  - Orchestrates local analysis & REST calls   |  |
  |              |        |  - No direct SQLite database access           |  |
  |              |        +--------+-----------------------------+--------+  |
  |              |                 |                             |           |
  |              |    Invokes      | (Independent Adapters)      | Invokes   |
  |              |    independently|                             | indep.    |
  |              |                 v                             v           |
  |              |        +-----------------+           +-----------------+  |
  |              |        |    ts-morph     |           |     Git CLI     |  |
  |              |        | (repo-analysis) |           |  (git-adapter)  |  |
  |              |        | Static JS/TS    |           | Read-only full  |  |
  |              |        | import & 2-hop  |           | commit hashes,  |  |
  |              |        | dependency scan |           | changed paths   |  |
  |              |        +--------+--------+           +--------+--------+  |
  |              |                 |                             |           |
  |              v                 v                             v           |
  |  +--------------------------------------------------------------------+  |
  |  |          Registered Local Git Repository (Source & .git)           |  |
  |  +--------------------------------------------------------------------+  |
  +--------------------------------------------------------------------------+
                 |                                         ^
                 | Human browser review                    | REST over HTTP(S)
                 | (Authenticated Express Session,         | (Scoped Agent
                 |  HttpOnly cookie + CSRF)                |  Credential:
                 v                                         |  NO approve right)
  +--------------------------------------------------------+-----------------+
  | BOUNDARY B: APPLICATION & SHARED STATE LAYER                             |
  | (P0: Runs Locally on Loopback · P1 Later Phase: AWS EC2 + Amazon EBS)    |
  |                                                                          |
  |  LAYER 4: REACT WEB DASHBOARD            LAYER 3: EXPRESS 5 & SQLITE     |
  |  +-------------------------------+       +----------------------------+  |
  |  |  React Dashboard (apps/web)   |       |   Express.js 5 REST API    |  |
  |  |  React · TypeScript · Vite    | <===> |        (apps/api)          |  |
  |  |                               | REST  |  - Zod boundary validation |  |
  |  |  Independent Feature Views:   |       |  - Session & project auth  |  |
  |  |  +-------------------------+  |       |  - Reusable human-approval |  |
  |  |  | 1. Project Setup        |  |       |    domain service          |  |
  |  |  +-------------------------+  |       +-------------+--------------+  |
  |  |  | 2. Project Brain        |  |                     ^                 |
  |  |  +-------------------------+  |                     | Single API-     |
  |  |  | 3. Decision Review (P0) |  |                     | owned SQLite    |
  |  |  +-------------------------+  |                     | connection &    |
  |  |  | 4. Impact Report        |  |                     | transactions    |
  |  |  |    (React Flow Graph)   |  |                     v                 |
  |  |  +-------------------------+  |       +----------------------------+  |
  |  |  | 5. AI Git Timeline      |  |       |      SQLite Database       |  |
  |  |  +-------------------------+  |       |  Projects, decisions,      |  |
  |  +-------------------------------+       |  review events, reports,   |  |
  |                                          |  edges, predictions, links |  |
  |                                          +----------------------------+  |
  +--------------------------------------------------------------------------+
```

*Supporting explanation:* The architecture enforces four strict separation boundaries:
1. **External LLM vs. Deterministic Local Engines:** Natural-language interpretation and indirect predictions happen inside the connected coding agent's model (Codex), while code dependency traversal (`ts-morph`) and commit inspection (`Git CLI`) are deterministic local programs that consume zero AI tokens.
2. **Independent Local Adapters:** The local MCP server invokes `ts-morph` and `Git CLI` independently against the registered repository. `Git CLI` does not feed into `ts-morph` as a mandatory sequential processing stage.
3. **Single Authoritative Backend (`WS-04`):** Only the Express.js 5 API opens and mutates the SQLite database. Both the local MCP server and the React dashboard communicate with Express over REST validated by shared **Zod** schemas (`@projectos/contracts`).
4. **Independent Dashboard Views & Strict Auth Split:** Within the React dashboard, *Project Setup*, *Project Brain*, *Decision Review*, *Impact Report (React Flow)*, and *AI Git Timeline* are independent views rather than sequential service dependencies. React Flow renders the saved dependency graph returned by Express rather than scanning source code itself. Ordinary MCP-to-API traffic uses a project-scoped agent credential that can create pending proposals, reports, and commit links, whereas only an authenticated human session can invoke the decision approval transition.

---

## End-to-End Operational Workflow

The two diagrams below trace the complete 18-step operational workflow from the implementation reference across its four stages: **01 — Setup and Retrieve**, **02 — Analyze**, **03 — Decide**, and **04 — Record and Reuse**. To keep every path readable within an 80-character width, Stages 01–02 and Stages 03–04 are presented in two consecutive, directly connected sub-diagrams.

### Part 1: Stages 01 (Setup and Retrieve) & 02 (Analyze)

```text
================================================================================
       OPERATIONAL WORKFLOW — PART 1: SETUP, RETRIEVE, AND ANALYZE
================================================================================

  01 — SETUP AND RETRIEVE (Steps 1-4)
  +--------------------------------------------------------------------------+
  | Step 1: Developer registers project (e.g., project_id: "teamflow") and   |
  |         binds the local Git repository path in local MCP configuration.  |
  | Step 2: Coding agent (Codex) connects to local ProjectOS MCP server and  |
  |         discovers the 7 callable tools via MCP `tools/list`.             |
  | Step 3: Team establishes Project Brain (human creates/approves baseline  |
  |         decisions DEC-001, DEC-002, DEC-003 in dashboard, or approves    |
  |         agent-submitted proposals).                                      |
  | Step 4: New coding session starts -> Agent calls `get_decisions` via MCP |
  |         -> Express queries SQLite -> Returns active approved decisions.  |
  +------------------------------------+-------------------------------------+
                                       |
                                       v
  02 — ANALYZE A PROPOSED CHANGE BEFORE CODING (Steps 5-8)
  +--------------------------------------------------------------------------+
  | Step 5: Developer requests a feature or refactor in natural language.    |
  |         Agent interprets request and searches repo to select candidate   |
  |         `starting_files` or resolvable `starting_symbols`.               |
  +------------------------------------+-------------------------------------+
                                       |
               +-----------------------+-----------------------+
               |Routine change within                          |Significant or
               |known architecture &                           |architecturally
               |no impact scan needed                          |sensitive change
               |                                               v
               |     +-------------------------------------------------------+
               |     | Step 6: Agent invokes `analyze_change` via MCP.       |
               |     | Step 7: Local MCP server runs `ts-morph` reverse      |
               |     |         dependency traversal (proposed 2-hop bound)   |
               |     |         and queries Express for path-linked decisions |
               |     |         (e.g., DEC-001).                              |
               |     | Step 8: Express saves report (e.g., IMP-001) in       |
               |     |         SQLite and returns verified edges + limits.   |
               |     |         Agent optionally calls                        |
               |     |         `record_impact_assessment` to save its        |
               |     |         semantic predictions & conflict warnings      |
               |     |         SEPARATELY from verified code relationships.  |
               |     +-------------------------+-----------------------------+
               |                               |
               +---------------+---------------+
                               |
                               v
             (Continues to Stage 03 — DECIDE below)
```

### Part 2: Stages 03 (Decide) & 04 (Record and Reuse)

```text
================================================================================
        OPERATIONAL WORKFLOW — PART 2: DECIDE, RECORD, AND REUSE
================================================================================

             (From Stage 02 — Impact Report & Plan Evaluation)
                                       |
                                       v
  03 — DECIDE: HUMAN REVIEW & ARCHITECTURAL GOVERNANCE (Steps 9-12)
  +--------------------------------------------------------------------------+
  | Step 9: Human reviews the plan, impact report, and related decisions.    |
  |         Does this change require a new or replacement decision?          |
  +------+-----------------------------+------------------------------+------+
         |                             |                              |
  [Path A: No new rule]         [Path B: Redesign]            [Path C: New or
  Complies with active          Keep existing rules;          replacement rule]
  rules (PB-08: skip            revise feature plan                   |
  redundant proposal)                  |                              v
         |                             v               +-----------------------+
         |              +--------------------------+   | Step 10: Agent calls  |
         |              | Return to Step 5/6:      |   |  `propose_decision`   |
         |              | Re-analyze revised plan  |   |  -> Saved as `pending`|
         |              | (e.g., produces IMP-002) |   |  in SQLite (DEC-004). |
         |              +-------------+------------+   +-----------+-----------+
         |                            |                            |
         |                            +------(If rule needed)----->+
         |                                                         |
         |                                                         v
         |                                     +-------------------------------+
         |                                     | Step 11: Human Approval Gate  |
         |                                     |  P0: Dashboard review via     |
         |                                     |      Express Session (agent   |
         |                                     |      pauses, no polling).     |
         |                                     |  P1: Trusted MCP Elicitation  |
         |                                     |      with dashboard fallback. |
         |                                     | Step 12: On resume, agent     |
         |                                     |  calls `get_decision_status`. |
         |                                     +---+------------+-----------+--+
         |                                         |            |           |
         |                               [Pending] |  [Rejected]| [Approved]|
         |                                         v            v           |
         |                                 +------------+ +---------------+ |
         |                                 | STOP:      | | STOP: Old     | |
         |                                 | Await      | | rule stays    | |
         |                                 | human      | | active;       | |
         |                                 | review.    | | revise/abort. | |
         |                                 +------------+ +---------------+ |
         |                                                                  |
         +---------------------------------+--------------------------------+
                                           |
                                           v
  04 — RECORD AND REUSE (Steps 13-18)
  +--------------------------------------------------------------------------+
  | Step 13: Agent implements the reviewed plan using normal IDE editing.    |
  | Step 14: Developer reviews code edits and runs normal project tests.     |
  | Step 15: Developer (or agent at developer direction) creates a normal    |
  |          Git commit (e.g., short display hash `a7c92f1`).                |
  +------------------------------------+-------------------------------------+
                                       |
               +-----------------------+-----------------------+
               |Commit implements an                           |Routine commit
               |approved decision                              |(no rule link)
               v                                               v
  +-----------------------------------------+     +--------------------------+
  | Step 16: Call `link_commit_to_decision` |     | Leave commit unlinked    |
  |   -> Local Git CLI resolves full SHA &  |     | (Valid state; ProjectOS  |
  |   changed paths -> Saved in SQLite.     |     | never fabricates a link) |
  | Step 17: Inspect bidirectional links in |     +--------------------------+
  |   AI Git dashboard or via MCP.          |
  | Step 18: Fresh session / teammate calls |
  |   `get_decisions` &                     |
  |   `get_git_traceability` to recover     |
  |   rationale without prior chat history. |
  +-----------------------------------------+
```

*Supporting explanation:* The workflow diagrams above highlight three critical operational safeguards from the PRD:
* **No redundant approval gates (`PB-08`):** If a change already complies with existing approved decisions (`Path A`), development proceeds straight to implementation without creating a new decision proposal.
* **Pending or rejected proposals never proceed to implementation (`PB-03`, `PB-06`):** If a proposal is still `pending` or is explicitly `rejected`, the coding agent stops work on that architectural change. Rejecting a replacement proposal leaves the existing approved decision active and unmodified.
* **Redesign loop before proposing (`Step 9`):** When impact analysis (`IMP-001`) reveals a conflict with an existing rule (`DEC-001`), the developer can revise the feature design (`Path B`), run a fresh impact scan (`IMP-002`) on the revised approach, and then submit a proposal (`DEC-004`) that references the updated report.

---

## Deep Dive: How Each Core Feature Works

### 1. Project Brain: Structured Memory & Lifecycle Rules

Project Brain is designed around strict state invariants so an AI coding agent never confuses a tentative suggestion with an approved architectural rule:

* **Rich Decision Schema (`PB-01`):** Every decision stores `project_id`, stable `decision_id`, reviewed `version`, `title`, `decision` statement, `rationale`, `status` (`pending`, `approved`, `rejected`, `superseded`), `reviewer`, review channel, timestamps, `related_paths` (normalized repository-relative paths), and optional `predecessor_id`. An initially empty Project Brain returns an explicit empty state rather than fabricating architecture.
* **Bounded, Deterministic Retrieval (`PB-02`):** `get_decisions` uses parameterized SQLite keyword matching over title, statement, and rationale plus exact file-path joins (recommended initial default limit `10`, hard cap `50` with a truncation indicator). It does not rely on an external embedding service or claim semantic-search omniscience. Discovery defaults strictly to `approved` records; `pending`, `rejected`, and `superseded` records are returned only when explicitly requested by status, exact ID, or `include_history: true`.
* **Immutable Revisions & Atomic Supersession (`PB-03`, `PB-04`):** Approved decisions are never overwritten in place. Proposing a replacement creates a new `pending` proposal pointing to the active predecessor while the predecessor remains active. When an authorized human approves the exact pending version, Express activates the replacement and transitions the predecessor to `superseded` in one atomic SQLite transaction—preserving earlier rationale and commit links intact.

---

### 2. Change Impact Intelligence: Reverse Dependency Traversal vs. Source Imports

A central engineering principle of ProjectOS is separating **what the static code analyzer proved** from **what the LLM inferred**, while making the direction of dependency analysis explicit.

In source code, a consumer module **imports** a target service (`Consumer ──imports──> Target`). When evaluating the impact of changing `Target`, Change Impact Intelligence traverses those edges in **reverse** (`Target ──is imported by──> Consumer`) to discover downstream modules that may be affected.

```text
================================================================================
     CHANGE IMPACT INTELLIGENCE — TEAMFLOW REPORT IMP-001 ARCHITECTURE
================================================================================

  1. SOURCE IMPORT DIRECTION vs. REVERSE IMPACT TRAVERSAL (Proposed 2-Hop MVP)

     Source Code Import Direction (How files import each other on disk):
     +----------------------+       imports       +-----------------------+
     | projectOperations.ts | ------------------> |   bulkTaskService.ts  |
     +----------------------+                     +-----------+-----------+
                                                              |
     +----------------------+       imports                   | imports
     |    taskRoutes.ts     | -------------------+            |
     +----------------------+                    |            v
                                                 |  +---------------------+
                                                 +> | taskAssignment      |
                                                    | Service.ts (Target) |
                                                    +---------------------+

     Reverse Dependency Traversal (How `analyze_change` traces blast radius):
     [0-Hop Starting File]         [1-Hop Direct]           [2-Hop Indirect]
     taskAssignmentService.ts ===> taskRoutes.ts      (E-001)
                              ===> bulkTaskService.ts (E-002)
                                        |
                                        +===> projectOperations.ts
                                              (2-hop chain: E-003 -> E-002)

  ----------------------------------------------------------------------------

  2. STRICT SEPARATION OF VERIFIED EVIDENCE vs. AI PREDICTIONS IN SQLITE

  +-------------------------------------+  +-----------------------------------+
  |  VERIFIED REPOSITORY & BRAIN FACTS  |  |   SEPARATE AI PREDICTIONS TABLE   |
  |     (Produced by analyze_change)    |  | (Via record_impact_assessment)    |
  +-------------------------------------+  +-----------------------------------+
  | Starting File (Verified on disk):   |  | Prediction 1 (Conflict Warning):  |
  | - src/services/                     |  | "Automatic reassignment may       |
  |   taskAssignmentService.ts          |  |  conflict with manager-only       |
  |                                     |  |  authorization."                  |
  | Verified AST Dependency Edges:      |  |  -> References: ["DEC-001"]       |
  | - E-001 (1-hop direct_dependent):   |  |                                   |
  |   src/routes/taskRoutes.ts          |  | Prediction 2 (Workflow Gap):      |
  | - E-002 (1-hop direct_dependent):   |  | "A leave-status interface may be  |
  |   src/services/bulkTaskService.ts   |  |  needed so employees can report   |
  | - E-003 (2-hop indirect_dependent): |  |  unavailability."                 |
  |   src/services/projectOperations.ts |  |  -> References: (Semantic         |
  |                                     |  |     hypothesis; no AST edge)      |
  | Path-Linked Approved Decision:      |  |                                   |
  | - DEC-001: Only project managers    |  | Rule (CI-05): Stored separately;  |
  |   can authorize ownership changes   |  | cannot overwrite verified edges   |
  |   (Bound to taskAssignmentService)  |  | or alter decision approval state. |
  +-------------------------------------+  +-----------------------------------+
```

*Supporting explanation:*
* **Why starting points come from the coding agent (`CI-01`):** A static AST scanner cannot infer which file corresponds to an arbitrary natural-language request like *"reassign unfinished tasks when an employee goes on leave."* The coding agent interprets the request, identifies `src/services/taskAssignmentService.ts` (or a resolvable symbol via `starting_symbols`), and passes it to `analyze_change`.
* **Two-hop traversal as a proposed MVP default (`CI-02`, `CI-08`):** The analyzer follows reverse dependency edges up to two hops by default for the MVP—discovering `projectOperations.ts` via `bulkTaskService.ts` even though `projectOperations.ts` contains none of the original feature keywords. A visited set ensures termination on cyclic dependency graphs, and recommended initial bounds (`100` files, `300` edges, configurable time budget) return an explicitly labelled partial result if reached.
* **Dependency does not equal guaranteed breakage (`CI-03`):** Discovering a verified edge (`E-001`..`E-003`) proves that a structural import or reference exists in source code; it does **not** prove that every dependent file requires modification or will break at runtime. Unresolved imports, excluded files, and static-analysis limitations are reported transparently.
* **Snapshot freshness (`CI-06`):** Every report captures `HEAD`, a worktree content fingerprint for analyzed paths, analyzer options, and consulted decision versions so the dashboard can distinguish a fresh report from a stale or historical snapshot after uncommitted worktree edits.

---

### 3. AI Git: Bidirectional Commit-to-Decision Provenance

Git records *what* changed; AI Git records *which approved decision explains the change* without interfering with standard Git usage.

```text
================================================================================
           AI GIT — COMMIT-TO-DECISION PROVENANCE & TRACEABILITY
================================================================================

  1. NORMAL DEVELOPMENT & EXPLICIT LINKING (`link_commit_to_decision`)

  +-----------------------+     Normal git commit     +------------------------+
  |  Developer & Agent    | ------------------------> | Local .git Repository  |
  |  Implement & test     |   (ProjectOS never auto-  | Full 40-char SHA       |
  |  approved DEC-004     |    commits or branches)   | (Display: `a7c92f1`)   |
  +-----------+-----------+                           +-----------+------------+
              |                                                   |
              | Calls `link_commit_to_decision`                   | Read-only
              | (project_id, commit_hash, decision_id,            | `Git CLI`
              |  optional file_associations)                      v
              |                                       +------------------------+
              +-------------------------------------> | Local MCP Git Adapter  |
                                                      | Resolves full SHA,     |
                                                      | parent hashes, author, |
                                                      | message, changed paths |
                                                      +-----------+------------+
                                                                  |
                                                                  | REST POST
                                                                  v
  +----------------------------------------------------------------------------+
  |             EXPRESS 5 BACKEND & SQLITE (`commit_associations`)             |
  |  - Verifies DEC-004 is `approved` for project `teamflow`                   |
  |  - Binds full commit SHA <--> DEC-004 (exact approved decision version)    |
  |  - Records provenance: `agent-recorded`, `human-recorded`, or              |
  |    `human-confirmed` (valid SHA alone is never treated as proof of intent) |
  |  - Supports many-to-many links (1 commit <-> N decisions, idempotent)      |
  |  - Distinguishes commit-level membership from explicit `file_associations` |
  +-------------------------------------+--------------------------------------+
                                        |
  --------------------------------------|---------------------------------------
                                        v
  2. BIDIRECTIONAL RETRIEVAL (`get_git_traceability` & AI Git Dashboard)

     Selector A: By `decision_id` ("DEC-004")
     +----------------------------------------------------------------------+
     | Query : "Which commits implemented DEC-004?"                         |
     | Result: Returns commit `a7c92f1`, commit message, changed files      |
     |         (`taskAssignmentService.ts`, `managerApproval.ts`,           |
     |          `leaveStatus.ts`), and association provenance.              |
     +----------------------------------------------------------------------+

     Selector B: By `commit_hash` ("<full SHA of a7c92f1>")
     +----------------------------------------------------------------------+
     | Query : "Why was commit a7c92f1 made?"                               |
     | Result: Returns linked decision DEC-004 (version), statement,        |
     |         recorded rationale, and reviewer approval metadata.          |
     +----------------------------------------------------------------------+

     Selector C: By `file_path` ("src/services/taskAssignmentService.ts")
     +----------------------------------------------------------------------+
     | Query : "Which decisions and commits shaped this file?"              |
     | Result: Returns recorded commits touching the file and their linked  |
     |         decisions (e.g., DEC-004, DEC-001), distinguishing explicit  |
     |         file-level associations from general commit membership.      |
     +----------------------------------------------------------------------+
```

*Supporting explanation:*
* **No fabricated history (`GT-01`, `GT-04`):** ProjectOS never auto-commits, auto-merges, or guesses reasons for arbitrary historical commits. If a commit does not implement an architectural decision, it remains **unlinked**—which is a valid, expected state.
* **Provenance and optional human confirmation (`GT-02`):** The system records whether an association was submitted by an agent or a human, and never labels an agent-submitted link as human-confirmed unless a human explicitly confirms it.
* **Historical durability across supersession and shallow clones (`GT-05`):** If a decision is later superseded by a newer rule, commits linked to the earlier decision version retain their original recorded rationale. If a commit object is missing from a different local clone (for instance, an unpushed commit on another laptop), ProjectOS still returns the stored traceability metadata from SQLite while explicitly noting that live local diff inspection is unavailable.

---

## Human Approval & Governance

The most critical security boundary in ProjectOS is preventing an AI coding agent from approving its own architectural proposals (`PB-05`–`PB-08`). The backend—not the UI or the MCP client—owns the authoritative review state.

```text
================================================================================
        HUMAN APPROVAL GOVERNANCE — P0 DASHBOARD vs. P1 ELICITATION
================================================================================

  Coding Agent (Codex)
  Calls `propose_decision` (title, decision, rationale, related_paths,
  optional related_decision_ids, impact_report_id, supersedes_decision_id)
         |
         |  [Security Gate PB-07: Ordinary agent credential has NO approval
         |   permission; forged approval flags in tool args are rejected]
         v
  +--------------------------------------------------------------------------+
  | Express 5 Backend & SQLite                                               |
  | 1. Validates payload with Zod and checks project access.                 |
  | 2. Persists proposal as `status: "pending"` (e.g., DEC-004, version 1)   |
  |    with a stable idempotency identity (retries do not duplicate).        |
  | 3. Releases SQLite transaction immediately (never held open for human).  |
  +--------------------+-----------------------------------+-----------------+
                       |                                   |
       ================+================   ================+================
       | P0 PRIMARY PATH (Mandatory)   |   | P1 LATER ENHANCEMENT          |
       | Authenticated Dashboard Flow  |   | (Added only after P0 passes)  |
       ================+================   ================+================
                       |                                   |
                       v                                   v
  +------------------------------------+   +-----------------------------------+
  | 1. MCP tool returns immediately:   |   | 1. MCP server negotiates client   |
  |    `{ decision_id: "DEC-004",`     |   |    elicitation support and issues |
  |    `  version: 1,`                 |   |    protocol request               |
  |    `  status: "pending",`          |   |    (`elicitation/create`).        |
  |    `  review_url: "..." }`         |   | 2. Coding client UI (NOT the LLM) |
  | 2. Agent PAUSES architectural work |   |    displays exact proposal text,  |
  |    cleanly (no polling loop).      |   |    version, rationale & report ID.|
  | 3. Human logs into React Dashboard |   +-----------------+-----------------+
  |    (Express Session + HttpOnly     |                     |
  |    cookie + CSRF protection) and   |         +-----------+-----------+
  |    reviews exact proposal version. |         |                       |
  +-----------------+------------------+         | Cancelled, timed out, | Trusted
                    |                            | deferred, unsupported | human
                    |                            | or untrusted channel  | input
                    |                            v                       |
                    |              +---------------------------+         |
                    |              | FAIL-CLOSED FALLBACK:     |         |
                    |              | Proposal stays `pending`; |         |
                    |              | returns dashboard URL and |         |
                    |              | falls back to P0 flow.    |         |
                    |              +-------------+-------------+         |
                    |                            |                       |
                    +<---------------------------+                       |
                    |                                                    |
                    +------------------------+---------------------------+
                                             |
                                             v
  +--------------------------------------------------------------------------+
  | Shared Backend Review Domain Service (`POST .../decisions/:id/review`)   |
  | - Verifies authenticated human reviewer identity & project permission.   |
  | - Checks exact pending version (stale/replayed reviews return HTTP 409). |
  | - Writes append-only audit record to `review_events`.                    |
  |                                                                          |
  |   If Explicit APPROVE:                     If Explicit REJECT:           |
  |   - Transitions DEC-004 -> `approved`      - Transitions -> `rejected`   |
  |   - If replacement (`supersedes_...`),     - Predecessor remains active  |
  |     atomically marks predecessor             and unchanged.              |
  |     `superseded` in same transaction.                                    |
  +------------------------------------+-------------------------------------+
                                       |
                                       v
  +--------------------------------------------------------------------------+
  | Resumption:                                                              |
  | - In P0: Developer asks agent to continue -> Agent calls                 |
  |   `get_decision_status({project_id: "teamflow", decision_id: "DEC-004"})`|
  |   once -> Reads persisted outcome (`approved` / `rejected` / `pending`). |
  | - In P1: If trusted immediate elicitation succeeded, `propose_decision`  |
  |   returns the persisted outcome directly.                                |
  +--------------------------------------------------------------------------+
```

### Key Governance & Security Rules

| Governance Rule | Architectural Enforcement |
| :--- | :--- |
| **Human-only approval authority (`PB-07`)** | Ordinary MCP-to-API requests use a project-scoped credential that lacks review permissions. Direct agent approval calls, forged tool arguments, or unauthenticated browser requests are rejected with `HTTP 401/403`. |
| **Version-bound, idempotent review (`NF-02`)** | A human review binds to the exact `decision_id` and `version`. If a proposal is revised or already resolved, competing or replayed review requests fail with `HTTP 409 Conflict`. |
| **Atomic supersession (`PB-04`)** | A replacement proposal targets only the currently active approved predecessor. Until approved, the old decision remains active; upon approval, the replacement becomes `approved` and the predecessor becomes `superseded` in one transaction. |
| **Protocol elicitation is not an 8th tool** | In `P1`, `elicitation/create` (or structured input-required retry) is an MCP protocol-level server-to-client request inside `propose_decision`, not an agent-callable business tool. |
| **Unresolved P1 trust boundary disclosure** | As documented in the PRD, MCP capability negotiation and a form response alone do not cryptographically prove human identity to a shared backend. Defining the reviewer-bound elicitation channel is a `P1` task (`E10`); whenever trust cannot be established, ProjectOS fails closed to `P0` dashboard approval. |

---

## The Seven MCP Tools

ProjectOS exposes its entire agent interface through exactly **seven MCP business tools** discovered via `tools/list` and invoked via `tools/call`. Every tool requires `project_id` to scope operations to an authorized ProjectOS workspace.

| # | MCP Tool Name | Operation Type | Required Inputs | Optional / Conditional Inputs | What ProjectOS Does & Returns |
| :-: | :--- | :--- | :--- | :--- | :--- |
| **1** | **`get_decisions`** | **Read Operation** *(Project Brain)* | `project_id` | `query`, `decision_id`, `related_files`, `status`, `include_history`, `limit` | Queries SQLite via Express for matching decision records, statements, rationale, status, file bindings, and opt-in supersession history. Discovery defaults to active `approved` decisions (default limit `10`, hard cap `50`). |
| **2** | **`analyze_change`** | **Analysis + Persistent Write** *(Change Impact)* | `project_id`, `change_description`, plus starting code | `starting_files` or `starting_symbols` (at least one usable starting point required) | Validates paths locally, runs `ts-morph` reverse dependency traversal (proposed 2-hop bound), matches active decisions by path, persists an impact report (`IMP-001`) in SQLite, and returns verified edges (`E-001`..), snippets, snapshot metadata, and limitations. |
| **3** | **`record_impact_assessment`** | **Persistent Write** *(Change Impact)* | `project_id`, `report_id`, `predictions` | Per prediction entry: `evidence_ids`, `decision_ids` | Validates referenced report/evidence/decision IDs and persists the coding agent's semantic predictions and potential decision conflicts in SQLite separately from verified AST edges. Cannot modify approved decisions or promote predictions to facts. |
| **4** | **`propose_decision`** | **Persistent Write (+ P1 Review)** *(Project Brain)* | `project_id`, `title`, `decision`, `rationale`, `related_paths` | `related_decision_ids`, `impact_report_id`, `supersedes_decision_id` | Saves a new or replacement architectural decision as `pending` (`DEC-004`) with duplicate-safe idempotency. In `P0`, returns pending ID, version, and dashboard review location immediately; in `P1`, initiates trusted MCP elicitation with dashboard fallback. |
| **5** | **`get_decision_status`** | **Read Operation** *(Project Brain)* | `project_id`, `decision_id` | — | Reads the authoritative persisted review outcome (`approved`, `pending`, `rejected`, or `superseded`), current version, reviewer feedback, and timestamp when the agent resumes after human review. Eliminates continuous polling. |
| **6** | **`link_commit_to_decision`** | **Analysis + Persistent Write** *(AI Git)* | `project_id`, `commit_hash`, `decision_id` | `file_associations` | Uses local `Git CLI` to resolve the full commit hash, commit metadata, and actual changed paths; verifies the decision is `approved` for the project; and persists an idempotent commit-to-decision association in SQLite. Never creates commits, branches, or pushes. |
| **7** | **`get_git_traceability`** | **Read Operation** *(AI Git)* | `project_id`, plus one selector | One of: `decision_id`, `commit_hash`, or `file_path` | Retrieves bidirectional provenance: commits implementing a decision, recorded decisions and rationale explaining a commit, or commit/decision history for a specific file. Explicitly identifies unlinked changes or unavailable local commit objects. |

### Representative MCP Tool Payloads (TeamFlow Examples)

#### 1. `get_decisions` — Discover active rules by topic, file, or ID
```json
{
  "project_id": "teamflow",
  "query": "task reassignment",
  "status": "approved"
}
```
Other common invocation patterns from the implementation reference:
* Retrieve active decisions at session start: `{"project_id": "teamflow"}`
* Check decisions bound to a file before editing: `{"project_id": "teamflow", "related_files": ["src/services/taskAssignmentService.ts"]}`
* Inspect a known decision with full supersession history: `{"project_id": "teamflow", "decision_id": "DEC-001", "include_history": true}`

#### 2. `analyze_change` — Trace repository dependencies before editing
```json
{
  "project_id": "teamflow",
  "change_description": "Automatically reassign unfinished tasks when an employee becomes unavailable",
  "starting_files": ["src/services/taskAssignmentService.ts"]
}
```
Representative structured response returned to the coding agent:
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

#### 3. `record_impact_assessment` — Persist AI predictions separately from verified edges
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

#### 4. `propose_decision` — Submit a pending architectural decision for human review
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

#### 5. `get_decision_status` — Verify human approval on manual resumption
```json
{
  "project_id": "teamflow",
  "decision_id": "DEC-004"
}
```

#### 6. `link_commit_to_decision` — Link an actual Git commit to an approved decision
```json
{
  "project_id": "teamflow",
  "commit_hash": "<full hash of the actual local Git commit>",
  "decision_id": "DEC-004"
}
```

#### 7. `get_git_traceability` — Query why a file or commit was changed
```json
{
  "project_id": "teamflow",
  "file_path": "src/services/taskAssignmentService.ts"
}
```

---

## End-to-End Example: The TeamFlow Scenario

To demonstrate how ProjectOS operates across multiple sessions and developers without fabricated outputs, the specification uses **TeamFlow**—a TypeScript project-management application built by **Rahul** (using Codex) and later continued by his teammate **Ananya** in a fresh session.

### 1. Baseline Architecture in TeamFlow's Project Brain

Before Rahul begins his feature, TeamFlow has three human-approved architectural decisions recorded in Project Brain:

| Decision ID | Approved Decision Statement | Recorded Rationale | Associated Repository Path |
| :--- | :--- | :--- | :--- |
| **`DEC-001`** | Only project managers can authorize task ownership changes. | Preserve accountability. | `src/services/taskAssignmentService.ts` |
| **`DEC-002`** | Every ownership change must appear in the activity log. | Maintain an audit trail. | `src/services/activityLog.ts` |
| **`DEC-003`** | Notifications are sent only after a change is successfully saved. | Avoid notifying people about failed changes. | `src/services/notificationService.ts` |

### 2. Rahul's Feature Request & Impact Discovery (Steps 1–8)

1. **Workspace setup & retrieval (Steps 1–4):** Rahul binds his local TeamFlow Git repository to `project_id: "teamflow"`, connects Codex to the local ProjectOS MCP server (`tools/list`), and starts a coding session. Codex calls `get_decisions({project_id: "teamflow"})` and loads `DEC-001`, `DEC-002`, and `DEC-003`.
2. **Natural-language request (Step 5):** Rahul prompts Codex: *"Add a feature that automatically reassigns unfinished tasks when an employee goes on leave. Before editing, use ProjectOS to check what this might affect."*
3. **Two-hop dependency analysis (Steps 6–7):** Codex identifies `src/services/taskAssignmentService.ts` as the candidate starting file and invokes `analyze_change`. Locally, `ts-morph` traces reverse dependencies:
   * **Direct (1-hop) consumers:** `src/routes/taskRoutes.ts` (`E-001`) and `src/services/bulkTaskService.ts` (`E-002`).
   * **Indirect (2-hop) consumer:** `src/services/projectOperations.ts` (`E-003`), which imports `bulkTaskService.ts` (even though `projectOperations.ts` contains none of the original leave or reassignment keywords).
   * **Related rule:** Project Brain surfaces `DEC-001` because it is bound to `taskAssignmentService.ts`.
4. **Separating facts from predictions (Step 8):** ProjectOS saves report **`IMP-001`**. Codex reasons that fully automatic reassignment conflicts with `DEC-001` (manager-only authorization) and that employees will need a leave-status UI. It calls `record_impact_assessment` to save those two points as **AI predictions** alongside `IMP-001`.

### 3. Human Redesign, Approval & Implementation (Steps 9–17)

5. **Redesigning around the constraint (Step 9):** Seeing the `DEC-001` conflict in `IMP-001`, Rahul decides not to bypass managers. Instead, TeamFlow will *suggest* reassignment options when an employee goes on leave and notify the manager to approve them. Codex re-runs `analyze_change` on the revised design, producing report **`IMP-002`**.
6. **Proposing `DEC-004` (Step 10):** To record this new rule for future sessions, Codex calls `propose_decision` referencing `DEC-001` and `IMP-002`. Express saves **`DEC-004`** (*"Leave-related task reassignment"*) with `status: "pending"`. Because `DEC-004` builds on `DEC-001` rather than replacing it, `DEC-001` stays active (`related_decision_ids: ["DEC-001"]`).
7. **Dashboard approval & resumption (Steps 11–12):** Codex pauses work on the architectural change. Rahul opens the ProjectOS React dashboard, reviews `DEC-004` with `IMP-002`, and clicks **Approve**. Returning to Codex, Rahul asks it to continue; Codex calls `get_decision_status({project_id: "teamflow", decision_id: "DEC-004"})`, confirms `status: "approved"`, and implements the feature across `taskAssignmentService.ts`, `managerApproval.ts`, and `leaveStatus.ts` (Steps 13–14).
8. **Normal Git commit & AI Git link (Steps 15–17):** Rahul reviews and tests the code, then creates a normal Git commit (`feat: add manager-approved task reassignment`, short display hash `a7c92f1`). Codex calls `link_commit_to_decision` with the full commit SHA and `DEC-004`. Local `Git CLI` verifies the commit and changed paths, persisting the link in SQLite.

### 4. Ananya's Fresh Session Reuse (Step 18)

Later, Rahul's teammate **Ananya** opens TeamFlow in a fresh coding session (connected to the same ProjectOS project state) and asks:
> *"Why does task reassignment require manager approval? Can I remove that step?"*

Without access to Rahul's chat history, Ananya's coding agent calls `get_decisions` and `get_git_traceability({project_id: "teamflow", file_path: "src/services/taskAssignmentService.ts"})`. ProjectOS returns `DEC-001`, `DEC-004`, the exact recorded rationale (*"Reduce manual coordination while preserving managerial accountability"*), and the linked implementation commit `a7c92f1`. If Ananya still wishes to change the policy, the same impact-analysis and human-approval cycle begins anew.

---

## Deployment Architecture

ProjectOS follows a **local-first verification strategy**: the complete `P0` workflow runs locally on the developer's machine first. Only after the local release gate (`T13`) passes is the shared backend and web dashboard deployed to **AWS EC2 + Amazon EBS** in `P1` (`E11` / `T14`).

```text
================================================================================
        DEPLOYMENT ARCHITECTURE — P0 LOCAL MVP vs. P1 PLANNED AWS CLOUD
================================================================================

  1. P0 INITIAL LOCAL ARCHITECTURE (Current Hackathon MVP Target)
  +--------------------------------------------------------------------------+
  | Developer Workstation (Single Machine)                                   |
  |                                                                          |
  |  +-------------------+   MCP    +-------------------+                    |
  |  | Coding Agent      | <=====>  | Local ProjectOS   |                    |
  |  | (Codex Client)    |          | MCP Server        |                    |
  |  +-------------------+          +----+---------+----+                    |
  |                                      |         |                         |
  |                         +------------+         +------------+            |
  |                         v                                   v            |
  |               +-------------------+               +-------------------+  |
  |               | ts-morph & Git CLI|               | Express 5 REST API|  |
  |               | + Local Git Repo  |               | + SQLite Database |  |
  |               +-------------------+               +---------+---------+  |
  |                                                             ^            |
  |                                                             | Loopback   |
  |                                                             v HTTP REST  |
  |                                                   +-------------------+  |
  |                                                   | React Dashboard   |  |
  |                                                   | (Browser Session) |  |
  |                                                   +-------------------+  |
  +--------------------------------------------------------------------------+

  ----------------------------------------------------------------------------

  2. P1 PLANNED CLOUD ARCHITECTURE (After P0 Local Gate Passes)
  +-----------------------------------+  +-----------------------------------+
  | Developer Workstation (Laptop)    |  | AWS Cloud Infrastructure (Planned)|
  | *Always Remains Local*            |  | *Shared Project State Only*       |
  |                                   |  |                                   |
  | +-------------------------------+ |  | +-------------------------------+ |
  | | Coding Agent (Codex Client)   | |  | | Amazon EC2 Instance           | |
  | +---------------+---------------+ |  | |                               | |
  |                 ^                 |  | | +---------------------------+ | |
  |                 | MCP             |  | | | Express.js 5 REST API     | | |
  |                 v                 |  | | | + Built React Frontend    | | |
  | +---------------+---------------+ |  | | +-------------+-------------+ | |
  | | Local ProjectOS MCP Server    | |  | +---------------|---------------+ |
  | +-------+---------------+-------+ |  |                 |                 |
  |         |               |         |  |                 v                 |
  |         v               | HTTPS   |  | +-------------------------------+ |
  | +---------------+       | REST    |  | | Attached Amazon EBS Volume    | |
  | | ts-morph      |       +=========>  | | - Persistent SQLite Database  | |
  | | Git CLI       |                 |  | | - Durable Express Sessions    | |
  | | Local Git Repo|       +=========>  | +-------------------------------+ |
  | +---------------+       | HTTPS   |  |                                   |
  |                         | Session |  | Note: EC2 never mounts or reads   |
  | +---------------+       |         |  | the developer's raw local files   |
  | | Browser UI    | ------+         |  | or unpushed local Git objects.    |
  | +---------------+                 |  |                                   |
  +-----------------------------------+  +-----------------------------------+
```

*Supporting explanation:*
* **Why repository intelligence always stays local:** Even when Express and SQLite are hosted on AWS EC2 + EBS in `P1`, the remote server cannot directly read the developer's laptop filesystem or inspect unpushed local Git commits. Each developer runs the ProjectOS MCP server, `ts-morph`, and `Git CLI` locally against their own repository clone and binds that clone to the shared `project_id` (`teamflow`).
* **Snapshot vs. live freshness in cloud mode:** Because a hosted backend cannot know whether a developer's local working tree has uncommitted edits unless the local MCP component reports them, the dashboard distinguishes **snapshot recorded at analysis time** from **freshness verified now**.

---

## Technology Stack & Engineering Structure

| Layer | Finalized Technology | Role in ProjectOS |
| :--- | :--- | :--- |
| **Frontend** | **React.js**, **TypeScript**, **Vite**, **React Flow** | Human governance dashboard (*Project Setup*, *Project Brain*, *Decision Review*, *Impact Report*, *AI Git*) and interactive dependency graph visualization |
| **Backend** | **Node.js**, **Express.js 5**, **TypeScript**, **Zod** | Single authoritative REST API, domain services, runtime schema validation, access control, and transactional decision lifecycle rules |
| **Database** | **SQLite** | Relational persistence for projects, decisions, review events, impact reports, dependency edges, AI predictions, and Git commit associations |
| **MCP Integration** | **Model Context Protocol (MCP)**, **Official TypeScript MCP SDK** | Local server exposing the 7 ProjectOS business tools (`tools/list`, `tools/call`, and P1 `elicitation/create`) |
| **Code Intelligence** | **`ts-morph`**, **`Git CLI`** | Independent local adapters for 2-hop static JS/TS dependency tracing (`ts-morph`) and read-only commit/diff inspection (`Git CLI`) |
| **AI / LLM** | **Agent-Agnostic External LLM** *(Codex initial target)* | Connected coding agent interprets prompts, selects starting files, and suggests predictions; ProjectOS hosts no internal model |
| **APIs & Security** | **REST over HTTP(S)**, **Express Sessions**, **Scoped Credentials** | Protects human dashboard approvals with `HttpOnly`/CSRF-protected sessions while restricting MCP agent credentials from approval routes |
| **Planned Cloud** | **AWS EC2**, **Amazon EBS** *(P1 after local release gate)* | Hosts the shared Express API and built React frontend on EC2 with SQLite data persisted on an attached EBS volume |

<details>
<summary><strong>Target TypeScript Monorepo Architecture &amp; Module Ownership (ORG-01 – ORG-05)</strong></summary>

The PRD defines a mandatory TypeScript npm-workspaces monorepo layout for new ProjectOS implementation work. Applications (`apps/web`, `apps/api`, `apps/mcp`) may import declared shared packages (`packages/contracts`, `packages/repo-analysis`, `packages/git-adapter`), while shared packages never import application internals:

```text
projectos/
├── apps/
│   ├── web/               # React + TypeScript + Vite dashboard (REST)
│   │   └── src/
│   │       ├── app/       # App shell, routing, providers
│   │       ├── features/  # projects, project-brain, impact, ai-git
│   │       ├── components/# Reusable accessible UI components
│   │       └── lib/       # Shared browser REST client
│   ├── api/               # Express 5 + TypeScript + SQLite backend
│   │   ├── src/
│   │   │   ├── modules/   # projects, decisions, impact, git-links
│   │   │   ├── auth/      # Express Session & scoped agent policies
│   │   │   ├── middleware/# Zod boundary validation & error mapping
│   │   │   ├── db/        # SQLite connection & migration runner
│   │   │   ├── app.ts     # Express composition (no listen())
│   │   │   └── server.ts  # Process entry point
│   │   └── migrations/    # Ordered immutable SQL migrations
│   └── mcp/               # Official TypeScript MCP SDK local server
│       └── src/
│           ├── tools/     # 7 tool handlers (get-decisions..git)
│           ├── clients/   # Backend REST client
│           ├── repository/# Local binding & canonical path check
│           └── server.ts  # MCP server registration
├── packages/
│   ├── contracts/         # Shared Zod schemas (@projectos/contracts)
│   ├── repo-analysis/     # Deterministic local ts-morph AST analyzer
│   └── git-adapter/       # Read-only local Git CLI evidence adapter
├── tests/                 # Integration, E2E, and real fixtures
└── package.json           # Root lockfile & verification scripts
```

</details>

---

## MVP Scope, Roadmap & Current Status

### Current Repository Status (Honest Implementation Disclosure)

> [!IMPORTANT]
> **Specification Complete · Application Monorepo in Development:**
> This repository currently publishes the architectural specification and system documentation for ProjectOS. The runnable TypeScript monorepo workspaces (`apps/web`, `apps/api`, `apps/mcp`, `packages/*`), SQLite migrations, and root `package.json` verification scripts (`npm ci`, `npm run lint`, `npm run format:check`, `npm run typecheck`, `npm test`, `npm run build`) are **planned implementation deliverables (`E01`–`E11`)** and have not yet been committed to this repository.

### Prioritized Delivery Roadmap (`P0` → `P2`)

| Priority | Milestone | Deliverable & Verification Target |
| :--- | :--- | :--- |
| **`P0`** | **Basic Prototype Checkpoint** | Bootstrap npm workspaces monorepo (`E01`), persist an approved decision in SQLite (`E02`), demonstrate one live Codex-to-ProjectOS MCP retrieval (`E03`), and render a minimal functional UI. |
| **`P0`** | **Integrated Local Hackathon MVP** | All three core features with the 7-tool MCP contract, two-hop `ts-morph` dependency evidence (`E05`–`E06`), authenticated dashboard approval and manual resumption (`E04`), explicit `Git CLI` commit linking (`E07`), React views with React Flow (`E08`), persistence across restarts, and full TeamFlow verification (`E09` / acceptance tests `T01`–`T13`). |
| **`P1`** | **Trusted MCP Elicitation** *(After Local Gate)* | Extend `propose_decision` with interactive in-client human review (`elicitation/create`) backed by the same Express review service and reviewer-bound verification, while preserving fail-closed dashboard fallback (`E10` / `T04`). |
| **`P1`** | **AWS Cloud Deployment** *(After Local Gate)* | Host the verified Express 5 API and React build on **AWS EC2** over HTTPS with SQLite and sessions persisted on **Amazon EBS** (`E11` / `T14`). Local MCP server, `ts-morph`, `Git CLI`, and the repository remain local. |
| **`P2`** | **Scoped Enhancements** | Richer dashboard filters, graph navigation polish, optional file-level commit associations, and broader JS/TS syntax support where time permits. |

### Open Technical Decisions to Resolve During Implementation

In accordance with PRD Section 5, the following implementation defaults require resolution during development Tasks `E01`–`E11` and are not claimed as pre-built:

* **SQLite driver & session store (`E02`):** Select the compatible SQLite driver, migration runner, and durable Express Session store after checking the target Node.js runtime on development machines.
* **Agent-facing REST credential (`E03`–`E04`) & P1 reviewer-bound elicitation channel (`E10`):** Define the project-scoped MCP-to-API credential for `P0` and the security-critical reviewer-bound verification transport for `P1` before enabling in-client elicitation approval.
* **Commit-association capture trigger (`E07`):** Prefer explicit agent-initiated `link_commit_to_decision` calls after normal developer commits, with optional dashboard linking or human confirmation controls.

### Explicit Non-Goals & Deferred Capabilities

To keep the engineering scope honest and verifiable, ProjectOS explicitly excludes:

* **No standalone coding agent or paid inference API:** ProjectOS never replaces the developer's IDE/agent and makes no independent LLM calls.
* **No automatic Git mutations:** ProjectOS never auto-commits, auto-pushes, creates experimental branches, or runs competing experimental architectures.
* **No claim of universal impact recall or runtime interception:** Static `ts-morph` analysis is scoped initially to JavaScript/TypeScript, does not guarantee complete runtime impact detection, and cannot forcibly block an external agent that holds direct local filesystem permissions.
* **Capabilities explicitly on hold:** Proof Engine, Cross-Agent Conflict Detection, Decision Comparison, automated testing/CI orchestration as a product feature, automatic architectural-violation detection, universal token optimization, Intent Drift Detector, Assumption Radar, MCP Tool Trust Sentinel, MCP RetryShield, and MCP Value Meter.

---

## Maintainer

**Prajwal Govekar** — [@prajwal-govekar17](https://github.com/prajwal-govekar17)
