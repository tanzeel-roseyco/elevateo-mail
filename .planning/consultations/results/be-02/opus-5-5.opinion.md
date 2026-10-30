# BE-02 Opus 5.5 opinion - actual execution

Input SHA256 eef6804b1879905d80811dc7ec54687e7e5ba7fe738bc645bdc46a01a5e75d6a; common b0e80a92d2871b85e0b3fd4b49780f635732a2cc37ef5b5b26031c85d3c2154a. Requested/returned canonical claude-opus-5-5, firstParty; session ccb6a1ac-8dd2-454f-81eb-af034960756e. Exit0, success/completed/end_turn, 66.937s, list cost $1.869067 (not billing). One turn, 5924 output tokens. No tests or implementation. Requested output control8192; model capability telemetry128000 is not enforcement proof.

Coordinator assessment: substantive independent advice, not accepted design. Post-call CAS does not prevent simultaneous upstream refresh; durable serialization needs synthesis. Read-only tenancy compatibility, revocation ordering and pinned invite callback semantics need verification. Preserve cookie/native, callback prefix, 409/412, plaintext and mailbox_id documentation contradictions for explicit disposition.
# BE-02 — Independent opinion (Opus 5.5 focus: UX, platform boundaries, measured performance)

**Basis:** supplied packet only. Nothing was run or tested. "Design judgment" marks reasoning that is not sourced from a packet section.

## 1. Verdict: **CHANGE**. Support the full scope, with one prerequisite blocker and several contract amendments

- **Prerequisite blocker.** The BE-01 real-Auth gap (readiness handoff, "Remaining foundation gate", rows B01-03/04/06) must close before BE-02A implementation.
  - BE-02A *is* real-Auth work, so it cannot rest on SQL-fixture UUIDs.
  - The other gaps should not block Linux BE-02A, provided the coordinator records an explicit sequencing disposition. Those gaps are: B01-05 Storage, Windows/Lane P2, SBOM provenance, and the R1 residual oracles.
  - Blocking BE-02 on native Windows would serialize unrelated platform debt.
- **Other dispatch gates (operational, not design).** Fresh exact-model gate, frozen input, and live credit/cap evidence.
- **Optional improvement.** The changes below. None of them expands scope.

## 2. Recommendations

**R1. Make the session record transport-agnostic now.** Affects the session contract, desktop host and mobile clients.
- The proposal: `app_auth.sessions` holds the encrypted refresh token, `auth_session_id`, `revoked_at`, `rotation_generation`, the selected org, and a CSRF secret. Cookie (web) and bearer (native) are two *presentations* of one row.
- Evidence: the OpenAPI `sessionCookie` is host-only with SameSite=Strict, and ADR 0002 has React shared by Tauri (Mac) and WPF/WebView2 (Windows).
- A bundled UI served from `tauri://localhost` or a WebView2 virtual host is cross-origin to the API. A Strict host-only cookie will not flow there.
- If BE-02 hard-codes "session = cookie", DESK-01 will invent a second session authority. That is exactly the divergence the brief warns about.
- Design judgment: do not implement native bearer now. Do shape the table and the `Current.principal` resolver so that native PKCE + OS-keychain tokens add only a presenter, not a second revocation path.

**R2. Login, invite and recovery all go through Rails; there is no fragment flow.**
- `POST /v1/auth/login` with `{email, password}`. Pre-session login-CSRF uses a short-lived double-submit token minted by `GET /v1/auth/login-challenge`, plus an exact Origin check.
- The Mailpit invite link targets a Rails route: `GET /auth/accept?token_hash=…&type=invite`. That route renders a minimal set-password step, then calls Auth `verify` server-side.
- Responses are generic `invalid_credentials` and are rate-limited per IP and per email.
- Evidence: auth-delta token.go lines 129–140 (fragment helper). Compose sets `GOTRUE_MAILER_URLPATHS_* = /auth/v1/verify`, which must be repointed to the Rails route. That is a config-change acceptance item.
- UX point: invite completion is the first screen a new staff member sees. It must work keyboard-only, announce errors, and never echo the token.

