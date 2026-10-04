# Research index and decision review

Research completed 4 October 2026 for the [master plan](../../product-master-plan.md) and [engineering blueprint](../../backend-blueprint.md). Research is evidence and competing advice, not approved implementation instructions.

## Assignments completed

| Researcher | Scope | Report |
| --- | --- | --- |
| Codex / GPT-6.1 Sol, low effort | Backend, data, queues, cost | [Backend](codex-backend.md) |
| Codex / GPT-6.1 Sol, low effort | Mail, providers, OAuth, reputation | [Email](codex-mail.md) |
| Codex / GPT-6.1 Sol, low effort | Windows, local CLI, sandbox, resources | [Desktop](codex-desktop.md) |
| Independent Claude CLI session | Architecture challenge and recovery | [Architecture](claude-architecture.md) |
| Independent Claude CLI session | Monitoring, alerting, operations | [Observability](claude-observability.md) |
| Independent Claude CLI session | Focused tests, GUI and fault injection | [Testing](claude-testing.md) |

The three Claude sessions used installed Claude CLI with low effort, WebSearch/WebFetch only, no account changes or code tools. Reported model usage included `claude-opus-5-5` and `claude-haiku-4-5-20251001`; these were genuine Claude sessions, not Codex agents relabelled as Claude. Prompts are preserved in `prompts/`. All six assignments returned reports. A dedicated backend design challenge and final mail/desktop reviews informed the synthesis.

Later user answers supersede report scenarios: ten completely separate users, unrelated Workspace/personal Gmail accounts, up to ten mailboxes per user (100 total), 30/connected mailbox/day, Resend for opted-in campaigns, and hosting below A$15. The effective pilot maximum is 300/user/day and 3,000 total/day. The earlier 600/user/day ceiling needs a later expansion. History/import/storage allowances remain open. Earlier reports using other mailbox counts or shared workspaces remain historical research scenarios.

## Ten follow-up assignments completed

All ten used GPT-6.1 Sol at low effort. They ran in waves under the session's three-child concurrency limit, not ten simultaneous agents. Connections development assignments produced concrete capability/permission contracts; they did not implement an unapproved backend.

| Assignment | Result |
| --- | --- |
| Connections product planning | [Private Connections and user flows](../../connections/product-plan.md) |
| Connections security planning | [Ownership, credentials, AI and DNS](../../connections/security-plan.md) |
| Prototype inspection | [Integration gaps and code slices](../../connections/inspection.md) |
| Provider contracts | [Capabilities and staged adapters](../../connections/provider-contracts.md) |
| MCP/DNS contracts | [Tool permissions and reviewed domain changes](../../connections/mcp-dns-contracts.md) |
| Cloud cost research | [Pricing and work estimates](efficiency-cloud-cost.md) |
| Storage research | [Indexes, history, files and imports](efficiency-storage.md) |
| Scheduling research | [Durable work and bounded sync](efficiency-scheduling.md) |
| Desktop resource research | [Windows shell and local CLI](efficiency-desktop.md) |
| Adversarial design and rename review | [Tradeoffs and scoped code review](efficiency-design-review.md) |

The final review examined 168 lines around the six branding edits and confirmed zero new defects. It raised four planning issues: admission limits, independent recovery, premature scaffolding and monitoring scope. The synthesis records the confirmed mailbox allowance, keeps history/storage decisions explicit, requires a separate backup boundary before any independence claim, stages packages/providers, and limits monitoring to useful health and alerts. See [code-reviews.md](../../../code-reviews.md) for scope and density; this is not a review of an implemented backend.

## What arXiv contributed

We used paper summaries/abstract-level findings alongside current official documentation. This is not a full-text systematic review, reproduction of experiments or proof of this application's safety. The application column is our engineering inference.

