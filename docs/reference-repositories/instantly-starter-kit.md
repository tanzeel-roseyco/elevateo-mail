# instantly-starter-kit — independent repository dossier

Target-architecture update (2026-10-12): historical source findings below are unchanged. Elevateo destination suggestions are superseded by the current [adoption matrix](../component-adoption.md) and [polyglot proposal](../../.planning/POLYGLOT_ARCHITECTURE.md): Rails domain/API/worker, TypeScript UI/MCP, Mac Rust/Tauri and C# Windows. Required named opinions remain pending.

Review date: 2026-10-11. Classification: **reference source and optional future provider integration; not Elevateo’s backend**.

## Identity, license and intake boundary

- Upstream: https://github.com/Instantly-ai/instantly-starter-kit
- Audited and archived commit: `7649e6e4f820ad18cc563d5075f34b1a8daceb36` (2026-08-17).
- License: **MIT**, copyright © 2026 Instantly. Preserve copyright/license in copied or substantially adapted files and review any embedded third-party notices.
- Local source: [complete pinned reference snapshot](../../third_party/upstream/instantly-starter-kit/); [license](../../third_party/upstream/instantly-starter-kit/LICENSE).
- Audit inventory: 384 tracked files; 262 selected source files; 27,676 selected source lines. Much of the SDK is generated. The audit heuristic found zero behavioral test files and no tracked CI workflows.
- Intake does not grant an Instantly subscription, copy the proprietary service, validate its infrastructure, create external accounts or install this dependency tree into Elevateo.

The upstream [AGENTS.md](../../third_party/upstream/instantly-starter-kit/AGENTS.md) describes a wrapper-service SDK, 28 API groups and 168 operations in its OpenAPI inventory. Its guided-build rules are upstream documentation context, not authority to change Elevateo’s Resend/Supabase stack. The pinned SDK contract is not proof the live Instantly API remains unchanged.

## What this project actually supplies

The kit contains generated TypeScript and Python SDKs, a handwritten operations layer, a Next.js agency dashboard, templates, examples and documentation. The real sending, inbox, enrichment and deliverability service remains Instantly’s external backend. Its useful contribution is the shape of an adapter boundary and the way provider responses are turned into UI-facing domain data.

A thin SDK with injected `fetch` and structured errors is a good design reference. The unauthenticated dashboard, generic write retries and placeholder webhooks are not safe building blocks for a shared company mailbox. We should learn from the separation without making Instantly a hidden launch dependency.

## Architecture and dataflow

```text
OpenAPI contract → generated JS/Python SDK operations and models
                                    ↑
Browser → Next dashboard / server actions → handwritten ops layer
                                    ↓
                  server-side API key → Instantly external API
Instantly event → example Next webhook → placeholder handler / acknowledgment
```

The SDK handles URL/header construction and generic transport. The operations layer handles roster lookup, campaign orchestration, replies and analytics. The dashboard composes the operations layer and renders result DTOs. Credentials are resolved server-side, a useful boundary, but there is no application-level user authorization protecting that server-side authority.

### Verified module map