**R3. Per-request authentication = local session row + online Auth `/user`, failing closed as 503 (not 401) on Auth outage.**
- For ~10 users, an internal `/user` call per request is cheap. Design judgment: **measure** p95 added latency against a ≤20 ms budget before considering any cache.
- Reject any positive cache, consistent with the brief.
- Outage semantics:
  - Auth unreachable → `503 temporarily_unavailable`. The UI keeps its draft buffer and shows a retry state.
  - Return 401 only on a definitive invalid or revoked result. This prevents an Auth blip from wiping every user's screen, which is the most user-visible failure mode.
- Reject absent or nil `session_id`. Validate iss/aud/alg/exp in Rails independently (auth-delta, middleware row).

**R4. Linearization point = PostgreSQL commit.** Affects the read transaction protocol.
- Each protected request runs in one `REPEATABLE READ READ ONLY` transaction inside `Tenancy.with_context`. Order within it:
  1. Session-row check (`revoked_at IS NULL`).
  2. Authorization-version compare.
  3. Data reads.
- A revocation or membership removal committed before the snapshot is denied. A snapshot taken before the commit may complete. The race is therefore bounded by one request duration plus the `/user` call, which precedes the snapshot.
- Disclose that bound; do not claim it is atomic.
- `authorization_version` = per-(user, org) bigint, bumped by trigger on any org/mailbox membership change. Cursors HMAC-bind it, so pagination after revocation yields 409 or 401, never stale rows.

**R5. Logout defaults to `scope=local`, with an explicit "sign out everywhere" action.**
1. Mark the local row revoked and clear the cookie *first*. This is the commit, and the user is signed out locally regardless of Auth state.
2. Then call Auth logout. If upstream is uncertain, enqueue a durable `auth_revocation_pending` record that the worker retries.

Refresh/logout race: refresh does a compare-and-set on `rotation_generation WHERE revoked_at IS NULL` *after* Auth returns. A revoked row discards the new tokens and calls Auth logout for them, so the session cannot be resurrected. Two-tab refresh uses the same CAS. The loser re-reads the row and does not call Auth again.

**R6. Drafts get a separate `draft_operations` ledger.**
- Fields: `(operation_id, actor, org, mailbox, draft_id, payload_sha256, outcome, resulting_version, created_at, expires_at)`. It is inserted in the same transaction as the draft write, with a unique `operation_id` per actor/org.
- Add `GET /v1/draft-operations/{id}`, reauthorized on every call. Revoked or foreign callers get the same 404.
- Retention: 7 days, then a tombstone `expired` state. After expiry the client must re-read the draft and must not replay.
- Scenario 5 resolves cleanly: A's lookup returns `applied, version 4` (or `not_found`) independently of B's version 5.
- UX: the conflict view preserves the local buffer and offers compare/reload. Autosave is serialized with one in-flight write.

**R7. Collaboration and search.**
- Assignment carries `expected_assignment_version`; a conflict returns 409 `assignment_conflict`.
- Eligible assignee = current mailbox member, checked in the same transaction.
- Read state uses explicit `PUT /v1/threads/{id}/read-state`; GET never mutates it. The FE marks a thread read after a dwell period, not on render.
- Notes are visible to mailbox members only, under the same RLS policy shape.
- Search uses PostgreSQL `tsvector` over subject/body/participants with an RLS-filtered query. Return **no total counts**: "about N results" leaks private-mailbox volume. Snippets come only from authorized rows, as plaintext. The query is bounded to 256 chars and 50 results.

**Evidence gaps.**
- The effective refresh-reuse interval and the session-expiry config of the pinned image are unverified.
- The cost of the `/user` call is unmeasured.
- The tauri/WebView2 origin behavior is untested.

## 3. Strongest objection and simpler alternative

**Failure scenario (recovery).** The worker's `auth_revocation_pending` retry plus local revocation still leave a real window: an attacker holding a stolen *access* JWT can call Supabase directly for up to 3600 s. Elevateo never exposes Auth publicly, so the exposure is limited to PostgREST/Storage, which BE-01 made private. The JWT lifetime of 3600 s is still too long for a shared mailbox, and `/user` does not check app-level revocation.

