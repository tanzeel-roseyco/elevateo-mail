# Codex, Devin and the four-model design workflow

Planning date: 2026-10-12. This is the requested execution policy for future implementation, not evidence that Devin or the Claude opinion agents have completed work. Use [capability-status.json](capability-status.json) for the actual observed state. The current task writes plans and performs public research; it does not activate mail or deploy the application.

## Roles and exact identities

| Role | Requested runtime/model | Required output |
| --- | --- | --- |
| Coordinator and first research assignment | Codex CLI / Codex | Evidence-led GitHub/Reddit scan; bounded task briefs, dependency graph, branches, reviews and integration evidence |
| System design and backend architecture | GPT-6 Astra, `gpt-6-astra`, effort `max` | Contracts, data/permission model, failure cases and an explicit synthesis of the three independent opinions |
| Second opinion | Claude Fable 5, `claude-fable-5` | Independent maintainability, implementation and product-contract review |
| Third opinion | Claude Opus 5.5, `claude-opus-5-5` | Independent UX/platform/performance and implementation review |
| Fourth opinion | Claude Fable 5.1, `claude-fable-5-1` | Independent adversarial correctness, architectural tradeoff and recovery review |
| Backend implementation | Devin through the authenticated official Devin MCP connection | Staff-level execution of bounded backend milestones with tests, commits, draft PRs and complete handoffs |
| Bounded issue repair | GPT-6 Astra, `gpt-6-astra`, effort `low` | Reproduction, minimal fix, regression evidence and a linked fix PR |
| Frontend | Separately started Fable 5 or Opus 5.5 | Reused local components, real API integration, browser/a11y evidence and coherent visual design |
| Every C++ and motion-design task | Opus 5.5 | Native boundary or Anime.js patch, measurements, reduced-motion handling and review |
| In-app agent connectors | Codex owns Codex adapter; Fable 5 owns Claude/Fable adapter | Separate supported protocol adapters plus shared consent, permissions and lifecycle contracts |