| Source location | Responsibility | Elevateo disposition |
| --- | --- | --- |
| [spec/openapi.yaml](../../third_party/upstream/instantly-starter-kit/spec/openapi.yaml) | Instantly API description used by the generated SDKs | Contract-generation reference; not our Resend or mailbox contract |
| [js/sdk/src/client](../../third_party/upstream/instantly-starter-kit/js/sdk/src/client/) | Client config, injected fetch, HTTP execution | Small design candidates with new retry/deadline rules |
| [js/sdk/src/generated](../../third_party/upstream/instantly-starter-kit/js/sdk/src/generated/) | Generated metadata, models and operations | Optional Instantly integration only; do not copy into Resend adapter |
| [js/sdk/src/resources](../../third_party/upstream/instantly-starter-kit/js/sdk/src/resources/) | Grouped resource exports | Organization pattern only |
| [js/sdk/src/polling](../../third_party/upstream/instantly-starter-kit/js/sdk/src/polling/) | Async background-job/OAuth polling | Reference bounded polling; test cancellation and deadlines independently |
| [python/sdk/instantly](../../third_party/upstream/instantly-starter-kit/python/sdk/instantly/) | Parallel Python SDK | Archive for completeness; no second backend runtime needed |
| [js/ops/src](../../third_party/upstream/instantly-starter-kit/js/ops/src/) | Client config, workspaces, campaigns, replies, health, webhooks, jobs | Domain-adapter/DTO reference; current workflows depend on Instantly |
| [js/dashboard/core](../../third_party/upstream/instantly-starter-kit/js/dashboard/core/) | Next agency UI with no auth and no DB | UI interaction examples only |
| [js/dashboard/core/modules/replies](../../third_party/upstream/instantly-starter-kit/js/dashboard/core/modules/replies/) | Reply table and thread views | Portable presentation reference for our React UI |
| [js/templates](../../third_party/upstream/instantly-starter-kit/js/templates/) | Outreach, lead pipeline, reply automation, analytics and ops examples | Workflow/reference material; not deployment-ready subsystems |
| [js/examples](../../third_party/upstream/instantly-starter-kit/js/examples/), [python/examples](../../third_party/upstream/instantly-starter-kit/python/examples/) | Focused provider usage examples | Optional connector examples; no live execution during intake |
| [create-instantly-app/index.js](../../third_party/upstream/instantly-starter-kit/create-instantly-app/index.js) | Scaffolder | Archive only; our project already has different ownership/stack |
| [docs/api](../../third_party/upstream/instantly-starter-kit/docs/api/), [docs/conventions.md](../../third_party/upstream/instantly-starter-kit/docs/conventions.md) | Provider-specific concepts and implementation guidance | Useful contract/documentation organization |

## Database, identity and organization boundaries

The dashboard package description explicitly says “no auth, no DB.” Provider workspaces and API keys supply upstream configuration, not local people or mailbox permissions. There is no Supabase schema, organization/member relationship, per-user read state, immutable draft history, private attachment store or durable local event ledger to migrate.

`js/ops/src/client.ts` resolves an API key and can attach `x-as-workspace`. `js/ops/src/workspaces.ts` discovers agency members and caches common no-config reads for 15 seconds. This simplifies a single-key dashboard but is not tenant isolation. Our authorized user must never select an arbitrary provider workspace merely by supplying an ID. Cache keys in a multi-user application must include the actual authorization scope, and revocation-sensitive checks must remain current.

Elevateo owns company → mailbox → conversation → message data in PostgreSQL and constrains access through Supabase identity plus mailbox membership. Provider IDs belong in adapter mappings, not primary authorization decisions. A provider outage must not erase the team’s retained history or make one user inherit the API key’s full privilege.

## Provider transport, retry and event processing

The SDK exposes `fetchImpl`, `baseUrl`, `maxRetries`, default headers and request-level abort signals. Successful JSON is asserted to the generic TypeScript result type; generated typing is not runtime validation. `executeOperation` retries 429 and 5xx regardless of method, uses a short linear delay and has no default end-to-end deadline. A repeated POST is not automatically safe.

Our Resend adapter should accept a persisted send intent and stable idempotency key, validate boundary values, enforce a deadline and distinguish definite rejection from unknown acceptance. Read retry rules, write retry rules, webhook reconciliation and provider idempotency horizons must be explicit. Replacing the base URL would not turn this Instantly SDK into a Resend SDK: operations and response shapes are different.

The sample webhook defaults to accepting requests when its shared secret is absent, parses a permissive event shape, executes placeholders and acknowledges success. Elevateo must verify Resend’s actual signed webhook contract, durably deduplicate the received event, acknowledge only after persistence and process payload/attachments in a bounded worker. The old parser cannot authenticate a different provider’s events.

`js/ops/src/jobs.ts` is a small polling example, not a durable queue: it returns the last result on a later read error and measures elapsed delay rather than the total network wall-clock duration. Useful lesson: a timeout or partial failure must be visible in the result type. Never reinterpret a still-pending result as completion, and do not keep API requests asleep to act as a worker.

## UI, MCP and desktop implications

