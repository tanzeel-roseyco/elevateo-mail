I am running as `claude-fable-5`, matching the assignment, so no runtime blocker to report. Below is my independent opinion on the five planning tasks, grounded only in the supplied packet. Proposed tests are **not run**.

## PLAN-RESEARCH

**Verdict: support, with one change (optional improvement, not a blocker).** The scan's seven "actionable next audits" are the right shape; the gap is that all 25 candidates are `pin_pending` and no exact commit was verified, so nothing is yet adoptable.

**Recommendation.** Pin and audit only the components on the P1 critical path: DOMPurify, one composer (Tiptap vs. Lexical decided by a single shared fixture set per the scan), Mailpit's no-egress configuration, and Chatwoot/FreeScout as workflow references only. Defer ClamAV and Tauri pins to P2/P3 — they gate nothing in the first vertical slice. Rationale: audit effort should follow the delivery phases in `.planning/POLYGLOT_ARCHITECTURE.md` §2, and the scan itself concedes it is "not 25 security audits." Affected contract: `docs/component-adoption.md` adoption lifecycle. Evidence gap: dependency advisories, exact release pins and Tiptap Pro/cloud license scope are all explicitly unverified.

**Strongest objection.** Chatwoot is the top-scored reference, but the scan documents a real policy mismatch (administrators bypass inbox membership in its policy branches) and an MIT/enterprise license split. Treating it as a component source rather than a behavior reference risks importing the wrong authorization model. Simpler alternative: freeze Chatwoot/FreeScout at "reference, no code port" now and remove them from pin work entirely; tradeoff is losing a possible UI shortcut that was never likely to survive the Supabase Auth replacement anyway.

**Preserving the six local sources.** The A01–A13 matrix is the right preservation vehicle; the one addition I'd require is that each Rails translation (A05, A10, A11) records it is an *adaptation* of upstream implementation, not a clean-room rewrite, so notice obligations stay attached.

**Acceptance checks (not run):** each shortlisted component has a commit pin, license file at that pin, and a written rejection criterion; A01–A13 rows each name their mandatory security change. Residual uncertainty: whether React Email's Tiptap-based editor changes the composer decision — needs one bounded look before the composer ADR.

## PLAN-ARCH

**Verdict: support with changes; one prerequisite blocker.** The Rails-authority design preserves the invariants that matter: atomic approval/snapshot/job/audit in one transaction, provider I/O outside transactions, fenced leases, unknown outcomes, dispatch-held restore. The blocker is contract drift: `docs/local-completion-plan.md` and `docs/component-adoption.md` still carry Node-era destinations and the reconciling ADR does not exist. Devin cannot implement BE-01 against two partially contradictory documents.

**Recommendation.** Write the ADR before BE-01 and make it resolve exactly three things: (1) Rails as sole application writer with the one-migration-lane rule; (2) the Supabase Auth ↔ Rails session boundary — this is the riskiest seam, because `POLYGLOT_ARCHITECTURE.md` §5 correctly notes a valid JWT can outlive sign-out and API-only Rails omits the CSRF/cookie middleware that must be explicitly added; (3) the explicit job table over Solid Queue, already well-argued in §1. Affected contracts: `contracts-and-reliability.md` routes and the send state machine (keep both unchanged; they are language-neutral and sound).

**Maintenance-risk view of language boundaries.** Low risk: Rails+SQL, strict TS UI, Express simulator, Python fixtures. Moderate but justified: Rust/Tauri Mac and C# Windows (user-requested). The PHP SDK and Go doctor are the first things I would cut if capacity tightens — they add two toolchains for about ten users and nothing in P1/P2 depends on them. The PX conditional languages are correctly fenced; hold that line.

**Strongest objection.** Losing TypeScript↔server type sharing means the OpenAPI contract is the *only* defense against drift across six client platforms. A Rails team of effectively one agent lane maintaining conformance fixtures for web, two desktops, two mobiles, MCP, PHP and Go is the realistic failure mode. Simpler alternative: a TypeScript (Fastify) backend sharing wire types with the UI; tradeoff is abandoning the requested Ruby role and redoing the §1 analysis — not worth it if contract conformance tests are enforced from BE-01, worth revisiting if they slip.

**Smallest vertical slice:** login → mailbox list → one inbound thread via simulator webhook → draft → approve → worker dispatch to simulator → accepted state visible → API restart with state intact. This is narrower than P1's full two-user flow and should gate it. Measurement plan: the OPS-01 ten-user concurrency/queue-age/restore-time set is adequate; add p95 API latency during a simulated attachment import.

**Acceptance checks (not run):** real-PostgreSQL tests for approved-version uniqueness, lease fencing, unknown-send hold past the 23-hour horizon; pooled-connection RLS claim-leak test; restore drill with dispatch held and simulator ledger surviving.

## PLAN-AGENTS

**Verdict: change — two prerequisite blockers.** First, the three-opinion gate failed on expired Claude OAuth; this consultation shows the fresh-session route works, but Opus 5.5 and Fable 5.1 opinions remain outstanding and the plan correctly forbids substitutes. Second, Devin's official MCP is not yet configured; two read-only assessments do not establish a session-creation path with cost bounds.

**Recommendation.** Add an explicit idempotency rule to the Devin contract: before any `devin_session_create`, search for an existing task-tagged session; record session ID and ACU bound in the task brief before dispatch. Rationale: `AGENT_ORCHESTRATION.md` already warns that network retries can spawn duplicate expensive jobs, but there is no written stop condition for "creation result uncertain." Affected contract: the Codex→Devin setup contract. Evidence gap: no observed Devin session lifecycle, pricing or branch-push behavior exists in the packet.

