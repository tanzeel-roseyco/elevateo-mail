# BE-02 Fable 5 opinion ? actual execution

Input SHA256 a3f17045e122424738b01b4bd85dd13dc58a7aba1cd7a5aab838766e0f63e1b0; frozen common b0e80a92d2871b85e0b3fd4b49780f635732a2cc37ef5b5b26031c85d3c2154a. Requested/returned canonical claude-fable-5, firstParty; session 50638da7-35a7-4db6-a93e-092c69f43ca1. Exit0, success/completed/end_turn, 75.552s, reported list cost $4.580313 (not billing). One turn; 4494 output tokens. No tests or implementation. Raw modelUsage maxOutputTokens64000 is model capability telemetry, not proof of the requested 8192 control.

Coordinator assessment: substantive independent advice, not accepted design. TTL Auth corroboration conflicts with immediate current-auth requirements; refresh locking alternative does not establish a durable in-flight lease; no-migration claim for first slice conflicts with new session persistence. Route/schema and detailed acceptance gaps remain synthesis obligations. Preserve these disagreements verbatim.

# Fable 5 independent opinion — BE-02 (claude-fable-5, fresh session)

Runtime note: this session is powered by `claude-fable-5`, matching the requested exact model. This is a tools-disabled design opinion on the supplied packet only; no tests were run, no files edited, and nothing below is execution evidence.

## Task 1 — Legitimate browser entry (login/onboarding)

**Verdict: support the opaque server-owned cookie candidate; prerequisite blocker on the Auth proxy/facade routing decision.**

- **Recommendation:** Accept Rails-to-Auth password exchange with server-held tokens, but freeze the facade routing contract first. The pinned Auth routes lack the `/auth/v1` gateway prefix while Compose configures mailer URL paths with that prefix (`GOTRUE_MAILER_URLPATHS_INVITE: /auth/v1/verify` against direct `http://auth:9999` paths); the invite callback will 404 unless Rails deliberately proxies those paths. Affected contract: session lifecycle (readiness-handoff gap 1). Evidence: `docs/research/be-02-auth-delta.md` routes row; `compose.yaml` auth environment. This is exactly the kind of mismatch Devin cannot resolve from a brief — the synthesis must hand it a concrete route table, not a "choose a facade" instruction.
- **Objection/failure scenario:** The configured `GOTRUE_JWT_ISSUER: http://localhost:9999` versus internal URL `http://auth:9999` means issuer validation written naively against the internal URL fails, or worse is skipped. Simpler alternative: make issuer an explicit Elevateo config value validated at boot (the existing `Elevateo::Config` fail-closed pattern fits), at the cost of one more required setting.
- **Acceptance checks (not run):** real invited confirmed user completes login through the Rails route; invite/recovery mail captured in Mailpit resolves through the actual proxied callback path; signup, unconfirmed user, banned user, and malformed credentials uniformly rejected with generic errors. Residual uncertainty: effective pinned-image defaults for session rotation/reuse are unverified (the auth-delta file says so explicitly).

## Task 2 — Refresh and logout

**Verdict: support with one change — specify refresh serialization as an application-DB row lock, not an in-process mutex.**

- **Recommendation:** Persist encrypted refresh material in an application `sessions` table and serialize refresh per session with `SELECT ... FOR UPDATE` on that row, releasing before Auth HTTP I/O and recording a pending-refresh marker. Rationale: the API runs multi-process (Puma workers + potential horizontal scale); a Ruby mutex gives false safety, and the upstream 10-second reuse interval is documented guidance, not a verified setting of the pinned container. Affected contract: session lifecycle. Evidence gap: no verified pinned-image reuse-interval behavior — labelled experiment 3 in the auth delta, not run.
- **Objection:** "Release lock before Auth I/O" reopens a window where two refreshes race. Simpler alternative: hold a short advisory lock (`pg_advisory_xact_lock` keyed on session ID) in a dedicated short transaction wrapping only the token swap commit, with the Auth call outside any transaction and a bounded retry on lock contention. Tradeoff: slightly more code, but it respects the hard rule of no DB transaction across provider I/O.
- **Acceptance:** concurrent refresh from two tabs yields one upstream call or two reconciled outcomes with no resurrected session; logout racing refresh never re-persists tokens after the logout commit; local logout clears browser state even when Auth returns 5xx, with global revocation recorded as pending.