The dashboard provides roster, reply, campaign, sender health, analytics, lead and deliverability modules. `js/ops/src/replies.ts` maps remote results into compact reply/thread DTOs and uses plain-text extraction for thread presentation. That is a useful UI contract separation; its bounded remote fetches, heuristic direction inference and swallowed partial errors need explicit handling before a reliable company mailbox adopts them.

No application MCP server or native desktop package was identified in the inspected source. Agent-facing `AGENTS.md` and API documentation are not Claude/Codex runtime connectors. Our MCP service must call the authorized Elevateo API with scoped search/read/draft grants. A Tauri shell can reuse future React presentation code, but it must never receive this kit’s Instantly API keys, Supabase privileged keys or Resend keys.

## Independent scorecard

These are the 2026-10-11 audit judgments for the earlier outreach brief. Product fit is not a new score for Elevateo’s company-mailbox requirements. Each dimension is 0–10; the total is `sum(score × percentage weight) / 10`, rounded half up. Reuse value is distinct from production readiness.

| Dimension | Weight | Score /10 | Why |
| --- | ---: | ---: | --- |
| Architecture | 15% | 7 | Clear generated SDK, handwritten domain operations and UI layering. |
| Code maintainability | 15% | 7 | Typed boundaries and small modules; generated volume is not behavioral validation. |
| Security / permissions | 20% | 2 | Dashboard has no user authorization; example webhook secret is optional. |
| Sending / data reliability | 20% | 4 | Generic write retry and placeholder event processing; remote sending engine not present. |
| Product fit | 10% | 5 | Useful provider-backed outreach wrapper; not an independently hosted product. |
| Tests / verification | 10% | 2 | SDK typecheck/build passed, but no behavioral suite/CI found. |
| Operations | 10% | 3 | Examples and setup exist; identity, persistence, recovery and production operations remain consumer work. |

**Weighted total: 43/100. Reuse value: 8/10.**

### All nine component assessments