The role split is the user's requested workflow, not a benchmark claim that a model is universally best. OpenAI documents Astra's `low` and `max` effort options; Anthropic documents the three exact Claude identities, with Fable 5 listed as legacy. Account entitlement and successful execution are separate checks. [Astra](https://developers.openai.com/api/docs/models/gpt-6-astra), [Claude lineup](https://platform.claude.com/docs/en/models/overview), [Fable 5](https://platform.claude.com/docs/en/models/fable-5/overview).

## Capability preflight and truthful routing

1. Inspect available host tools, CLI versions and authenticated connections without reading or printing secret values. Verify model identifiers and returned execution identity. Never substitute a similarly named model silently.
2. Use an existing authorized native model runner when it supports the exact request. Otherwise use a documented, installed provider runner with its permission controls intact. The current native subagent catalog exposes OpenAI models, so it cannot directly spawn Claude by passing a made-up model enum.
3. Start the three opinion agents separately with the same task brief and no access to each other's initial answers. They may run sequentially when concurrency limits require it. Record actual session/execution IDs, model, effort if specified, input/base revision, result and evidence location.
4. If authentication, a model or a connection is unavailable, record that exact gap. Continue independent research and document preparation; keep the affected decision/implementation gate pending. Ask for an explicit replacement only if a substitute is needed. Do not manufacture opinions or silently count another Astra session as Fable.
5. Application/provider/signing credentials stay last. A missing agent account session is a tooling prerequisite, not permission to request production secrets, harvest a subscription token or change the user's authentication automatically.

Observed here: Codex CLI 0.159.3 is available; Claude CLI 2.1.241 exists. Separate Fable 5, Opus 5.5 and Fable 5.1 consultation attempts all exited before inference because the existing Claude OAuth session expired and could not refresh. No opinions were produced. Astra MAX was actually assigned the architecture task. The public Devin plugin search returned no match, the active tool catalog exposes no Devin tool, and the installed Codex MCP listing contains no Devin server. These observations are scoped to this session, not a claim that those products are unavailable generally.

## Codex → Devin setup contract

Use the official authenticated Streamable HTTP endpoint `https://mcp.devin.ai/mcp`. Its documented session tools include `devin_session_create`, `devin_session_interact` and `devin_session_gather`. Public DeepWiki documentation access is not an autonomous Devin session. Configure the connection only when its account/key and repository access are available; keep any key outside the repository. [Devin MCP](https://docs.devin.ai/work-with-devin/devin-mcp).

Illustrative Codex configuration to provision later, not an installed connection:

```toml
[mcp_servers.devin]
url = "https://mcp.devin.ai/mcp"
bearer_token_env_var = "DEVIN_API_KEY"
```

Verify the current client schema and organization requirements before applying this example. Codex supports environment-referenced bearer credentials; do not paste a real key into TOML. Discover the connected tool schemas before invoking them rather than copying invented request fields. [Codex MCP configuration](https://learn.chatgpt.com/docs/extend/mcp?surface=cli).

Before creating a Devin session, resolve the actual GitHub repository, base commit, allowed paths, disposable test environment, task dependencies and an approved cost/ACU bound. Reuse an existing task-tagged session when a creation result is uncertain; search/check before retrying creation. Store its ID and branch so network retries cannot spawn duplicate expensive jobs. No production credentials or live mail belong in Devin's task environment.

## Every-task consultation and synthesis

The next AI agent must use [the saved consultation launch handoff](consultations/README.md): a common evidence brief, separate Fable 5/Opus 5.5/Fable 5.1 prompts and an Astra MAX synthesis template. The latest user instruction leaves their actual launch to that next agent. No consultation was retried when these prompts were saved.

Use the [task brief](templates/task-brief.md) for each task, including bounded fix tasks. Astra MAX supplies the design question and required invariants. Separately request Fable 5, Opus 5.5 and Fable 5.1 opinions before accepting that task's implementation approach. The task, not each shell command or keystroke, is the review unit; split changed scope into a new task. Request fresh opinions when a change invalidates their assumptions.

Each opinion must identify assumptions, supported proposals, objections, a smaller alternative, affected contracts and concrete acceptance evidence. After receiving all three, Astra MAX records a decision with each suggestion accepted, adapted or rejected and why. Preserve unresolved dissent. Combine compatible ideas; select between conflicting database owners, client frameworks or retry semantics instead of installing all alternatives. Tests and measured behavior resolve disputes more strongly than a vote.

The five initial planning tasks are PLAN-RESEARCH, PLAN-ARCH, PLAN-AGENTS, PLAN-CLIENTS and PLAN-MAIL. The three independent CLI attempts used one shared packet requesting an opinion on each task; all were blocked before inference. Their synthesis is therefore **pending**, and the current architecture remains a proposal. Current-document editorial review by available agents may improve it but cannot replace the user's specified opinion gate.

## Branch, commit, PR and issue lifecycle

1. Codex creates an issue-backed task brief with a stable ID, exact base revision, dependencies and acceptance checks. Use a dedicated checkout/worktree per writer. Never let several agents edit the same uncoordinated checkout.
2. Use branch families such as `design/astra-max/<task>`, `devin/backend/<task>`, `frontend/fable/<task>`, `frontend/opus/<task>`, `fix/astra-low/<issue>` and `native/opus/<task>`. These are naming templates, not branches already created.
3. Devin completes one cohesive backend capability at a time: migrations/roles, authentication, mailbox API, send ledger, provider adapter, receiving, attachment pipeline, audit/recovery. It owns implementation quality, not authority to redesign contracts or deploy live infrastructure without review.
4. Commit coherent changes with tests and provenance. Open a draft PR describing the concrete behavior, source reuse, dependencies, migrations, verification and limitations. Attach created PRs to the coordinating Codex task where the host supports it. Keep implementation off `main` until its checks/review/merge gate is satisfied.
5. Assign adversarial reviews in at-most-200-line slices plus a separate design reviewer. Review the actual PR revision. Convert actionable findings into deduplicated GitHub issues in this repository using [the finding template](templates/review-finding.md): severity, code reference, reproduction, invariant, acceptance test and linked PR. Track unresolved findings without publishing secret data.
6. Dispatch Astra LOW to bounded repair issues with a known reproduction and narrow acceptance criteria. Reproduce first, add/fix the relevant regression, implement, rerun affected checks and open a fix PR. “Deploy Astra LOW” means dispatching the repair agent; it does not mean production deployment.
7. Escalate design changes, data-loss risks, auth/permission boundary changes, migration ambiguity or repeated failed repair attempts to Astra MAX and the same three-opinion workflow. Low effort is an initial routing setting, not a reason to accept inadequate reasoning or skip review.
8. An independent reviewer checks the fix and evidence at its final commit. The coordinator merges only after required checks, resolved blocking findings, current branch base and authorized merge scope. Honor branch protections; never use administrative bypass as a shortcut. Resolve issues only when their acceptance checks pass.
9. If stacked PRs are useful, record the dependency order and base branches. Rebase/merge dependents carefully and retest the actual integrated result. Do not merge child changes while their prerequisite contract is still provisional.

Autonomy covers routine implementation, tests, corrective commits, branches, draft PRs and review-derived issues within an assigned task. It does not grant purchases, destructive production migrations, broad permission changes, real sending, warmup or public deployment. Do not auto-assign or notify third parties outside the authorized project workflow.

## Quality, resources and stop conditions

Each brief includes allowed files, invariants, actual runnable checks, evidence location, time/cost/concurrency bounds and prohibited side effects. Derive these from the available account budget and task estimate; do not invent a unlimited subscription. Use the actual host's concurrency limit and stop idle sessions. Independent model opinions are explicit requested overhead: report cost/latency when available and do not silently omit them to economize.

Backend acceptance requires real PostgreSQL authorization/transaction tests, real local Auth/Storage, a durable fake provider, actual browser flows and restore evidence. Frontend and native acceptance follows [the client plan](CLIENTS_AND_CLI_CONNECTORS.md). Preserve the application's no-live-send profile in all build/review/fix environments. New dependencies require source/license review, pinning, compatibility checks and a documented benefit.

Stop the affected task and report a concrete blocker on unavailable required identities, missing mandatory opinions, irreconcilable contracts, unexpected production access, a destructive migration request outside scope or inability to reproduce a proposed fix safely. Continue unrelated authorized work. A stalled session is not completed work; a green unit suite is not end-to-end acceptance.