- Change: drop `GOTRUE_JWT_EXP` to ~300 s and refresh server-side.
- Proposed test (not run): a JWT presented directly to internal rest/storage after logout is denied.

**Simpler alternative.** Skip `/user` entirely. Trust the local session row plus short JWT expiry, and verify Auth only at refresh.
- Tradeoff: fewer moving parts and no Auth dependency on reads.
- Cost: an admin ban or password reset in Auth takes up to one access-token lifetime to apply.
- Acceptable only if the user explicitly accepts a ≤5-minute window. I prefer R3 until measurement shows it hurts.

**UX objection.** Context/version headers plus 409 re-bootstrap can cause a visible "flash" on every membership change in a ten-person team.
- Mitigation: bump the version only for the *affected* user/org, not globally.
- FE-02 motion must never animate a stale list into view. Clear first, then animate in authoritative data.

## 4. Acceptance checks (all proposed; none run)

1. Real invite → Mailpit link → Rails accept → set password → login, all in a real browser. Signup is rejected. No token appears in the URL fragment, logs or storage.
2. Logout committed during an in-flight refresh: the session is not resurrected. Two-tab refresh: exactly one Auth refresh call.
3. Auth stopped: protected reads return 503, the cookie is retained, and the draft buffer survives. Auth restored: requests resume without re-login.
4. Membership removed between the `/user` check and serialization: either the full prior snapshot or a denial, never mixed rows. Cursor after removal → 409 or 401.
5. Draft scenario 5, run under revocation. Same `operation_id` with a different payload → 409 `operation_mismatch`.
6. Org switch while search/detail responses are in flight: the FE discards late responses. A Playwright trace shows no prior-org text painted.
7. Search returns no hits, counts or snippets from private, foreign or revoked mailboxes, on pool-size-1 and pool-size-5 connections.
8. Measured p95 latency for session/mailboxes/threads/detail/search on the ten-user fixture, with the budget agreed before dispatch.
9. Reduced-motion and keyboard checks on login, conflict and context-changed states.

**Residual uncertainty.**
- Pinned-image session policy.
- WebView2/Tauri cookie behavior; DESK-01 must prove it.
- Real query plans at representative history size.

## Cross-task top three

1. **One session authority with multiple presenters (R1).** Without it, the C# Windows and Tauri hosts will each fork session logic. This is the largest divergence risk in the packet.
2. **State the linearization point as "PostgreSQL commit, bounded by one request" (R4) and test it.** Do not promise atomicity across Auth HTTP and the database.
3. **Treat the Auth outage as 503, not 401 (R3).** This preserves user work. The UI must make "service paused" visually distinct from "signed out."

**Motion/C++ note.** No C++, Qt, native binding or graphics work is warranted by BE-02. FE-02 motion should animate only acknowledged saves and authoritative state, within the 120–220 ms budget, with reduced-motion as an instant state change.

## Hard contradictions

- **Cookie vs desktop hosts:** the OpenAPI cookie (host-only, SameSite=Strict) conflicts with ADR 0002's bundled React in Tauri/WebView2 hosts. It must be resolved before DESK-01 and shaped now in BE-02.
- **409 vs 412:** `contracts-and-reliability.md` still allows 409/412 for stale drafts, while FE-D05 fixed 409 `draft_conflict`. The coordinator must amend the reliability doc.
- **Stale HTML wording:** `end-goal.md` says "email HTML is sanitized and isolated," while ADR 0002 mandates plaintext. The end-goal text is stale.
- **Thread route shape:** `GET /v1/threads/:id` in the reliability doc lacks the required `mailbox_id` query that the canonical OpenAPI mandates.
- **Auth mail paths:** `GOTRUE_MAILER_URLPATHS_*=/auth/v1/verify` presumes a gateway that BE-01 removed. The invite flow is broken until it is repointed.