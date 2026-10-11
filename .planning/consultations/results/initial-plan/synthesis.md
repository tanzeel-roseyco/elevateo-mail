# Astra MAX synthesis — five initial planning tasks

The three initial planning opinions are valid and their synthesis is complete. The accepted local design is recorded in [accepted-decisions.md](accepted-decisions.md). This clears the initial **opinion/synthesis** gate for PLAN-RESEARCH, PLAN-ARCH, PLAN-AGENTS, PLAN-CLIENTS and PLAN-MAIL; it does not claim every task's operational acceptance, adoption audit or future implementation is complete.

## Evidence and execution identity

Base: `103baeb042925badbbc50dc0d3d3bfbf09ce8344`. The three independently started processes received the same task brief and identical 152,132-byte evidence body, SHA-256 `20121d3e44a0ba282e2fcd2d806f2c3ae5a06c093135f7a72f87d0ff00e45f76`, plus their own focus prompt. No process received another opinion. All ten packet source sections match that base after documented Windows line-ending/separator normalization. Original input hashes, response hashes, source hashes, usage and exits are in [metadata.json](metadata.json).

| Source label | Requested and observed canonical model | Session ID | Result UUID | Exit / elapsed / reported list cost |
| --- | --- | --- | --- | --- |
| F5 | `claude-fable-5` | `5c4a0811-db38-4f36-80a2-479bb2d47ece` | `b15bd76a-4d9c-4ad4-ac6f-a273cd996ba1` | 0 / 76.9 s / $1.38957 |
| O55 | `claude-opus-5-5` | `1f6efa9d-9b93-4e98-9ed9-389479ad731c` | `a580238d-ffaf-45b9-bfec-e4f83aef4fa0` | 0 / 65.6 s / $0.561159 |
| F51 | `claude-fable-5-1` | `58fe3dc8-e9fa-4b09-885f-21a302e49b51` | `9857394e-6d50-43ad-a38b-0227f4e823e4` | 0 / 156.3 s / $1.61506375 |

All structured results report `type=result`, `subtype=success`, `is_error=false`, `terminal_reason=completed`, a single matching first-party canonical model, no permission denials, no spawned subagents and empty stderr. Total reported list cost is $3.56579275; this is tool-reported usage pricing, not independent billing verification. Full substantive opinions are preserved in [F5](fable-5.opinion.md), [O55](opus-5-5.opinion.md) and [F51](fable-5-1.opinion.md). They contain recommendations, not executed tests or inspected candidate source bodies.

Synthesis owner: collaboration task `/root/plan_synthesis`. The parent reports the actual spawn tool confirmed model override `gpt-6-astra`, reasoning effort `max`, `fork_turns=none`; no opaque execution ID was returned. This is tool-execution evidence conveyed by the coordinator, not a self-asserted model identity. Synthesis local date: 2026-10-12.

Later operational evidence is kept separate from the original packet. The coordinator reports successful official Devin MCP initialize/tool-list/integration discovery and read-only repository/Docker preflight in session `b111d44287f34ba4be9f62961e5b6424`, final event `event-01a12bc0db7b7a128d8a5f9a53728a1c`. That session reported clean base `103baeb...`, Docker 29.7.2 and Compose 5.4.0. It did not implement, build or open a PR. No native MCP hot reload, branch-write test or enforced per-session spend cap is inferred. Original opinions' statements about missing initial access remain historically intact.

## PLAN-RESEARCH — accept direction; adoption remains evidence dependent

Section review: the market scan is useful discovery, but a candidate list is not a license/security audit. Prioritize actual foundation dependencies and first-party reuse before importing code. Preserve the distinction between behavioral reference, adaptation and copied source.