**Circular dependency found.** PLAN-AGENTS acceptance requires working consultation routing, but the consultation routing is itself what PLAN-AGENTS defines — the gate can deadlock if authentication breaks again mid-synthesis. Missing stop/recovery condition: define a bounded re-auth window (e.g., user re-authenticates within N days or the coordinator escalates for an explicit substitution *decision*, never a silent swap). Also missing: what happens when Astra LOW fails a fix twice — the plan says escalate, but doesn't cap attempts or ACU spend per issue; add a two-attempt cap.

**Strongest objection / failure scenario.** Five writers (Devin, Astra LOW, two frontend agents, Opus native) with per-writer worktrees is executable, but review throughput is the bottleneck: 200-line adversarial slices on Devin-scale backend PRs will generate reviewer-hours nobody has budgeted. Simpler alternative: full-PR review with a 200-line *finding-density sampling* requirement on the riskiest files (auth, send ledger, migrations); tradeoff is weaker coverage on boilerplate, which is acceptable.

**Acceptance checks (not run):** a dry-run task brief round-trips Codex→Devin→draft PR→review issue→Astra LOW fix on a trivial change before BE-01; consultation ledger shows three distinct recorded session identities per task.

## PLAN-CLIENTS

**Verdict: support with changes; the Claude/Fable adapter authentication route is a prerequisite blocker for AI-03 product promises, not for building the adapter.**

**On the adapter I would own.** The design in `CLIENTS_AND_CLI_CONNECTORS.md` §5–6 is sound: fixed executable path, `shell: false`, minimal environment, fake-runtime harness first, runtime-enforced (not prompt-enforced) tool policy. What needs proof before any product promise: (1) the authentication route — the plan correctly cites that third-party products cannot offer claude.ai login without prior approval; until supported API auth or that approval is confirmed, the connector ships as "disabled with reason," and no marketing claim of "works with your Claude subscription" is permissible; (2) the Agent SDK's permission-callback and cancellation semantics against a *real* runtime, because the fake harness cannot validate provider-side approval flows; (3) that the MCP-tools-only restriction is enforced by the SDK's tool policy configuration and verified by a denied-shell test. Evidence gap: no SDK version is pinned and no entitlement check has been performed.

**Recommendation.** Sequence FE-01 strictly on the reusable Ledger React UI in Integration 4322cfb / Fable Frontend d7a1f52 — the packet says these exist and contain reusable components; inventory them *before* the client ADR so the ADR's "bundled shared UI in C# host" question is answered with real component facts. Affected contract: client ADR + A08/A01 adoption rows.

**Strongest objection.** Six client targets plus two adapters is the plan's largest sprawl risk. Simpler alternative: ship web + one desktop (Tauri Mac) in the first release, keeping the C# Windows lane as the second milestone; tradeoff is deferring an explicit user request, so this needs user sign-off, not a unilateral cut. Motion scope is appropriately small; the 120–220 ms budgets are verifiable via traces and should stay design targets until measured.

**Acceptance checks (not run):** fake-runtime harness covers malformed frames, crash, cancellation, replay of stale approvals; denied filesystem/shell test against the real runtime policy; loopback companion tests only if that option is actually selected.

## PLAN-MAIL

**Verdict: support; no blocker.** The A/B/C activation staging and the warmup-conflicts-with-no-live-sends analysis are correct and should be treated as settled.

**Recommendation.** Make the no-live-send profile a *tested runtime property*, not a configuration convention: the local profile must fail closed if a Resend API key or non-loopback SMTP target is present, with a test asserting the simulator cannot fall through to real transport. Rationale: `MAIL_ACCOUNTS_AND_ACTIVATION.md` prohibits send commands but relies on process discipline; one misconfigured environment variable in a Devin test environment is the realistic accident path. Affected contract: local-completion plan §5 simulator profile.

**Strongest objection / failure scenario.** The Instantly stage-B risk is understated in one respect: connection wizards that auto-send a verification email would breach the constraint before anyone issues a "send." The plan does say stop-and-record, but the acceptance list should require *documented evidence of the current wizard's side effects* (from provider docs or a sandbox account) before stage B is attempted at all. Simpler alternative: drop Instantly from scope until the user explicitly changes the no-live-send constraint, since warmup is unusable until then anyway; tradeoff is losing early connection-flow learning, which is cheap to regain later. Also enforce in fixtures: an alias connected as an independent inbox must fail validation — the aliases-vs-accounts confusion is the main MX/credential risk the inventory template guards.

**Acceptance checks (not run):** one- and two-domain synthetic routing fixtures including a shared alias and a private mailbox; no-live-send profile blocks `emails send`/forwarding/broadcast paths at the code level; redacted-only Resend CLI preflight output.

## Top three cross-task recommendations

1. **Write the reconciling ADR first** (PLAN-ARCH blocker): one short document resolving Rails authority, the Auth/session seam, and the explicit job table, with the stale Node-era references in component-adoption and local-completion updated in the same change. Everything downstream (BE-01, FE-01, the client ADR) is currently briefed against partially contradictory documents.
2. **Add idempotent dispatch and spend caps to agent orchestration** (PLAN-AGENTS): session-search-before-create for Devin, a two-attempt cap per Astra LOW issue, and a defined re-auth/escalation window for the opinion gate so it cannot deadlock silently.
3. **Make no-live-send and MCP-only-tools runtime-enforced and tested** (PLAN-MAIL, PLAN-CLIENTS): both constraints currently lean on configuration discipline; each needs a failing-closed test before any agent (human or automated) runs code against real credentials.

**Hard contradiction to record:** none within the packet is irreconcilable, but the nearest one is the opinion-gate design — the gate that approves PLAN-AGENTS is defined *by* PLAN-AGENTS, so a recovery path independent of the gate (user-decided substitution after a bounded re-auth window) must exist or an authentication failure stalls the entire program again.