## Task 3 — Current authentication / revocation consistency

**Verdict: support `/user` online check as the candidate, with the linearization point stated as "committed application session row state at the start of the request's tenancy transaction."**

- **Recommendation:** Treat the application session row (not the Auth JWT) as the authority checked on every protected request, with a bounded-TTL online `/user` corroboration (e.g., every N seconds per session, configurable, failing closed on outage). This keeps the hot path one DB read inside the existing `Tenancy.with_context` transaction, giving coherent membership + revocation + data in one snapshot — the exact coherence the brief demands. Evidence: BE-01 tenancy mechanism is proven (R3b 698-assertion suites); extending its transaction to include the session/membership read is the lowest-risk design.
- **Objection:** Auth-side bans/expiry policies then lag by the corroboration TTL. The brief itself concedes Auth HTTP and app reads cannot be atomic; the honest answer is to document the bound (TTL) rather than pretend a second `/user` call per request eliminates it while doubling latency and Auth load for ten users. Simpler alternative rejected: per-request `/user` — defensible for this user count, but makes Auth a hard availability dependency of every read.
- **Acceptance:** revocation committed at T denies any request whose authorizing read begins after T; in-flight reads complete under the old snapshot and the FE discards them via context/version (already specified in the contract). Not run.

## Task 4 — Organization switch

**Verdict: support; optional improvement on refresh/rotation coupling.** Enumerate from `organization_memberships` under the real session identity; the target ID selects among authorized rows only. Recommend that org switch rotates `context_id` and `authorization_version` but does **not** force a token refresh — coupling them adds an Auth round trip and a new failure mode for no security gain, since org context is application-owned. Failure scenario: two tabs switch to different orgs; the context header check (409 `context_changed`) already handles this — test it explicitly with interleaved responses. Acceptance: prior-org response arriving after switch is rejected by version mismatch; drafts survive switch durably.

## Task 5 — Durable draft operations

**Verdict: support the direction; prerequisite blocker — the operations table contract must be frozen before BE-02C dispatch.**

