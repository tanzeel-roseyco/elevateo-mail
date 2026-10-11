# FE-01: independent opinion from Opus 5.5

Scope: FE-01 only, against planning base `5ae9771`. BE-01 is in progress and none of its results are assumed. This is read-only advice. I ran no tests, builds or measurements, and every check below is labelled **not run**.

## 1. Verdict

**Change, then support.** The bounded first checkpoint can start without a completed BE-02: primitive extraction, the shell and routes, the typed gateway, and fixture-driven inbox, reader and draft presentation.

Two items are **prerequisite blockers** before any code depends on them:

- **(a)** The session, CSRF and capability contract must be frozen with BE-02.
- **(b)** The rule for resolving an uncertain draft save or send must be frozen. Without it, the UI must either guess or retry with a new identity, and the brief forbids both.

Everything else below is a contract amendment or an optional improvement.

## 2. Section-specific recommendations

### Session and context (blocker)

- **Response shape.** `GET /v1/session` should return `{actor, organization, mailboxes:[{id, display_address, capabilities:[...]}], simulation_mode, session_generation, csrf_token}`.
- **CSRF.** Rails issues a real per-session CSRF token, sent as `X-CSRF-Token` and checked together with `Origin`. This replaces the old `x-elevateo-csrf: 1` marker, which the audit (`frontend-reuse-audit.md`, httpClient row) already identifies as non-secret.
- **Revocation.** Use 401 `session_revoked` and 403 `mailbox_forbidden`. Both are non-enumerating on object routes.
- **Stale-context guard.** The gateway keys every cache entry and in-flight request on `(actor, org, session_generation, mailbox, filters)`. A response whose key no longer matches the current context is dropped before it reaches state.
- **Native reuse.** Put transport authentication behind an `AuthTransport` seam. The web uses same-origin cookies; the Tauri and WPF hosts can later inject PKCE bearer transport without forking the gateway (D-07). Implement only the cookie strategy in FE-01.
- Affected contract: session DTO and error codes.
- Evidence: `contracts-and-reliability.md` conventions, D-02. Gap: no BE-02 DTO exists yet.

### Inbox and reader

- **Cursor errors.** Add `400 cursor_invalid`. On that error the UI resets to page one and keeps the URL filters. It does not loop.
- **Nullable fields.** Summary `sender` and `subject` are nullable, and the UI renders "(no subject)" and similar placeholders.
- **Detail paging.** Detail returns `messages` with its own cursor so long threads can page. An empty `messages` array is valid; ThreadView's "last message exists" assumption must go.
- **Response bounds.** Proposed defaults, for the coordinator to freeze: about 64 KiB for summaries and about 2 MiB for a detail page, with a per-message body cap and a `truncated: true` flag.
- **Plaintext only.** Render bodies as React text nodes inside `<pre>`. Never use `dangerouslySetInnerHTML`, and never route mail through `domain/richText`.

### Drafts (blocker on the uncertain-save rule)

- **Format choice.** Accept body `expected_version` with `409 draft_conflict`, and drop the 412/If-Match alternative. One JSON convention is simpler for the PHP, Java and Swift clients to generate.
- **Conflict payload.** The 409 body returns `{current_version, updated_at, updated_by}`. It does not return the content; the UI fetches that through an explicit "Compare" action, which preserves the local buffer.
- **Save identity.** Add `client_mutation_id` to POST and PATCH, and have the server echo `last_mutation_id` on draft read. After a timeout or 5xx, the UI re-reads the draft. If `last_mutation_id` matches, the save landed; otherwise the buffer stays dirty. This is the only way to resolve an uncertain save without a blind resend.
- **Autosave.** Allow one in-flight save per draft and coalesce later edits. A conflict pauses autosave until the user resolves it.
- **Field limits.** Field sizes and recipient counts are a BE-02 decision. The UI reads them from a `limits` object in the session or draft DTO rather than hard-coding the legacy 30 / 998 / 100,000 values.

### Approval and send (blocker)

- **Envelope source.** Fetch the review envelope from `GET /v1/drafts/:id`, which returns the server-authorized sender, recipients, subject, body, attachment IDs and digests at `version`. Avoid a separate review endpoint so there is one authoritative representation.
- **Lost-response recovery.** D-03 enforces one send intent per draft, so `GET /v1/drafts/:id` should expose `state: editable|consumed` and `send_job_id`. After a lost 202, the UI re-reads the draft. If the draft is consumed, it shows that job. If it is still editable, it may resubmit with the **same** `client_request_id`, persisted in `sessionStorage` per draft and version.
- **Effect.** No new lookup route is needed, and the UI never invents a second identity.

### Send status

- **Job DTO.** `{id, state, cancellable, dispatch_boundary_at?, simulated: bool, delivery_facts:[...]}`.
- **Polling.** Back off from 1 s to 15 s, stop on a terminal state or after about 10 minutes, then offer a manual refresh.
- **Unknown state.** `unknown` shows "Outcome uncertain — under reconciliation" and has no resend action.
- **Cancel.** Shown only when `cancellable` is true. A cancel 409 re-reads the job.