| Recommendation | Source | Disposition and reason | Decision/contract affected | Acceptance evidence |
| --- | --- | --- | --- | --- |
| Treat the 25 new candidates as unapproved until pinned audits; retain advisories/license checks | F5, O55, F51 | Accept; names and popularity do not establish safe adoption | D-09, component-adoption | Exact commit/version, license tree, security/advisory review and decision per selected candidate |
| Prioritize Ruby webhook/JWT/MIME and compatible Supabase components | F51 | Accept; backend security precedes editor polish | D-01/02/06/09, BE-01/02/05 | Foundation pin report plus boundary/negative fixtures |
| Audit DOMPurify with iframe/CSP before rendering mail | F5, O55 | Adapt; initial UI remains text-only due originating user prohibition; retain conditional sanitizer research | D-07/09 | Requirement reconciliation before any HTML; hostile-content fixtures if later authorized |
| Compare Tiptap and Lexical using paste, IME, quoted reply and export; bounded React Email look | F5, O55 | Accept as candidate evaluation, not installation of all three | D-09, FE-01 | Same fixture set, bundle/licensing/behavior evidence and one selected editor |
| Pin Mailpit and prove capture-only behavior | F5, O55 | Accept and move to BE-01 because Auth can send mail | D-06 | Relay disabled and Auth email locally captured/denied |
| Pin ClamAV and Tauri later | F5 | Adapt; defer implementation to attachment/client tasks, but select/security-audit before their first use | D-07/09, BE-05/client briefs | Exact supported pins and task-specific smoke/security checks |
| Audit .NET/WebView2/minimal Tauri plugins and ClamAV | O55 | Accept with same just-in-time adoption boundary | D-07/09 | Target-runtime and plugin privilege evidence |
| Chatwoot/FreeScout as behavior reference; reject membership bypass and unapproved enterprise/AGPL copy | F5, O55, F51 | Accept; no imported authority logic or unlicensed code | D-01/09 | Source/license path and independently specified behavior |
| Preserve six existing A01–A13 reuse sources/notices and label Rails translations as adaptations | F5, F51 | Accept; existing provenance remains binding | D-09, adoption ledger | Per-source mapping, notices and negative fixtures |
| Inspect pinned first-party Integration/FableFrontend before FE work | F5, O55, F51 | Accept; their source bodies were absent from this packet | D-09 | Inventory at `4322cfb` and `d7a1f52`, actual component/domain comparisons and inherited notices |
| Reject candidates for no maintenance in 12 months or more than one resident service | O55 | Adapt; use as risk/cost signals, not automatic cutoffs; official Supabase itself has multiple services | D-09 | Maintenance/security evidence, measured footprint and necessity |
| Reject second identity, direct DB/provider writer, Pro-only essentials and unnecessary Redis/Sidekiq | O55, F51 | Accept the architectural/license conflicts; do not add unnecessary infrastructure | D-01/09 | Dependency-purpose statement and authority diagram |
| One-day Ledger-to-contract spike; tokens-only reuse if more than 40% rewritten | O55 | Adapt; timebox an actual compatibility spike, decide from behavior/maintenance cost rather than an arbitrary percentage | D-09, FE-01 | Working list data path, preserved semantics and measured adaptation work |
| Node-era adoption targets need correction | F5 | Adapt; inspect exact current targets first because the base already contains Rails paths | D-01/09 | File-specific drift report, no blanket rewrite |

## PLAN-ARCH — accept the local architecture and strengthened invariants

Section review: the proposed stack is accepted for local completion with Rails as sole authority. The decisive improvements are single-consumption approval, append-only provider observations and a restore hold outside restored data. These are requirements for later task design, not claims of implementation.

