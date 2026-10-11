**Verdict on FE-01: change, then proceed.** The brief's structure is sound. Two items are prerequisite blockers before dependent code: the contract has no canonical machine-readable form, and the lost-response recovery path for send has no defined lookup. Everything else below is an improvement or a confirming decision.

## Contract decisions to settle before dependent code

These are design judgments on the proposals in the brief. The supplied documents show the routes exist only as prose in docs/contracts-and-reliability.md; none are implemented.

| Boundary | Decision I recommend |
| --- | --- |
| Session | One `GET /v1/session` returning actor, organization, mailbox capabilities, `simulation_mode` and a server session identifier. Cookie is HttpOnly and SameSite. Rails enforces Origin or Sec-Fetch-Site plus a required custom header for mutations. The old marker header stays only as that custom header. 401 carries `session_expired` or `session_revoked`; UI treats both identically. |
| Inbox/reader | Cursor is opaque and server-bound to actor, organization, mailbox, sort and filters. Invalid cursor returns 400 `cursor_invalid`; UI restarts from page one. Inaccessible or missing object returns one non-enumerating 404 code; UI shows "not available", clears detail, returns to inbox. Body field is `body_text`, nullable sender and subject. No autolinking in the reader. |
| Drafts | JSON body `expected_version`, not If-Match. Stale write returns 409 `draft_conflict` with `current_version` and the authoritative draft in the error body. Draft DTO gains `status` with values editable, consumed, cancelled, plus `last_client_request_id` and `send_job_id` when consumed. PATCH carries `client_request_id`. |
| Review and send | Review envelope is a separate `GET /v1/drafts/:id/review` at a stated version. Send with a consumed draft returns 409 `draft_consumed` including the existing `send_job_id`. |
| Job | DTO includes `state`, `cancellable`, `simulated`, `approved_version`, `poll_after_ms`, and a separate `delivery_facts` array. Cancel too late returns 409 with current state. |
| Attachments | Status enum pending_scan, quarantined, released, rejected. Download only through `GET /v1/attachments/:id/content` with session recheck. UI renders a link only for released. |

**Rationale for the draft and send fields.** The brief asks how the UI reconciles a lost send response when no job ID arrived. The cleanest answer is that the draft itself records consumption and its job. The UI reads the draft, never invents a request. The same `last_client_request_id` field lets a PATCH that timed out be reconciled by reading the draft instead of re-sending with a guessed version.

**Blocker: canonical contract format.** Accepted decision D-07 requires client bindings generated from one versioned OpenAPI source. The brief proposes hand-written Zod schemas from a prose contract. BE-01 deferred generated API tooling to BE-02. Resolve by freezing the contract as an OpenAPI document with a hash, and requiring a conformance test that runs every fixture through that schema. Zod may remain the runtime validator, but it is derived or checked, not canonical. Without this, FE-01 and BE-02 will each be "right" against different texts.

## Strongest failure sequences

Each is a hypothesis with a proposed regression check. None were run.

- **Spurious conflict overwrite.** User saves draft version 4. Request times out after the server applied it. UI retries with version 4, receives conflict, user picks "reload", loses nothing. But if the UI instead increments to 5 on the assumption the write landed, a concurrent editor's version 5 is overwritten. Check: fixture where PATCH times out, server state is version 5 with the same `last_client_request_id`; assert the UI reconciles by read, never by a second PATCH with a new identity.
- **Duplicate approval across devices.** Device A sends draft version 4. Device B holds a review of version 4 and sends with a different `client_request_id`. Server returns 409 `draft_consumed` with job ID. A UI that maps all 409s to "try again" invites a resend after a clone. Check: fixture 409 with job ID must render "already approved" and link to the job. Real multi-device verification remains a BE-03 gate.
- **Late response after mailbox switch.** User opens thread in mailbox M1, switches to M2, membership in M1 is revoked, the M1 detail arrives late. Check: gateway context token includes actor, organization, mailbox and filters; a response whose token differs from the current context is dropped. Logout aborts all in-flight requests. Test with two synthetic users and a delayed fixture.
- **Delivered claim from 202.** The simplest UI bug is a "Sent" toast on 202. Check: every state string in the status surface comes from the job DTO; a test asserts no "sent" or "delivered" copy is reachable from queued or accepted.
- **Fixture fallback in production.** If the fixture adapter is selected by a runtime flag, a broken API in production could show synthetic mail. Check: fixture adapter lives in a separate entry point excluded from the production build. Grep the built bundle for the fixture label and for any Supabase key pattern.
- **Autolinked plaintext.** A body containing a tracking URL becomes a clickable link, which later tempts a prefetch. Decision above: inert text only in FE-01.