### Collaboration and search

**Defer** all mutations from FE-01's first checkpoint. Real mode hides assignment, note and read controls until BE-02 publishes their routes; fixture mode may show them only under the fixture label.

### Attachments and settings

- **Attachments.** Render status only (`pending_scan|released|quarantined|rejected`), with download through an authenticated Rails route. Real attachments are deferred to BE-05.
- **Settings.** Session information is read-only. Appearance and an in-app reduced-motion override are local.

## 3. Reuse discipline

- **Port.** The audited primitives are sound. Port `httpClient` safeguards as behaviour, not as copied code, and drop `x-elevateo-account`.
- **State.** Do not carry Zustand into FE-01 unless a demonstrated need appears. A small gateway-owned store using `useSyncExternalStore`, with the URL as the only source of navigation truth, covers the needs. This removes a dependency and the risk of the old store's global persistence leaking in.
- **Fixtures out of production.** The fixture adapter lives under a separate entry point selected only by a test or dev build flag. The production build must not contain it, enforced by a build check that greps the bundle for a fixture sentinel. A runtime fallback toggle is not enough.

## 4. Motion, native and C++ position (my owned area)

- **FE-01 motion.** No new motion in FE-01. Preserve the existing reduced-motion CSS and use only instant state changes plus CSS focus and pressed states.
- **FE-02 motion.** FE-02 later adds four transitions, each 120–220 ms and using only transform and opacity:
  - opening the reader pane;
  - the saved acknowledgement, fired only after a server 2xx with the matching version;
  - the conflict banner entrance;
  - status-chip changes driven by the authoritative job DTO.
- **Motion rules.** None of these may gate a send button, delay focus or encode status by motion alone.
- **C++, Qt, WebGPU and shaders.** Rejected for FE-01, and no need has been observed. Mail reading is text layout, so a renderer adds power cost and packaging and accessibility risk with no user benefit.
- **Divergence risk.** The real risk is the WPF and Tauri hosts reimplementing screens. Keeping the gateway and auth seam host-agnostic now prevents that.

## 5. Strongest objection

**Fixture drift.** Hand-written fixtures and Zod schemas can pass F01–F03 while diverging from what BE-02 actually serves. The result looks finished but integrates lossily, for example a nullable sender the backend never nulls, or a cursor shape that differs.

**Simpler alternative.** Delay FE-01 until BE-02 publishes OpenAPI, then generate types.

**Tradeoff.** Waiting loses parallelism and leaves the presentation work idle.

**Recommended middle path.** The coordinator commits a minimal `contracts/v1/openapi.yaml` (session, mailboxes, threads, draft read/create/patch, send, job) with a hash before the first checkpoint. Zod schemas and fixtures are validated against it in CI, and BE-02 must conform to the same file. Changes go only through the contract owner.

## 6. Acceptance checks (all not run)

- **C1.** The production bundle contains no fixture sentinel, and a forced API 500 in production config shows an error, not fixture data.
- **C2.** Switching mailbox or logging out mid-request discards the late response. This is tested with a delayed fixture and later against real Rails.
- **C3.** On a PATCH timeout followed by a re-read with matching `last_mutation_id`, the UI shows "saved". On a mismatch, the buffer is retained and the save shows as unsaved.
- **C4.** Two-editor conflict: the 409 preserves the buffer, Compare loads the server version, and the displayed revision does not advance on failure.
- **C5.** On a lost 202, the re-read shows `consumed` with the job. If it is not consumed, the resubmission carries the same `client_request_id`, verified in the request log.
- **C6.** `unknown` and `accepted` never render as "Delivered" or "Resend".
- **C7.** A hostile-content fixture (`<img src=http://…>`, `<script>`, `javascript:` links) produces zero network requests in the Playwright trace and renders as inert text.
- **C8.** Keyboard-only run of compose, review and cancel. Focus returns to the trigger after dialogs close. At 390 px there is no horizontal overflow. Emulated reduced motion causes no transform animation.
- **C9.** Interaction baseline: record INP and long tasks for inbox navigation with a 50-row page in Chromium in Docker. This is a baseline only, not a pass/fail claim.

**Residual uncertainty.**

- BE-02's actual session mechanism (cookie facade versus token) is unknown.
- `last_mutation_id` and `send_job_id` on the draft read require backend agreement.
- The bundle-exclusion approach depends on the Vite configuration.
- Real-integration checks F02, F04, F05 and F07 cannot close on fixtures.

## Top three recommendations

1. Freeze a hashed minimal OpenAPI file before the first checkpoint, and validate fixtures and Zod against it.
2. Add `client_mutation_id`/`last_mutation_id` and draft `state` plus `send_job_id` so uncertain saves and sends resolve by re-reading, with no new identities.
3. Exclude the fixture adapter at build time and add an `AuthTransport` seam so desktop hosts reuse the gateway unchanged.

## Hard contradiction

`contracts-and-reliability.md` permits "409/412" while the brief proposes 409-only. Settle on 409 `draft_conflict` and update the reliability document in the same contract commit.