- **Recommendation:** One `draft_operations` table: `(operation_id, actor, org, mailbox, draft_id, payload_digest, resulting_version, outcome, created_at)`, unique on operation_id scoped to actor+org, written in the same transaction as the draft version row. Lookup reauthorizes, matches digest (mismatch → conflict), and distinguishes `applied`/`superseded`/`not_found`/`expired`. This directly resolves the "save A lost, save B accepted, lookup A" scenario: A's row exists with `resulting_version`, independent of current draft version. Retention: fixed window (e.g., 24h) with tombstone semantics documented so an expired lookup returns `expired`, never a false `not_found` that invites unsafe retry.
- **Objection:** operations-table growth and a second write per save. For ten users this is noise; the simpler alternative (FE-D05's rejected `last_client_request_id`) is already ruled out by accepted decisions, correctly.
- **Acceptance:** two writers on one version → one 409 `draft_conflict` with `expected_version` JSON (FE-D05, reconciling the stale 412 branch in `docs/contracts-and-reliability.md` — the coordinator owes that edit); replayed same-payload save is idempotent; different payload on the same operation ID rejected; revoked caller cannot read outcomes. Not run.

## Task 6 — Remaining scope (threads/messages, collaboration, search) and ordering

**Verdict: support the BE-02A→D decomposition; change one ordering detail.** The proposed slices are right: BE-02A (session bootstrap + `GET /v1/mailboxes`) is the correct smallest end-to-end slice because it exercises every cross-cutting mechanism (real Auth, cookie, tenancy transaction, serializers, cursors-lite, 401/404/409 taxonomy) with only existing tables — no new migrations. Recommendation: fold assignment/notes/read-state (BE-02D's collaboration half) in **before** search, since search acceptance ("no leaks through counts/snippets") depends on read-state and private-mailbox semantics being settled; searching before collaboration exists invites re-testing. Objection: this lengthens the path to a demo-able search. Tradeoff accepted: correctness of leak tests over demo order. For search itself, plain PostgreSQL (`tsvector` or even ILIKE for this scale) behind the authorized tenancy transaction is sufficient; defer index tuning until a representative dataset exists.

**Devin implementability:** the brief is implementable *per slice* only if the synthesis delivers frozen route schemas (the readiness handoff is honest that mutation routes "remain to be frozen"). Full-scope BE-02 in one Devin dispatch on $10 prepaid credit is not credible: BE-01's history (multiple repair lanes, 30-minute checkpoints, max two repairs) shows the realistic burn rate. Dispatch BE-02A alone first, with its own acceptance, and verify live credit before launch as the brief requires.

## Task 7 — Claude/Fable in-app adapter (future Fable-owned)

**Verdict: support the design direction; three proof obligations before any product promise.**

1. **Authentication route is the gating unknown.** The client plan correctly cites that third-party products cannot offer claude.ai login without prior approval. Before promising "connect your Claude" in the UI, obtain written confirmation of a supported route (API key via Agent SDK, or documented approval). A disabled connector with a stated reason is the only honest default. Do not build UI that implies subscription reuse.
2. **Protocol lifecycle:** the proposed binder interface (`startSession`/`startTurn`/`streamEvents`/`respondToApproval`/`cancelTurn`) is sound, but pin the Agent SDK version and generate/verify event schemas from it — the same discipline as the Codex adapter. The fake-runtime harness must emit malformed frames, mid-stream crash, duplicate approval responses, and cancellation-after-completion races; these are where adapters rot. The harness is the right first deliverable and keeps the adapter testable without credentials.
3. **Permission enforcement must be runtime policy, not prompt.** The mailbox-assistant mode must have filesystem/shell tools absent from the tool registry handed to the SDK session, verified by a test that attempts a shell call and asserts a policy rejection event — exactly as the client plan demands. Separation from mailbox MCP is clean in the design: MCP grants gate data, the adapter gates process; keep the test suites separate so neither is claimed to prove the other.

Maintainability note for the future owner: the adapter and the Codex adapter should share only the binder interface types, not implementation — provider protocol drift is independent, and a shared abstraction layer here historically decays into provider-conditional spaghetti.

## Top three cross-task recommendations

1. **Resolve the issuer/callback-path mismatch (internal `auth:9999` vs configured `localhost:9999` issuer and `/auth/v1/*` mailer paths) in the synthesis itself**, as a concrete route/config table. It touches login, refresh, and invite flows and is the likeliest BE-02A implementation stall.
2. **Freeze the `draft_operations` contract before BE-02C**, with digest matching and explicit `expired` semantics; it is the one piece FE Stage II hard-depends on and the accepted decisions only sketch.
3. **Dispatch Devin per-slice (BE-02A first) with refreshed live credit evidence**, not full BE-02; the prepaid-credit history makes a single full-scope dispatch an avoidable failure mode.

**Hard contradiction found:** none at the architecture level. One documentation contradiction: `docs/contracts-and-reliability.md` still carries the 412 stale-draft branch that FE-D05 rejected in favor of 409 `draft_conflict`; the coordinator must reconcile it before Devin reads both. The blanket "BE-02 depends on accepted BE-01" versus the handoff's "native Windows is not a technical prerequisite for Linux BE-02" is a sequencing tension the coordinator must dispose of explicitly, as the handoff itself says — I support recording Windows/Lane P2 as retained platform debt rather than a BE-02A blocker.