| Component | Score /10 | Assessment | Pinned source evidence |
| --- | ---: | --- | --- |
| OpenAPI and generated SDK | 8 | Strong reference for typed provider contracts and consistent API shapes. | [js/sdk/src/client/create-client.ts:5](https://github.com/Instantly-ai/instantly-starter-kit/blob/7649e6e4f820ad18cc563d5075f34b1a8daceb36/js/sdk/src/client/create-client.ts#L5) |
| Transport/retry policy | 4 | Retries every 429/5xx operation, including writes, with fixed linear backoff and no default deadline. | [js/sdk/src/client/request.ts:86](https://github.com/Instantly-ai/instantly-starter-kit/blob/7649e6e4f820ad18cc563d5075f34b1a8daceb36/js/sdk/src/client/request.ts#L86) |
| Operations layer | 7 | Useful domain adapters for campaigns, replies, analytics and client workspaces. | [js/ops/src/campaigns.ts:89](https://github.com/Instantly-ai/instantly-starter-kit/blob/7649e6e4f820ad18cc563d5075f34b1a8daceb36/js/ops/src/campaigns.ts#L89) |
| Agency UI | 7 | Good roster and cross-client dashboard reference; no user boundary. | [js/dashboard/core/package.json:5](https://github.com/Instantly-ai/instantly-starter-kit/blob/7649e6e4f820ad18cc563d5075f34b1a8daceb36/js/dashboard/core/package.json#L5) |
| Authorization | 1 | Mutation server actions invoke provider operations without identifying or authorizing a user. | [js/dashboard/core/app/actions/campaigns.ts:7](https://github.com/Instantly-ai/instantly-starter-kit/blob/7649e6e4f820ad18cc563d5075f34b1a8daceb36/js/dashboard/core/app/actions/campaigns.ts#L7) |
| Webhooks | 3 | Reference handler acknowledges events but business handlers are placeholders and secret is optional. | [js/dashboard/core/app/api/webhooks/instantly/route.ts:10](https://github.com/Instantly-ai/instantly-starter-kit/blob/7649e6e4f820ad18cc563d5075f34b1a8daceb36/js/dashboard/core/app/api/webhooks/instantly/route.ts#L10) |
| Independent sending engine | 0 | None. Every real send and deliverability feature depends on the external provider. | [README.md:5](https://github.com/Instantly-ai/instantly-starter-kit/blob/7649e6e4f820ad18cc563d5075f34b1a8daceb36/README.md#L5) |
| Scaffolding and documentation | 8 | Helpful examples, docs and generated contract; retain where a provider-backed option is desired. | [create-instantly-app/index.js:11](https://github.com/Instantly-ai/instantly-starter-kit/blob/7649e6e4f820ad18cc563d5075f34b1a8daceb36/create-instantly-app/index.js#L11) |
| Tests and operations | 2 | SDK build verified; no test suite or tracked CI; deployment/auth/persistence are application work. | [js/sdk/package.json:25](https://github.com/Instantly-ai/instantly-starter-kit/blob/7649e6e4f820ad18cc563d5075f34b1a8daceb36/js/sdk/package.json#L25) |

## Dependencies, operations and actual checks

| Area | Pinned-source observation | What was actually verified |
| --- | --- | --- |
| TypeScript SDK | `@instantly-ai/sdk` `0.1.0`, Node `>=18`, TypeScript dev dependency, injected native fetch | SDK typecheck and build passed |
| Ops layer | Local SDK dependency; handwritten provider workflows | Selected source reviewed; no live provider integration certification |
| Dashboard | Next `^14.2.35`, React `18.3.1`, local SDK/ops packages | No dashboard production build or authenticated UI acceptance test was run |
| Python SDK | Parallel generated models/resources and Python transport | Archived/source mapped; not claimed runtime-tested by this audit |
| Behavioral tests | None found under tracked-file heuristic; no tracked CI | Audit-only mocked transport probe observed two POST requests after a 500 then 200 |
| Dashboard dependencies | npm metadata: four vulnerability records, one critical and three high | Lockfile advisory scan at audit time; not an exploit test |
| SDK dependencies | Earlier SDK installation reported zero vulnerabilities in its very small compiler-focused tree | Does not certify dashboard, ops, templates or entire repository clean |
| Operations | Application owner must provide identity, storage, workers, secrets, backups and monitoring | No deployment, real email, subscription or recovery exercise performed |

The dashboard and SDK have different dependency trees; their scan results cannot substitute for one another. npm package records are not a count of proven reachable defects. The earlier audit used local isolated environments, not Elevateo’s future Docker application test harness. This dossier carries those results forward rather than silently rerunning or upgrading upstream.

See [machine-readable audit scorecards](../research/audit-scorecards.json). No installation or upstream execution was performed for this source-intake dossier.
## Findings and verification boundaries

Severity describes the potential consequence in a deployed application. Source-confirmed findings are not claims that a live installation was exploited. No production provider account was used.

### I1 — High: Dashboard mutations have no user authorization

activateCampaignAction accepts client and campaign IDs and calls the operations layer. There is no session or permission check in this action. An exposed dashboard with live keys grants powerful operations to visitors.

**Evidence level:** Source-confirmed; failure scenario not exercised end to end.

**Required treatment:** Put OIDC/session middleware and explicit workspace permissions around every server action; require approval for campaign activation.

**Source:** [js/dashboard/core/app/actions/campaigns.ts:7](https://github.com/Instantly-ai/instantly-starter-kit/blob/7649e6e4f820ad18cc563d5075f34b1a8daceb36/js/dashboard/core/app/actions/campaigns.ts#L7); [js/dashboard/core/package.json:5](https://github.com/Instantly-ai/instantly-starter-kit/blob/7649e6e4f820ad18cc563d5075f34b1a8daceb36/js/dashboard/core/package.json#L5).

### I2 — High: Automatic retry can repeat non-idempotent writes

executeOperation retries HTTP 500/429 independent of method or operation. A mock provider that accepts a POST but returns 500 receives the same POST twice. Actual duplicates depend on the endpoint’s idempotency semantics.

**Evidence level:** Reproduced with injected mock fetch: 2 POST requests; no live API used.

**Required treatment:** Retry reads safely; use idempotency keys only where supported, reconcile writes and treat ambiguous mutation responses separately.

**Source:** [js/sdk/src/client/request.ts:86](https://github.com/Instantly-ai/instantly-starter-kit/blob/7649e6e4f820ad18cc563d5075f34b1a8daceb36/js/sdk/src/client/request.ts#L86); [js/sdk/src/client/request.ts:99](https://github.com/Instantly-ai/instantly-starter-kit/blob/7649e6e4f820ad18cc563d5075f34b1a8daceb36/js/sdk/src/client/request.ts#L99).

### I3 — Medium: Webhook receiver accepts unauthenticated events by default

Missing INSTANTLY_WEBHOOK_SECRET returns authorized=true. The handler then acknowledges recognized events while its business cases are placeholders, so a naive deployment can accept forged or discard real events.

**Evidence level:** Source-confirmed; failure scenario not exercised end to end.

**Required treatment:** Fail startup when production secret is missing; validate and persist event IDs before acknowledgement; implement a durable consumer.

**Source:** [js/dashboard/core/app/api/webhooks/instantly/route.ts:10](https://github.com/Instantly-ai/instantly-starter-kit/blob/7649e6e4f820ad18cc563d5075f34b1a8daceb36/js/dashboard/core/app/api/webhooks/instantly/route.ts#L10); [js/dashboard/core/app/api/webhooks/instantly/route.ts:32](https://github.com/Instantly-ai/instantly-starter-kit/blob/7649e6e4f820ad18cc563d5075f34b1a8daceb36/js/dashboard/core/app/api/webhooks/instantly/route.ts#L32).

## Exact component decisions and prerequisites

Targets below are **proposed** future implementation locations. The pinned source archive is not imported by an Elevateo application. Keep actual ports separate and record commit, source/destination paths, license, adaptation and regression evidence.

| ID | Exact upstream source | Decision / proposed target | Required change and acceptance proof |
| --- | --- | --- | --- |
| I-PORT-01 | [js/sdk/src/client/create-client.ts](../../third_party/upstream/instantly-starter-kit/js/sdk/src/client/create-client.ts), [types.ts](../../third_party/upstream/instantly-starter-kit/js/sdk/src/client/types.ts) | Candidate adapter-construction pattern → `packages/providers/src/resend/client.ts` | Keep injected transport for deterministic tests; server-only credentials; validate config; pin provider host; add explicit deadline and provider-specific policy. Do not copy Instantly API paths. |
| I-PORT-02 | [js/sdk/src/errors/instantly-api-error.ts](../../third_party/upstream/instantly-starter-kit/js/sdk/src/errors/instantly-api-error.ts) | Candidate typed-error pattern → `packages/providers/src/errors.ts` | Own domain/provider error codes, retryability and unknown outcome; redact provider payloads before logs/UI; include safe request correlation. Test malformed/error responses and secret redaction. |
| I-PORT-03 | [js/ops/src/replies.ts](../../third_party/upstream/instantly-starter-kit/js/ops/src/replies.ts) | DTO separation reference → `packages/contracts/src/conversations.ts` | Source our PostgreSQL conversations; explicit trusted direction and pagination; distinguish missing, forbidden and partial provider data; per-user unread state. No loose cast accepted as validation. |
| I-PORT-04 | [js/dashboard/core/modules/replies/ReplyThread.tsx](../../third_party/upstream/instantly-starter-kit/js/dashboard/core/modules/replies/ReplyThread.tsx), [InboxTable.tsx](../../third_party/upstream/instantly-starter-kit/js/dashboard/core/modules/replies/InboxTable.tsx) | Presentation reference → `apps/web/src/features/conversations` | New API client and typed states; accessibility, long-thread pagination, attachment controls, shared assignment/private access and draft conflict tests. |
| I-PORT-05 | [spec/openapi.yaml](../../third_party/upstream/instantly-starter-kit/spec/openapi.yaml), [js/sdk/src/generated](../../third_party/upstream/instantly-starter-kit/js/sdk/src/generated/) | Contract-generation workflow reference → `packages/contracts` | Author Elevateo contracts from owned routes; verify code generation reproducibility and schema drift; runtime validation still required. No Instantly definitions relabeled as ours. |
| I-PORT-06 | [js/ops/src/jobs.ts](../../third_party/upstream/instantly-starter-kit/js/ops/src/jobs.ts) | Polling concept only → provider reconciliation worker | Fresh implementation using monotonic deadline/cancellation and explicit timeout/error states. Persist retry scheduling; fake-clock tests include slow reads and lost responses. |
| I-OPTIONAL-01 | [js/sdk](../../third_party/upstream/instantly-starter-kit/js/sdk/) | Defer actual Instantly integration | Only if a future approved requirement needs an Instantly account/migration; isolate provider mapping, patched retry policy, secrets and contract tests. No launch dependency. |
| I-REPLACE-01 | [js/sdk/src/client/request.ts](../../third_party/upstream/instantly-starter-kit/js/sdk/src/client/request.ts) | Do not port retry loop unchanged | New read/write policy; acceptance-lost response remains unknown; test no unsafe repeated mutation. |
| I-REPLACE-02 | [js/dashboard/core/app/actions/campaigns.ts](../../third_party/upstream/instantly-starter-kit/js/dashboard/core/app/actions/campaigns.ts), [webhook route](../../third_party/upstream/instantly-starter-kit/js/dashboard/core/app/api/webhooks/instantly/route.ts) | Replace authority and event ingress completely | Authorized Node API, human-controlled dispatch, signed Resend events and durable deduplication; no permissive missing-secret mode. |

## Traceability to our goals

| Requirement | Contribution | Gap / mandatory delivery evidence |
| --- | --- | --- |
| R01 — about 10 company users | Conversation DTOs and roster/UI patterns | Supabase identities, actual mailbox membership, assignments, per-user state and conflict handling |
| R02 — Resend | Typed provider boundary and fake-fetch seam | New Resend contracts; stable send identity, signed receive events and controlled end-to-end tests |
| R03 — self-hosted Supabase | Separation of UI from provider data | No database supplied; own schema/RLS/Storage/backup and restore proof required |
| R04 — web subdomain | React presentation examples | Our authenticated UI, Node API and deployment; exposed kit dashboard is not acceptable |
| R05 — Mac/Windows downloads | Selected reusable React interaction ideas | Tauri clients with central backend, no provider secrets and target-OS validation |
| R06 — Claude/Codex | Strong developer-facing API documentation organization | Developer documentation is not MCP; implement scoped tools, revocation and both-client checks |
| R07 — efficient compute | Small adapter layers avoid duplicating a provider implementation | One canonical backend; omit Python runtime and optional Instantly integration unless needed |
| R08 — tutorial | Clear example of SDK vs provider vs application responsibility | Teach why typed SDKs do not ensure runtime validation, idempotency or authorization |
| R09 — Codex CLI/repository update | Pinned agent-readable API reference | User’s CLI authorship and publication evidence remain project-level records |
| R10 — comprehensive source intake | Complete pinned snapshot plus nine component scores and treatment decisions | Preserve provenance/hash/license; distinguish reference code from adopted implementation |

## Release gates derived from this review

1. Every UI/MCP operation derives current mailbox scope from the actor, never an arbitrary client ID alone.
2. All external payloads are validated at runtime; generated TypeScript types do not bypass the boundary.
3. A mocked provider acceptance followed by a lost/500 response cannot cause an unsafe duplicate send.
4. Missing/invalid webhook authentication fails closed, and acknowledged events are durable and deduplicated.
5. Timeout, unknown outcome and partial-result states are explicit; neither swallowed errors nor pending polling become success.
6. The application retains mailbox history and access controls during a provider outage; no Instantly service is required for the Resend launch.
7. Any copied small component preserves attribution and receives its own Docker-run tests; a working SDK build is not shared-mailbox acceptance evidence.

**Disposition:** archive the complete kit and adapt its typed-adapter/documentation approach. Keep actual Instantly integration optional. Build Elevateo’s data model, permission checks, durable work and Resend behavior independently; do not confuse the open-source wrapper with Instantly’s unavailable backend.