| Recommendation | Source | Disposition and reason | Decision/contract affected | Acceptance evidence |
| --- | --- | --- | --- | --- |
| Rails sole writer, one schema lane, real Supabase services and explicit PostgreSQL job ledger | All | Accept; clear transaction/authority ownership | D-01/02, BE-01–04 | Real-role and transaction tests, no duplicate backend |
| Clarify Rails cookie/CSRF/Auth session boundary | F5, F51 | Accept; current session validity is separate from JWT signature | D-02, BE-02 | Real login, revocation, CSRF and fail-closed tests |
| Transaction-local claims on every app query; pool size one adversarial sequence | O55, F51 | Accept, including no-context and rollback cases | D-02, BE-01/02 | Restricted-role A→B pool tests and cross-org denials |
| Measure current-session lookup p95; avoid stale cache | O55 | Accept; do not weaken revocation for speculative speed | D-02, OPS-01 | Measured load with real session checks |
| Atomic approval/snapshot/job/audit; provider I/O outside transaction; leases/unknown | F5 | Accept, strengthened by the next two rows | D-03/04, BE-03/04 | Crash/concurrency/timeout fixtures in real PostgreSQL |
| Append valid late provider observations even after fence expiry; reconcile with fresh ownership | F51 | Accept; fencing mutations must not discard genuine external evidence | D-04 | Generation-1 delayed acceptance after generation-2 unknown; one monotonic accepted projection |
| Consume a draft once, not merely once per version | F51 | Accept; prevents sequential versions creating duplicate sends | D-03 | Simultaneous approvals, old version after new approval, retry and explicit clone/resend tests |
| Deterministic idempotency key also fixes restored-history collisions | F51 | Adapt; stable identity helps the same intent, but provider expiry and restored versions still need external evidence/hold | D-04/05 | Expired key and restored old-version scenarios; no unsupported safety proof |
| Default restore hold outside restored DB; preserve simulator ledger | F5, O55 | Accept | D-05 | Restore older application snapshot while external accepted evidence remains |
| One-org/two-user/private/shared/two-domain vertical fixture | O55 | Adapt; add a second organization for meaningful tenant isolation | D-02/06 | Authorized path plus foreign-org/private denial |
| Start smallest login→list→inbound→draft→approve→accepted→restart slice | F5 | Accept as integrated milestone after prerequisites, not BE-01's scope or substitute for negatives | D-01–06 | Real services, immutable snapshot, persistence, denial and failure evidence |
| API p95 under attachment import, uniqueness, leases, 23-hour unknown/reconcile, restore | F5 | Accept as concrete later measurements/failure probes; times relative to configured provider window | D-02–05, BE-03–05/OPS-01 | Real database/load/fault evidence, no mocked performance claim |
| Generated TS/C#/Java/Swift clients from one OpenAPI contract and drift gate | O55 | Accept, generation compatibility must be proven for each target | D-07 | Regeneration diff and target compilation/conformance |
| Fastify alternative could simplify | F5 | Reject for current scope; eliminates requested Ruby authority without measured benefit | D-01 | Revisit only as explicit architecture change with fresh opinions |
| Cut/defer Go/PHP first under capacity; move TOOL-01 after measurements | F5, F51 | Adapt; sequence bounded Go/PHP consumers after stable contracts/OPS evidence, retain requested deliverables | D-01/07 | Backlog retains tasks and dependencies; no silent scope removal |
| Python fixture work is low value | O55 | Reject for MIME/fault fixtures; useful independent adversarial inputs | D-07/09 | Concrete fixtures that exercise actual boundaries, no duplicate service |
| Keep additional-language extensions conditional, no extra resident services | O55 | Accept where optional; cannot erase required language deliverables | D-01/07 | Bounded tools, no competing mail authority |

## PLAN-AGENTS — preserve gates and verify the actual route

Section review: the exact consultation identities are now proven for this packet. Historical authentication failures remain historical. Official MCP read capability is now observed, while implementation bounds and write/PR capability remain explicit next checks.

| Recommendation | Source | Disposition and reason | Decision/contract affected | Acceptance evidence |
| --- | --- | --- | --- | --- |
| Two other opinions and actual identity still needed | F5, F51 | Accept concern; resolved for this packet by three success records, not by assertions | D-10 | Metadata, distinct session/result IDs, equal evidence hashes |
| Official Devin MCP required; CLI auth alone insufficient | F5, F51 | Accept; route now has read-only preflight, not implementation proof | D-10, BE-01 brief | Actual session/task/base and later write/PR/stop evidence |
| Could substitute Devin CLI if chosen | O55 | Reject silent substitution; user specified official MCP route | D-10 | A replacement would need explicit authorized workflow change |
| Initial packet can satisfy initial PLAN-AGENTS bootstrap consultation | O55 | Accept only for that named planning task | D-10 | This synthesis, no reuse as BE-01 implementation opinions |
| Relax three opinions for low-risk fixes, use two opinions/design-only gate | O55 | Reject; conflicts with explicit every-task requirement | D-10 | Fresh triple and synthesis for each task/fix |
| Use finding-density sampling/full-PR review instead of full small-slice coverage | F5 | Reject sampling as substitute; all changed code covered in assignments ≤200 lines | D-10 | Coverage ledger, full rubric, separate design review |
| Search tagged sessions before creation; store ID; stop uncertain duplicate create | F5, F51 | Accept | D-10 | Session reconciliation and bounded retry log |
| Bound auth recovery/cost/time, two failed repair attempts then escalate, no silent model replacement | All | Accept; actual backend cost controls must be supported, not invented schema fields | D-10 | Recorded limits, usage checks/stop route and exact model execution |
| Smoke Codex→Devin draft PR→review issue→Astra LOW repair | F5 | Accept as an operational milestone; read-only session does not complete it | D-10 | Real links, actual reviewed commits and fix evidence |
| Exact base/head, isolated owner lock and one contract writer | O55, F51 | Accept; Astra decides contract, designated implementation owner writes it | D-10 | Branch reservations, frozen head, no concurrent conflicting writers |
| Batch review-fix consultation packets | F51 | Adapt; allowed only when every named bounded task is explicitly covered by each independent opinion and synthesis on same base | D-10 | Per-task dispositions, no blanket future exemption |
| Stop for budget exhaustion/lost session ID, deny runtime mail-provider egress | F51 | Accept | D-06/10 | Actual stop, reconciliation and no-live checks |
| Stop if any app service key exists | F51 | Adapt; reject production/client-exposed privilege, allow essential disposable local bootstrap/service secrets in narrow official paths | D-02/06 | Least-privilege role tests and secret-path audit |