| Paper | Relevant finding/topic | Application and limit |
| --- | --- | --- |
| [1907.06250 — Delivery, consistency, and determinism](https://arxiv.org/abs/1907.06250) | Distributed stream delivery/recovery semantics | Separate durable job handling from external email side effects; does not prove exactly-once mail |
| [2409.01388 — Serverless Query Processing with Flexible Performance SLAs and Prices](https://arxiv.org/abs/2409.01388) | Performance/cost tradeoffs in query workloads | Measure budgets and prioritise interactive work; not a D1 OLTP benchmark |
| [2302.07287 — Forward Pass](https://arxiv.org/abs/2302.07287) | Email forwarding and authentication weaknesses | Prefer direct authorised sync; historical research does not establish a current provider vulnerability |
| [2011.08420 — Weak Links](https://arxiv.org/abs/2011.08420) | Inconsistent email authentication/UI chains | Do not equate sender authentication with consent or app ownership |
| [2302.12173 — Indirect Prompt Injection](https://arxiv.org/abs/2302.12173) | Instructions embedded in externally retrieved content | Treat email as untrusted; keep permissions outside the model |
| [2406.13352 — AgentDojo](https://arxiv.org/abs/2406.13352) | Tool-agent task and injection evaluation | Add realistic malicious-email cases; benchmark results do not certify our bridge |
| [2111.11562 — Reliable Actors with Retry Orchestration](https://arxiv.org/abs/2111.11562) | Reliable execution/retry coordination | Durable intents and explicit recovery states; external providers remain outside the transaction |
| [1911.11286 — LogPlayer](https://arxiv.org/abs/1911.11286) | Fault-tolerant delivery over controlled streaming | Deduplicate receipts; do not transfer its exactly-once claim to Gmail/SMTP |
| [2204.09670 — Alert Anti-patterns in Industrial Cloud Systems](https://arxiv.org/abs/2204.09670) | Noisy and ineffective operational alerts | Deduplicate, use sustained thresholds, link alerts to action |
| [2404.16887 — Anomaly Detection for Incident Response at Scale](https://arxiv.org/abs/2404.16887) | Large-scale incident detection | Begin with meaningful health measures; no ML anomaly platform justified at ten users |
| [2207.01047 — Flaky Tests in JavaScript](https://arxiv.org/abs/2207.01047) | Causes of unreliable JS tests | Deterministic clock/data and controlled asynchronous boundaries |
| [2103.02669 — UI-based Flaky Tests](https://arxiv.org/abs/2103.02669) | UI test instability | Wait for state, isolate tests, avoid arbitrary sleeps |
| [1908.06466 — Feedback-based Automated Failure Testing](https://arxiv.org/abs/1908.06466) | Targeted failure injection | Test commit/send/ack crash boundaries; no new microservices platform required |

## Disagreements resolved by the final plan

1. **PostgreSQL versus D1:** both can work. D1/Workers is the budget-first proposal, with explicit capacity limits and a measured pilot. PostgreSQL is a future funded option, not an automatic migration.
2. **Missing Sent marker then resend:** rejected. Negative search evidence after a delay does not prove the first send failed. Unknown remains unreplayed unless a verified provider idempotency contract makes retry safe.
3. **Exactly-once delivery:** rejected as an end-to-end promise. Atomic intents, outbox and deduplication protect our state; external email requires reconciliation.
4. **A sync delay proves no reply:** rejected. Require a recent successful sync, recognise the admission race and show the in-flight cancellation boundary.
5. **Fixed complaint/bounce percentages:** not adopted without a sample size, denominator and window. Individual complaints/opt-outs still stop the affected recipient immediately.
6. **Custom monitoring means building Sentry:** rejected. Build product health views and use redacted provider logs plus independent outage detection.
7. **Zero-cost testing:** means no paid test/API service calls with existing eligible resources. It does not erase hardware, Docker licence or native Windows verification costs.
8. **Low CPU from choosing Tauri:** a hypothesis requiring a Windows benchmark, not a measured result. Tauri capabilities do not sandbox spawned CLI processes.
9. **Billing alert as hard cap:** rejected. Delayed metering and incoming work can still incur costs. Bound storage/imports and model the maximum mailbox scenario honestly.
10. **Local CLI implies local/private model execution:** rejected. Context can reach the chosen remote AI provider and needs explicit permission and policy review.

## Dedicated design challenge: corrections retained

- Suppression/quota admission is atomic, not a separate read before send; document the external-call boundary.
- D1 zero-row updates do not automatically roll back other batch statements. Tie dependent writes to the winning transition.
- Persist intent and outbox together; queue duplicate delivery is expected.
- Lease expiry during submission cannot authorise a second send; fencing cannot cancel an external request.
- Ownership applies to foreign keys, imports, object paths, jobs and webhook connections as well as HTTP routes.
- Rolling-window quotas need dispatch-time semantics. Delayed reservations cannot expire and later send without re-admission; unknown work retains conservative capacity.
- Storage grows even at modest throughput. Preserve compact deduplication/suppression while archiving detailed records; do not retain unlimited indexed mail under a fixed budget.
- Restore must pause sends and reconcile later opt-outs/activity before resuming.

Tradeoff arithmetic is recorded in blueprint §9: the confirmed 100-mailbox pilot, at most 90,000 sends/month, assumed metadata growth and queue operations. The older 200-mailbox/180,000-send scenario remains a later expansion comparison in the research. No Obsidian connector was available, so this is documented scenario analysis, not a claimed Obsidian simulation or load benchmark.

## Evidence use and next verification

Current provider facts/prices were checked against official Cloudflare, Google, Resend, OpenAI, Anthropic, Tauri and Docker sources cited in the reports/plan. Recheck supported versions, terms, costs and scope verification before implementation. The three Claude reports and research scenarios are preserved rather than rewritten to hide disagreements.

The most consequential unresolved gate is external Gmail restricted-data verification/security assessment and AI-data transfer policy. Hosting under A$15 does not establish that those separate launch costs fit. The 30/day limit reduces sending volume but does not waive consent, reputation, authentication or Google approval requirements.
