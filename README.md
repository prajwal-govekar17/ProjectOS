<div align="center">

# ProjectOS

**An MCP-powered, decision-aware software engineering platform that connects AI coding agents with a project's approved architectural decisions, repository-grounded change-impact analysis, and Git history linked to the reasons behind code changes.**

*Project memory. Change awareness. Git traceability.*

<br/>

![React](https://img.shields.io/badge/React-20232A?style=for-the-badge&logo=react&logoColor=61DAFB)
![TypeScript](https://img.shields.io/badge/TypeScript-3178C6?style=for-the-badge&logo=typescript&logoColor=white)
![Vite](https://img.shields.io/badge/Vite-646CFF?style=for-the-badge&logo=vite&logoColor=white)
![Node.js](https://img.shields.io/badge/Node.js-339933?style=for-the-badge&logo=nodedotjs&logoColor=white)
![Express](https://img.shields.io/badge/Express-000000?style=for-the-badge&logo=express&logoColor=white)
![SQLite](https://img.shields.io/badge/SQLite-003B57?style=for-the-badge&logo=sqlite&logoColor=white)
![Zod](https://img.shields.io/badge/Zod-3E67B1?style=for-the-badge&logo=zod&logoColor=white)
![Git](https://img.shields.io/badge/Git-F05032?style=for-the-badge&logo=git&logoColor=white)
![MCP](https://img.shields.io/badge/MCP-Protocol-4A154B?style=for-the-badge)
![AWS](https://img.shields.io/badge/AWS-232F3E?style=for-the-badge&logo=amazonwebservices&logoColor=white)

</div>

---

## Table of Contents

- [The Problem](#the-problem)
- [The Solution](#the-solution)
- [Who ProjectOS Is For](#who-projectos-is-for)
- [System Architecture](#system-architecture)
- [User Flow](#user-flow)
- [Feature One -- Project Brain](#feature-one----project-brain)
- [Feature Two -- Change Impact Intelligence](#feature-two----change-impact-intelligence)
- [Feature Three -- AI Git Timeline](#feature-three----ai-git-timeline)
- [Why the Features Belong Together](#why-the-features-belong-together)
- [End-to-End Workflow](#end-to-end-workflow)
- [Technology Stack](#technology-stack)
- [How AI and MCP Responsibilities Are Divided](#how-ai-and-mcp-responsibilities-are-divided)
- [What Human Approval Really Means](#what-human-approval-really-means)
- [Novelty and Competitive Landscape](#novelty-and-competitive-landscape)
- [Design Principles](#design-principles)
- [Why ProjectOS](#why-projectos)

---

## The Problem

AI coding agents can inspect and edit source code, but a codebase rarely explains the choices that shaped it. Architectural constraints, rejected approaches, design tradeoffs, and human-approved decisions live scattered across chat histories, meetings, documents, and developer memory.

This creates three recurring problems in AI-assisted development:

**Decision context gets lost.** An agent joining a project -- or starting a fresh session -- may not know why the team chose a particular database, authentication strategy, or architecture. It can recommend or implement a technically plausible solution that directly conflicts with a previous, approved decision.

**Change consequences are difficult to see before editing.** A request that sounds local can touch several code modules or invalidate an existing decision. Developers need evidence about affected imports, references, files, and dependent components before agreeing to a change. General AI guesses alone are not sufficient.

**Git records changes more clearly than reasons.** Git reliably records commits, authors, diffs, and changed files. It does not automatically preserve the project-level reasoning or human approval that motivated those changes. After several months -- or after switching agents -- a developer may see *what* changed but struggle to answer *why*.

> **The central problem:** AI-assisted coding needs continuity of intent, an evidence-backed view of proposed change impact, and durable traceability between decisions and actual code changes.

---

## The Solution

ProjectOS connects three capabilities into one integrated workflow:

1. **Project Brain** -- stores the project's authoritative, human-approved decisions, rationales, constraints, and decision history.
2. **Change Impact Intelligence** -- examines the actual repository before a significant change and identifies potentially affected files, relationships, and decisions, distinguishing evidence from AI prediction.
3. **AI Git Timeline** -- connects real Git commits and changed files to the approved decisions and explanations behind them, so the history remains understandable.

These three features reference the **same project decision records**. They do not each maintain their own unrelated memory or produce disconnected reports.

The developer's external AI agent communicates with ProjectOS through **Model Context Protocol (MCP)**. A local ProjectOS MCP server accesses the local repository and works with the backend's saved project state. A separate React dashboard lets the developer inspect evidence and approve or reject meaningful changes in architectural intent.

**Before changing code, recover approved intent and inspect likely impact. After changing code, connect the real Git change back to its approved reason.**

ProjectOS is **not** an AI coding agent itself. The developer continues using their existing MCP-compatible agent (Claude Code, Codex, Antigravity, or any other compatible client). ProjectOS supplies that agent with structured project context and repository evidence through MCP, while the human controls significant architectural decisions through a dashboard.

---

## Who ProjectOS Is For

- Developers working on existing or evolving codebases with an AI coding agent.
- Developers who alternate between compatible tools (Claude Code, Codex, Antigravity) and need shared decision context that survives agent switches.
- Small software teams that want the reasons for important design choices to remain accessible beyond the original author or chat session.
- People using AI-assisted or "vibe coding" workflows who want visibility into proposed changes and the reasoning behind previous implementation choices.

Agent and provider neutrality is central. ProjectOS is designed for **MCP-compatible clients**, not for a particular model or IDE.

---

## System Architecture

<div align="center">

![ProjectOS System Architecture](assets/projectos-architecture.png)

</div>

The architecture is organized into four layers connected by three well-defined interfaces:

```mermaid
flowchart TD
    subgraph L1["LAYER 1 -- Developer + Agent"]
        DEV["Developer\nDefines request, reviews decisions"]
        AGENT["AI Coding Agent\nCodex / Claude Code / Antigravity"]
    end

    subgraph L2["LAYER 2 -- MCP + Repository"]
        MCP["ProjectOS MCP Server\nTypeScript MCP SDK"]
        TSM["ts-morph\nJS/TS static analysis"]
        GIT["Git CLI\nCommits, diffs, history"]
        REPO["Local Git Repository"]
    end

    subgraph L3["LAYER 3 -- Backend + Database"]
        API["Express REST API\nExpress.js 5, TypeScript"]
        BRAIN_LOGIC["Project Brain Logic\nDecision lifecycle, approvals"]
        ZOD["Zod Validation\nRuntime request validation"]
        DB["SQLite Database\nDecisions, proposals, Git links"]
    end

    subgraph L4["LAYER 4 -- Web Dashboard"]
        DASH["React Dashboard\nTypeScript, Vite"]
        PBV["Project Brain View\nDecision review and approval"]
        IG["Impact Graph\nReact Flow visualization"]
        AIGT["AI Git Timeline\nCommit-to-decision explorer"]
    end

    AGENT -- "MCP Protocol" --> MCP
    MCP --> TSM
    MCP --> GIT
    TSM --> REPO
    GIT --> REPO
    MCP -- "REST / HTTPS" --> API
    API --> BRAIN_LOGIC
    API --> ZOD
    BRAIN_LOGIC --> DB
    DASH -- "REST / HTTPS" --> API
    DASH --> PBV
    DASH --> IG
    DASH --> AIGT

    style L1 fill:#f3e8ff,stroke:#7c3aed,stroke-width:2px
    style L2 fill:#fef3c7,stroke:#d97706,stroke-width:2px
    style L3 fill:#dbeafe,stroke:#2563eb,stroke-width:2px
    style L4 fill:#dcfce7,stroke:#16a34a,stroke-width:2px
```

### Layer 1 -- Developer + Agent

The developer defines the request, reviews architectural decisions, and remains accountable for whether a change should proceed. Their AI coding agent (an external LLM such as Codex, Claude Code, or Antigravity) interprets the request, calls MCP tools when configured, and performs coding through its ordinary IDE/terminal workflow.

**Interface:** The agent communicates with the local ProjectOS MCP server via **MCP**.

### Layer 2 -- MCP + Repository

The **ProjectOS MCP Server** is the standardized, agent-facing tool layer, implemented with the official TypeScript MCP SDK. It coordinates requests for project decisions, proposals, impact evidence, and decision-linked commit information.

Two local analysis engines operate directly against the developer's repository:

- **ts-morph** -- deterministic code intelligence for supported TypeScript/JavaScript source relationships (imports, references, dependencies). It is not an AI model.
- **Git CLI** -- factual commit hashes, diffs, changed files, and repository history.

**Interface:** The MCP server communicates with the Express backend via **REST over HTTP(S)**.

### Layer 3 -- Backend + Database

The **Express REST API** (Express.js 5, TypeScript) serves as the application backend for both the MCP service and the dashboard. It manages:

- **Project Brain logic** -- decision lifecycle, approved state, rationale/history, and relations to proposals, impact reports, and Git links.
- **Zod validation** -- runtime request validation at every boundary.
- **Authentication and authorization** -- protected human approval operations; a model-callable tool cannot approve a decision through the API.
- **SQLite database** -- persistent decision records, statuses, approval history, selected impact metadata, and explicit commit-to-decision links.

The backend is the source of truth for whether a proposal is approved.

**Interface:** The React dashboard retrieves and submits application data via the backend's **authenticated REST APIs**.

### Layer 4 -- Web Dashboard

The **React dashboard** (TypeScript, Vite) is the human review surface with three integrated views:

- **Project Brain View** -- inspect current decisions and history, review pending proposals, approve or reject with authorized user interaction.
- **Impact Graph (React Flow)** -- visualize affected code relationships, components, decisions, and evidence categories.
- **AI Git Timeline** -- explore commits, changed files, and their associated approved reasoning.

### Architecture Interfaces Summary

| From | To | Protocol | Purpose |
| --- | --- | --- | --- |
| External coding agent | Local ProjectOS MCP server | **MCP** | Read project context and request ProjectOS capabilities |
| Local ProjectOS MCP server | Shared Express backend | **REST / HTTPS** | Retrieve and store decisions, proposals, reports, and Git links |
| React dashboard | Shared Express backend | **REST / HTTPS** | Display project state and perform human-authorized actions |

> **Important deployment boundary:** Even when the backend and dashboard run remotely, the coding agent, local MCP server, ts-morph, Git CLI, and actual local repository remain on the developer's machine. The remote backend cannot directly inspect the developer's local source files.

---

## User Flow

The following diagram captures the complete user workflow across four phases, from initial setup through traceable Git history.

```mermaid
flowchart LR
    subgraph P1["01 SETUP + RETRIEVE"]
        A["Connect repo + MCP\nScan dependencies"]
        B["Project Brain\nHuman-approved context"]
        C["Request change\nAgent retrieves context via MCP"]
        A --> B --> C
    end

    subgraph P2["02 ANALYZE"]
        D["Change Impact Intelligence\nFiles, dependencies, decisions"]
        E["Impact report\nVerified vs predicted\nPossible decision conflicts"]
        D --> E
    end

    subgraph P3["03 DECIDE"]
        F{"Human review:\nChange or add\na decision?"}
        G["Submit pending proposal\nwith rationale via MCP"]
        H{"Human approves?\nProjectOS dashboard"}
        I["Save approved decision\nSupersede old if applicable"]
        J["Keep decision\nRevise and re-analyze"]
        F -- "New / Changed" --> G --> H
        H -- "Approve" --> I
        H -- "Reject" --> J
    end

    subgraph P4["04 RECORD"]
        K["Agent implements\nreviewed plan"]
        L["Developer reviews,\ntests and commits"]
        M["AI Git: explicit link\nDecision ID to commit"]
        N["Inspect WHY / history\nNext agent retrieves\nupdated context via MCP"]
        K --> L --> M --> N
    end

    C --> D
    E --> F
    F -- "No decision change" --> K
    I --> K
    J -- "Redesign" --> D

    style P1 fill:#f3e8ff,stroke:#7c3aed,stroke-width:2px
    style P2 fill:#fef3c7,stroke:#d97706,stroke-width:2px
    style P3 fill:#dcfce7,stroke:#16a34a,stroke-width:2px
    style P4 fill:#dbeafe,stroke:#2563eb,stroke-width:2px
```

**Color key:** Purple = Setup and Retrieval | Amber = Analysis | Green = Decision and Approval | Blue = Record and Traceability

---

## Feature One -- Project Brain

Project Brain acts as the authoritative memory of significant project-level decisions -- not a raw conversation transcript, prompt history, or generic document folder.

For each decision, it preserves:

- A stable decision identifier and title.
- The approved choice and its scope.
- The *reason* for making that choice.
- Important tradeoffs, constraints, and assumptions.
- Current status and change history.
- Who approved the decision and when.
- Related modules, components, files, or code references where known.
- Relationships to older decisions that have been superseded.

### Decision Lifecycle

```mermaid
stateDiagram-v2
    [*] --> Proposed : Developer or agent suggests

    Proposed --> Approved : Human approves via dashboard
    Proposed --> Rejected : Human rejects via dashboard

    Approved --> Superseded : Newer decision approved

    Rejected --> [*] : Retained as historical record
    Superseded --> [*] : Retained as historical record
    Approved --> [*] : Active policy

    note right of Proposed
        AI agents can submit proposals
        but cannot approve them
    end note

    note right of Approved
        Only an authorized human
        can move a decision here
    end note
```

| Status | Meaning |
| --- | --- |
| **Proposed / Pending** | A developer or coding agent suggests a new or changed decision. It is not yet authoritative. |
| **Approved** | An authorized developer explicitly accepts it in the ProjectOS dashboard. Compatible agents can use it as current project context. |
| **Rejected** | The proposal was considered but not adopted; it must not be treated as active architectural policy. |
| **Superseded** | A previously approved decision has been replaced by a newer human-approved decision. The earlier rationale remains in the historical record. |

**Only an authorized human can approve architectural decisions.** An AI agent may retrieve decisions and submit proposals through MCP, but it cannot approve its own proposal.

### Example

Consider a product repository with this recorded decision:

> **DEC-014 -- Database architecture**
> Approved choice: PostgreSQL
> Reason: Relational orders, transactional consistency, and an existing SQL-based data model
> Status: Approved

If a future coding agent is asked to introduce MongoDB, it can retrieve DEC-014 from Project Brain and see that this is a **change to an approved architectural decision**, not merely a library substitution. If the human later approves a migration, a new decision supersedes DEC-014 without destroying its history.

---

## Feature Two -- Change Impact Intelligence

Change Impact Intelligence answers one question:

**"Before we implement this proposed change, what parts of the project could be affected, and why?"**

Its value comes from looking at the **actual repository**, not just comparing two sentences, reading a decision list, or asking an LLM to invent a likely file list.

The local analyzer uses **ts-morph** to inspect supported JavaScript/TypeScript structures such as imports, references, and dependency relationships. Git CLI and repository evidence complement that inspection. Project Brain contributes approved decisions and known relationships between decisions and components.

The connected agent's LLM may then interpret those findings and suggest possible indirect effects. Those suggestions remain visibly different from confirmed code evidence.

### What an Impact Report Communicates

- Files and symbols directly connected to the proposed change, supported by source inspection.
- Modules and components with known code relationships.
- Approved decisions that the proposed change touches, contradicts, or may supersede.
- The specific evidence or relationship behind each finding.
- Possible indirect consequences suggested by the coding agent, explicitly marked as **predictions**.
- Uncertainty or areas that need developer review.

### Evidence Categories

```mermaid
flowchart LR
    subgraph VERIFIED["Verified Evidence"]
        VR["Repository Relationship\nConfirmed by source or Git"]
        PR["Project Relationship\nPresent in Project Brain"]
    end

    subgraph UNVERIFIED["Requires Judgment"]
        AI["AI Prediction\nPlausible but unconfirmed"]
        UK["Unknown / Needs Review\nCannot establish confidently"]
    end

    VR -- "highest confidence" --> PR
    PR -- "recorded context" --> AI
    AI -- "needs confirmation" --> UK

    style VERIFIED fill:#dcfce7,stroke:#16a34a,stroke-width:2px
    style UNVERIFIED fill:#fef3c7,stroke:#d97706,stroke-width:2px
```

| Category | Meaning | Example |
| --- | --- | --- |
| **Verified repository relationship** | A relationship confirmed by available source or Git evidence | One TypeScript module directly imports another |
| **Recorded project relationship** | A relationship present in saved Project Brain context | A database decision explicitly applies to the persistence module |
| **AI prediction** | A plausible effect suggested by the connected agent, not confirmed by static analysis | A session subsystem might depend on transactional database behavior |
| **Unknown / needs review** | A part of the system that the analysis cannot establish confidently | Runtime service relationships not visible through supported static imports |

### The Impact Graph

The React dashboard includes an **Impact Graph** built with **React Flow**. It makes the change's relationships understandable visually: which file depends on which module, which decisions apply to which components, and which findings are verified versus speculative.

The developer can inspect the relevant affected area, see source-backed evidence, and distinguish direct relationships from predicted impacts.

### Example

A connected product repository considering a **PostgreSQL to MongoDB** migration. An illustrative impact report:

| Candidate Impact | Why It Appears | Classification |
| --- | --- | --- |
| `src/db/client.ts` | PostgreSQL client/configuration found in source | Verified file evidence |
| `src/orders/repository.ts` | Imports or references the persistence layer | Verified dependency |
| `db/migrations/` | SQL migration files or configuration are present | Verified repository evidence |
| `DEC-014` | Existing approved choice is PostgreSQL | Recorded decision evidence |
| Authentication/session behavior | May depend on database behavior | Prediction pending confirmation |

### Honest Limitation

Static analysis cannot discover every runtime dependency, dynamic import, external service effect, or architectural consequence. Advanced source analysis is initially bounded to supported **JavaScript/TypeScript** code. ProjectOS does not advertise impact results as a proof of correctness or universal change coverage.

---

## Feature Three -- AI Git Timeline

AI Git Timeline answers:

**"This real commit or changed file exists. Which approved decision and recorded reason explain why the change was made?"**

It builds on **Git**, rather than replacing Git. The Git CLI supplies factual commit hashes, file histories, and diff information. ProjectOS records explicit associations between those real Git references and Project Brain decision IDs.

```mermaid
flowchart LR
    COMMIT["Git Commit\na82f1c"] --> FILES["Changed Files\nsrc/db/client.ts"]
    FILES --> LINK["Decision Link\nDEC-015"]
    LINK --> DECISION["Approved Decision\nMigrate persistence to MongoDB"]
    DECISION --> RATIONALE["Recorded Rationale\nDocument-oriented data model\nsupersedes PostgreSQL choice"]

    DECISION --> HISTORY["Decision History\nSuperseded DEC-014"]

    style COMMIT fill:#dbeafe,stroke:#2563eb,stroke-width:2px
    style FILES fill:#dbeafe,stroke:#2563eb,stroke-width:2px
    style LINK fill:#fef3c7,stroke:#d97706,stroke-width:2px
    style DECISION fill:#dcfce7,stroke:#16a34a,stroke-width:2px
    style RATIONALE fill:#dcfce7,stroke:#16a34a,stroke-width:2px
    style HISTORY fill:#f3e8ff,stroke:#7c3aed,stroke-width:2px
```

### What Users Can Explore

- A timeline of actual repository commits.
- The files changed in a selected commit.
- A linked, approved Project Brain decision, where one was recorded.
- That decision's rationale, scope, author/approver, and history.
- Links in both directions: decision to related commits, and commit/file to recorded decision.
- A clear distinction between a suggested decision association and a human-confirmed association.

### Example

> **Git commit:** `a82f1c`
> **Changed file:** `src/db/client.ts`
> **Related decision:** `DEC-015 -- Migrate persistence to MongoDB`
> **Recorded why:** The team approved a new document-oriented data model and explicitly superseded the previous PostgreSQL choice.
> **Result:** Selecting the commit or file change opens the linked explanation instead of showing only a diff.

### What AI Git Timeline Does Not Do

- It does not create separate experimental branches.
- It does not generate multiple architectures and compare them.
- It does not automatically make code commits or perform Git merges.
- It does not silently rewrite Git history.

It uses the developer's ordinary Git workflow and adds the **decision-to-change explanation** that Git does not inherently store.

---

## Why the Features Belong Together

```mermaid
flowchart TD
    DECISION["One Authoritative\nDecision Record"]

    DECISION --> BEFORE["BEFORE the change\nProject Brain\nRetrieve approved intent"]
    DECISION --> DURING["DURING review\nChange Impact Intelligence\nInspect likely effects"]
    DECISION --> AFTER["AFTER the change\nAI Git Timeline\nTrace commit to reason"]

    BEFORE --> INTEGRATED["Integrated Product\nNot three disconnected tools"]
    DURING --> INTEGRATED
    AFTER --> INTEGRATED

    style DECISION fill:#fef3c7,stroke:#d97706,stroke-width:2px
    style BEFORE fill:#f3e8ff,stroke:#7c3aed,stroke-width:2px
    style DURING fill:#dcfce7,stroke:#16a34a,stroke-width:2px
    style AFTER fill:#dbeafe,stroke:#2563eb,stroke-width:2px
    style INTEGRATED fill:#f1f5f9,stroke:#475569,stroke-width:2px
```

| Developer's Question | ProjectOS Feature |
| --- | --- |
| What is our current architectural decision? | Project Brain |
| Why did the team choose it? | Project Brain |
| Who approved a replacement and what did it supersede? | Project Brain |
| Before changing this feature, which files/modules/decisions might be affected? | Change Impact Intelligence |
| What source evidence supports an impact warning? | Change Impact Intelligence |
| Which commits actually implemented this decision? | AI Git Timeline |
| Why was this particular commit or file change made? | AI Git Timeline, linking back to Project Brain |

One authoritative decision record is used at three points in the development lifecycle: **before** the proposed change, **during** human decision review, and **after** the actual Git change.

This is what makes ProjectOS an integrated product instead of an instructions manager plus an unrelated dependency graph plus a Git history viewer.

---

## End-to-End Workflow

This is the canonical story that connects everything in the architecture:

1. **The developer is working in a normal AI coding tool.** They have a repository and have connected the ProjectOS MCP server to a compatible coding agent.

2. **Project Brain already holds approved context.** For example, a target application has an approved PostgreSQL architecture decision with its rationale and constraints.

3. **The developer requests an architectural change.** They ask the agent to migrate the target application to MongoDB.

4. **The agent consults ProjectOS through MCP.** It retrieves the current decision and relevant history instead of depending only on the present chat session.

5. **Change Impact examines the repository.** Local source analysis and Git/repository evidence identify affected files, modules, and existing decisions. Any additional agent reasoning is marked as prediction.

6. **The agent submits a pending proposal.** It describes the intended replacement decision, rationale, and relevant impact findings. The saved project decision has **not** changed yet.

7. **The developer reviews it on the dashboard.** The developer inspects the decision, affected areas, and evidence. They approve or reject the proposed architectural change.

8. **Authorized approval updates Project Brain.** If approved, the new decision becomes active and the old decision is retained as superseded. If rejected, the proposal never becomes current policy.

9. **The agent and developer edit the normal codebase.** The existing coding tool performs code changes under its ordinary edit permissions. ProjectOS does not secretly edit files, run branch experiments, or bypass IDE confirmation.

10. **A real Git commit is made.** Git retains the actual change details and commit hash.

11. **AI Git records the link.** The commit and relevant changed files are associated with the approved decision. Selecting it in the dashboard reveals the documented reason.

12. **Another coding session can recover the new context.** A compatible agent connected to the same ProjectOS project can retrieve the current approved decision rather than relying on its own potentially outdated session memory.

---

## Technology Stack

### Frontend

![React](https://img.shields.io/badge/React-20232A?style=flat-square&logo=react&logoColor=61DAFB)
![TypeScript](https://img.shields.io/badge/TypeScript-3178C6?style=flat-square&logo=typescript&logoColor=white)
![Vite](https://img.shields.io/badge/Vite-646CFF?style=flat-square&logo=vite&logoColor=white)
![React Flow](https://img.shields.io/badge/React_Flow-FF0072?style=flat-square)

**React.js, TypeScript, Vite, React Flow**

Reusable decision/Git views, typed data, static builds and interactive impact graphs. React Flow powers the visual Impact Graph for exploring affected files, modules, and decision relationships.

### Backend

![Node.js](https://img.shields.io/badge/Node.js-339933?style=flat-square&logo=nodedotjs&logoColor=white)
![Express](https://img.shields.io/badge/Express_5-000000?style=flat-square&logo=express&logoColor=white)
![TypeScript](https://img.shields.io/badge/TypeScript-3178C6?style=flat-square&logo=typescript&logoColor=white)
![Zod](https://img.shields.io/badge/Zod-3E67B1?style=flat-square&logo=zod&logoColor=white)

**Node.js, Express.js 5, TypeScript, Zod**

Shared TypeScript runtime, REST APIs, validated inputs and human approval controls. Zod provides runtime validation at every data boundary.

### Database

![SQLite](https://img.shields.io/badge/SQLite-003B57?style=flat-square&logo=sqlite&logoColor=white)

**SQLite**

Stores architectural decisions, impact reports and Git links without a separate database server. Relational storage for approved decisions, proposals, approval history, and commit-to-decision associations.

### AI / LLM

![LLM](https://img.shields.io/badge/Agent--Agnostic-LLM_Reasoning-8B5CF6?style=flat-square)

**Agent-agnostic LLM reasoning**

Connected coding agents interpret proposed changes without requiring a separately hosted model. There is no dedicated ProjectOS-hosted LLM or proprietary trained model.

### MCP Integration

![MCP](https://img.shields.io/badge/MCP-Official_TypeScript_SDK-4A154B?style=flat-square)

**Model Context Protocol, Official TypeScript MCP SDK**

Standardized agent access to Project Brain, Change Impact Intelligence and AI Git. The center of the product's agent integration, enabling any compatible coding agent to retrieve and contribute project context.

### Code Intelligence

![ts-morph](https://img.shields.io/badge/ts--morph-3178C6?style=flat-square&logo=typescript&logoColor=white)
![Git](https://img.shields.io/badge/Git_CLI-F05032?style=flat-square&logo=git&logoColor=white)

**ts-morph, Git CLI**

ts-morph traces real JS/TS dependencies; Git CLI retrieves actual commits, diffs, and file changes. Both operate locally against the developer's repository.

### Cloud (Planned)

![AWS EC2](https://img.shields.io/badge/AWS_EC2-FF9900?style=flat-square&logo=amazonec2&logoColor=white)
![Amazon EBS](https://img.shields.io/badge/Amazon_EBS-232F3E?style=flat-square&logo=amazonwebservices&logoColor=white)

**AWS EC2, Amazon EBS**

EC2 hosts the shared application; EBS preserves SQLite data. This is the intended deployment arrangement for the shared backend/dashboard, not a replacement for the locally running MCP server.

### APIs and Security

![REST](https://img.shields.io/badge/REST-HTTPS-009688?style=flat-square)
![Express Sessions](https://img.shields.io/badge/Express-Sessions-000000?style=flat-square&logo=express&logoColor=white)

**REST over HTTPS, Express Sessions**

REST connects components; sessions maintain developer login, with approvals protected by Express. Ensures an AI proposal is not equivalent to human approval.

---

## How AI and MCP Responsibilities Are Divided

| Component | Contribution |
| --- | --- |
| **Connected coding agent and its LLM** | Interprets natural-language tasks, reasons about evidence and potential consequences, and writes code through its existing coding environment |
| **ProjectOS MCP server** | Exposes standardized tools, retrieves approved state, handles pending proposals, and returns local repository/Git findings |
| **ts-morph** | Deterministically extracts supported JavaScript/TypeScript relationships; it is not an AI model |
| **Git CLI** | Supplies factual commit hashes, diffs, and repository history |
| **ProjectOS backend / SQLite** | Keeps durable decisions, statuses, approval records, reports, and commit links |
| **React dashboard** | Displays project knowledge and evidence, and provides authorized human decision approval |

There is **no dedicated ProjectOS-hosted LLM, proprietary trained model, or required separate model API** in this design. The external agent provides the AI reasoning, and the protocol remains provider-neutral.

---

## What Human Approval Really Means

ProjectOS approval is not the same as an editor asking "Allow this AI to modify a file?"

| Coding Tool / IDE Permission | ProjectOS Architectural Approval |
| --- | --- |
| Allows or denies a file edit, terminal action, or tool operation | Approves or rejects a change to the project's recorded architectural intent |
| Exists within the coding environment | Exists in Project Brain and is enforced through the authenticated backend |
| Usually applies to an immediate operation | Persists as a decision other agents can retrieve later |
| Does not explain why an architecture changed | Preserves rationale, history, and the decision-to-Git relationship |

The developer may reject an architectural proposal even when the coding agent technically has file-write permission. Conversely, approving a ProjectOS decision does not grant the agent unrestricted filesystem privileges.

---

## Novelty and Competitive Landscape

### Competitive Comparison

| Capability | Existing Solutions | ProjectOS |
| --- | --- | --- |
| **Decision Continuity** | **ProjectMem** -- Persistent cross-agent memory, decision history and pre-commit warnings | Preserves approved architectural decisions and their rationale to inform future development |
| **Change Impact Analysis** | **GitNexus** -- Codebase dependency mapping and pre-change impact analysis | Identifies affected files, dependencies and approved decisions, distinguishing verified evidence from AI predictions |
| **Decision Governance** | **AsDecided** -- Architectural decision management, read-only MCP access and compliance checks | Enables impact-informed decision proposals with explicit human approval or rejection |
| **Implementation Traceability** | **Entire** -- Links AI coding sessions, prompts and reasoning to Git history | Links actual Git commits and changed files to human-approved architectural decisions and their rationale |
| **Technology Integration** | Overlapping capabilities across memory, impact analysis, governance and traceability tools | Unifies architectural context, pre-change impact analysis, human approval and Git provenance through MCP |

### What Sets ProjectOS Apart

ProjectOS combines four capabilities that existing tools address only in isolation:

**Decision-Centric Memory** -- Persistent project memory that preserves approved architectural decisions, their reasoning and evolution, rather than just conversation history or instructions.

**Decision-Aware Impact Analysis** -- Combines repository dependency analysis with approved decisions to reveal potential impacts before implementation. Evidence is distinguished from prediction.

**Impact-Informed Human Governance** -- Developers review potential consequences before approving, revising or retaining architectural decisions. The review is informed by actual repository evidence, not just the proposal text.

**Cross-Agent Decision Traceability** -- Connects Git changes to approved decisions and makes their reasoning accessible across coding agents through MCP. The same project context survives switching agents, sessions, and contributors.

---

## Design Principles

1. **MCP-native usefulness** -- the external coding agent must be able to retrieve and contribute meaningful context through MCP, not just view a web dashboard.
2. **Human-authoritative decisions** -- AI proposals never become approved context by themselves.
3. **Evidence before speculation** -- a verified import or Git commit is a fact; an LLM's suggested indirect effect is a hypothesis.
4. **One source of truth** -- Project Brain holds decisions once; Change Impact and AI Git link to them.
5. **Real Git, not simulated Git** -- changes must correspond to the user's actual repository and normal Git history.
6. **Agent-agnostic continuity** -- different compatible coding agents can recover the same saved project reasoning without copying chat transcripts.
7. **Local repository access** -- code scanning and Git access stay close to the developer's local repo; remote services operate on shared records exposed through controlled APIs.
8. **Explainability** -- a commit/file explanation must point to a recorded decision and rationale when available, not pretend the model knows an unknowable past intent.
9. **Honest scope** -- useful JS/TS analysis with known limitations is more credible than promising universal impact detection.

---

## Why ProjectOS

The main value is the **continuity across decisions, planned changes, and actual code history**:

- An agent can ask what the team already decided and why.
- Before implementing a major new request, the developer can inspect source-grounded likely effects instead of trusting a free-form AI guess.
- A significant decision change is made explicit and approved by a person.
- An actual Git commit carries a navigable relationship to that decision's reason.
- A different agent or future contributor can recover the same approved intent and change history.

The differentiator is the **joined, evidence-aware MCP workflow**: one decision record, used for context retrieval, change-impact analysis, and Git traceability, connected through a standard protocol that works with the developer's existing coding agent.

> ProjectOS adds decision awareness to AI-assisted development. It lets coding agents retrieve human-approved project context through MCP, analyzes likely effects of proposed changes using real repository evidence, and connects completed Git commits to the decisions that motivated them. Developers remain in control of architectural approval, while their project reasoning stays traceable across sessions and compatible agents.