## PLAN-CLIENTS — accept host boundaries; retain platform scope

Section review: shared React UI and minimal native hosts avoid duplicate business clients while retaining the requested languages. Authentication and native bridge exposure are release gates. UI reuse is conditional on actual source inspection.

| Recommendation | Source | Disposition and reason | Decision/contract affected | Acceptance evidence |
| --- | --- | --- | --- | --- |
| Shared React bundle, Rust/Tauri Mac and C#/WebView2 Windows | All | Accept; choose WPF initially, validate in fresh native task | D-07 | Actual target-OS build/launch and host conformance |
| Versioned bridge with auth/notification/agent commands and secureStore get/put | O55 | Adapt; expose narrow intent operations, never arbitrary credential retrieval to WebView/untrusted content | D-07/08 | Origin/command validation and hostile-content bridge denial |
| Store credentials in native Keychain/Credential Manager | O55, F51 | Accept; host-internal, never renderer-visible raw secrets | D-07 | Secret persistence/redaction and unauthorized access tests |
| Share sidecar protocol across hosts; distinct Codex/Fable adapters | O55 | Accept; reuse lifecycle/conformance rather than duplicate process logic | D-08 | Same fake-runner corpus on both hosts |
| Supported Claude product-auth gate; no entitlement/subscription claim from login alone | All | Accept | D-08 | Official support evidence and actual authorized lifecycle test |
| Fake local adapters before actual products; disable unsupported connectors with reason | F5, F51 | Accept | D-08 | Malformed frame/crash/cancel/stale-approval and denied-shell fixtures |
| Agent-origin flag and exact envelope human approval; no bulk agent approval | F51 | Accept | D-03/08 | Server flag, immutable approved snapshot, denied send tool |
| Sandboxed sanitized email content with no native bridge | O55, F51 | Adapt; text-only initial renderer satisfies stricter user instruction; sandbox research conditional | D-07 | No message HTML path; later explicit requirement resolution |
| Web+Mac first; drop Windows from first release | F5 | Adapt sequencing only; reject silent removal of Windows deliverable | D-07 | Backlog and target release acceptance explicitly retained |
| Tauri on Windows is simpler than C# host | O55 | Retain dissent, reject current substitution because requested C# role remains | D-07 | Reconsider only after measured host cost/incompatibility and fresh authorized decision |
| Java/Swift mobile inbox/thread/draft/approve, no initial agents, survive process kill | O55 | Accept as first milestone, not unrecorded reduction of complete requested scope | D-07 | Native platform tests, durable versioned drafts and remaining-parity ledger |
| Four bounded motions, reduced motion/live override, no focus jump, teardown | O55 | Accept; server acknowledgement controls saved feedback | D-09 | Actual browser/native visual QA, keyboard/axe and motion trace |
| INP ≤200 ms, no >50 ms motion long tasks, native idle RAM | O55 | Accept as measured targets, not preverified guarantees | D-09 | Defined scenario/hardware, traces and measured results |
| No C++/Qt without demonstrated gap; Opus owns any such work | O55 | Accept | D-07/09 | Concrete requirement and separate task before dependency adoption |
| Actual sibling UI reuse inventory before copying | All | Accept; follow research disposition | D-09 | Inspected pins and feature compatibility evidence |

## PLAN-MAIL — accept local fixtures and hold activation

Section review: account inventory must distinguish accounts, aliases and routing. Account connection is a capability grant whose side effects must be understood. Real mail remains outside local completion.