## Reuse candidates that retain old authority

From docs/research/frontend-reuse-audit.md, these carry capability assumptions that must not survive extraction:

- The transport client's account header implied authorization. Drop it. Authorization comes from the session facade only.
- LiveShell's session and capability contract and the `connected && sendEnabled` gating. Replace with the capability DTO; UI flags explain availability, never grant it.
- ComposePage's immutable send-request creation and replacement-send flow. Presentation reference only.
- Sidebar's store imports and unread calculation. Extract the frame symbol alone.
- The Markdown helper. Not a sanitizer. Excluded from the reader.
- Bits.tsx's simulated unsubscribe. Remove.
- The old 262,144-byte bound. Set per endpoint; thread detail needs a larger explicit budget.

**Simpler alternative and tradeoff.** The brief could skip the review endpoint and reuse the draft read as the envelope. That saves a route but mixes the editable DTO with the server-authorized sender and attachment digests. A separate review route makes "edit invalidates review" testable by version mismatch. Keep the separate route.

## Checkpoint without BE-02 and what proves integration

The first checkpoint can be completed on fixtures alone: shell, routes, pure domain state machines for draft edit states and conflict recovery, reader safety, and the gateway with schema validation. Checks F01, F03, F08 and F09 can be fixture-closed.

Checks F02, F04, F05, F06 and F07 close only against the real Rails, Supabase and simulator stack on an isolated Docker network with service names. Same-origin cookies require one origin, so the test network needs a reverse proxy container fronting both web and API. The brief does not name this container; add it to the coordinator-owned Compose.

**Dependency order is feasible** only if the contract hash is published before the fixture adapter is written, and BE-02's own three-opinion gate is allowed to amend it. Freezing now does not preempt that gate; it gives BE-02 a concrete input. Record that FE-01's fixtures target a draft contract revision, and that any BE-02 amendment triggers a fixture regeneration, not silent divergence. Runtime schema validation makes divergence loud.

**Residual uncertainty.** No runtime pin for Node or Vite is verified. The audited versions are inspected source, not an installation. Lock-based advisory review for transitive packages has not been performed. Whether Rails will serve the built UI or a proxy will is undecided, and it changes the cookie and CSRF story. The verbatim user review rubric is absent from the repository, so the adversarial review gate cannot yet be claimed.

## Top three recommendations and contradictions

1. **Freeze an OpenAPI document** with a hash before the fixture adapter exists. Make Zod validation a checked derivative. This resolves the D-07 contradiction with the brief's schema plan.
2. **Put consumption state and job ID on the draft DTO**, and `client_request_id` on PATCH. This closes both lost-response paths without any new send request.
3. **Separate the fixture adapter at build time** and prove absence in the production bundle, alongside a secret-pattern grep.

Hard contradiction: D-07 mandates generated clients from one OpenAPI source; the brief proposes defining typed schemas from a prose contract with no stated generator or canonical file. The task backlog also lists BE-02 as owning API tooling while the brief asks FE-01 to publish a contract revision first. The coordinator must name the single canonical artifact and its owner before either side writes against it.