| Recommendation | Source | Disposition and reason | Decision/contract affected | Acceptance evidence |
| --- | --- | --- | --- | --- |
| Fail closed on live Resend/nonlocal SMTP configuration; no live fallback | F5, F51 | Accept | D-06 | Typed config/egress denials and local-only behavior |
| Include Supabase Auth invitation/recovery/signup as mail paths | F51 | Accept; Mailpit DNS service allowlist instead of literal loopback assumption | D-06, BE-01 | Captured/denied Auth messages and relay-off evidence |
| Nine-slot/two-domain/shared/private/alias fixture, explicit account kind and route owner | All | Accept; aliases are not extra authenticated accounts | D-06 | Fixture contract and membership/routing denials |
| Resend receiving not conventional Instantly inbox; record instantly_eligible | O55, F51 | Accept; no inference of compatibility from one working route | D-06 | Account-kind evidence in later activation task |
| Route using signed envelope recipient, not MIME To | F51 | Accept | D-06, BE-05 | Forged To/cross-mailbox routing fixtures |
| Timestamp tolerance before new effects, durable dedup plus provider-message collapse | F51 | Accept; define legitimate replay/import behavior explicitly | D-06, BE-05 | Old/bad signature, same event and multiple-event/same-message fixtures |
| Use dedicated receiving subdomain | F51 | Defer as production option; no current DNS/MX change | D-06 | Later explicit routing design and activation decision |
| Keep CLI allowlist to identity/domain read operations; verify actual schemas | F5, O55, F51 | Accept; no send/key/verification mutation in discovery | D-06 | Read-only command schema/output with secrets redacted |
| Instantly may auto-verify/warmup on connection; prove wizard side effects first | F5, O55 | Accept as risk to investigate, not unsupported universal fact | D-06 | Current supported flow documentation and observed safe boundaries |
| Defer all account connection until live-send stage C | F5, F51 | Adapt; current B is held, but future independently scoped side-effect-free B need not authorize C | D-06 | Explicit later scope and proven absence of send/authority side effects |
| Use disposable real external account as workaround | F51 | Reject as local-completion shortcut; external effects remain external | D-06 | No live test without corresponding authorization |
| No secrets in screenshots/transcripts; safe user-controlled credential handoff | O55 | Accept | D-06/08 | Redacted evidence and supported auth route |

## Dissent, task status and next work

The unresolved design alternatives are retained above: Fastify instead of Rails; Tauri for both desktops instead of C# Windows; reduced platform scope; reduced consultation/review intensity; treating Python fixtures as low value; a rigid maintenance/service-count/rewrite threshold; and postponing every account connection until live activation. They are not selected for this scope. Future measured evidence may justify a new task decision; it cannot silently reverse an accepted contract.

| Task | Current decision and remaining work | Owner/next evidence |
| --- | --- | --- |
| PLAN-RESEARCH | Direction accepted; foundation and selected-source pins/licenses/advisories, first-party inventory and per-adoption decisions remain open | Codex research; exact candidate evidence before copying |
| PLAN-ARCH | Core local architecture/invariants accepted; publish canonical ADR/contract updates; foundation implementation not begun | Astra MAX design; BE-01 own three opinions, synthesis and checks |
| PLAN-AGENTS | Role/gate policy accepted; actual exact opinions and official MCP read preflight exist; write/PR route and bounded backend execution still need proof | Codex coordinator; real task/session/branch/budget evidence |
| PLAN-CLIENTS | Host and connector trust boundaries accepted; actual UI inventory, dependency pins, target-platform and auth proof remain open | Fable/Opus frontend and native task owners after fresh consultations |
| PLAN-MAIL | Local fixtures/no-live policy accepted; actual accounts, routing and activation deferred | Local synthetic fixtures now; separately authorized activation later |

The next executable task is [BE-01](BE-01-brief.md), intended owner Devin through Codex, branch `devin/backend/be-01`. Its fresh three opinions, Astra MAX synthesis, actual implementation budget/write scope/session, commits, draft PR and final checks are pending. The coordinator created tracking issue [#3](https://github.com/tanzeel-roseyco/elevateo-mail/issues/3) after the brief was drafted; the issue is tracking, not accepted implementation evidence. Concurrent independent work may audit selected dependencies, inspect first-party UI and reconcile documentation without modifying shared implementation files.

No Obsidian tools or connection were discovered. [Tradeoff scenarios](tradeoff-scenarios.md) are analytical sequences, not executed tests or the requested Obsidian capture. Preserve this missing capability explicitly. Production hosting, purchases, real email, DNS migration, public release and destructive completion cleanup remain outside this decision. Downstream file-specific updates are listed in [downstream-doc-updates.md](downstream-doc-updates.md).
