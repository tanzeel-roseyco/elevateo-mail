# FE-02 C/D frontend integration — implementation report

Dispatch `task_9073df983ef8` / `ctx_82d9d287a831`. Target: `apps/web` on `review/ultra/frontend-reader`.
Contract: `contracts/v1/openapi.json` **1.0.0-collaboration.1** (additive, frozen) with the canonical
`be02-cd-contract.md`; generated types `apps/web/src/data/generated/api.d.ts` as present in the tree.

**Nothing in this report was executed.** Per the coordinator's standing ruling every application
check (typecheck, lint, unit, browser) runs only in the validator's Docker containers; this worker
used static source inspection on the host. Runtime status of every test listed below is **NOT RUN**.

## 1. What was built

All 13 contract operations have a typed gateway method, an HTTP route, a stateful fixture path and
a usable UI flow. No method is unimplemented. No live send UI exists; every simulated surface is
labelled (header badge, footnote, draft badge "Draft only — nothing is sent", drafts list badge
"Stored on this installation only", fixture entry banner).

| Area | Contract | UI entry |
| --- | --- | --- |
| Drafts | `GET/PUT /v1/drafts/{id}`, `GET /v1/drafts`, `GET /v1/draft-operations/{id}` | Sidebar "Drafts" (compose mailboxes) → `DraftsPage` → `DraftEditorPage`; reader "Reply as draft" |
| Read state | `PUT /v1/threads/{id}/read-state` | `ReadStateControl` in the reader |
| Assignment | `GET/PUT /v1/threads/{id}/assignment` | `AssignmentPanel` in the reader |
| Notes | `GET/POST /v1/threads/{id}/notes` | `NotesPanel` in the reader |
| Membership | `GET/PUT/DELETE /v1/mailboxes/{id}/members[/{user}]` | Sidebar "Members" (manage_members mailboxes) → `MembersPage` |
| Search | `GET /v1/search` | Header search form (≥ sm) and sidebar "Search" → `SearchPage` with `q`/`mailbox` in the URL |

### Data boundary (`src/data`)
- `contract.ts`: closed Zod schemas for all 22 C/D components plus browser-validated inputs
  (`DraftSaveInputSchema`, `ThreadReadStateInputSchema`, `ThreadAssignmentInputSchema`,
  `ThreadNoteInputSchema`, `MailboxMemberInputSchema`, `SearchQuerySchema` with the Unicode
  White_Space rule, `MembershipDeleteQuerySchema`), code-point bounds, `ResourceVersion` 0..2^31-1,
  `CD_MAX_BYTES` / `CD_MAX_REQUEST_BYTES` from the `x-max-*-bytes` extensions.
- `errors.ts`: `COLLABORATION_ERROR_CODES` superset; A/B routes keep the narrow `Error` enum,
  C/D routes parse `CollaborationError`. `isUncertainWriteOutcome` classifies writes.
- `http/transport.ts`: `PUT`/`POST`/`DELETE`, per-route request budgets, per-route error envelope,
  `requestJsonWithStatus` so 201 (created) and 200 (replayed) are distinguishable.
- `gateway.ts` / `http/httpGateway.ts`: 13 methods; context headers on every call, `X-CSRF-Token`
  on writes, `Origin` left to the browser; input validated before dispatch; DELETE carries no body.
- `fixtures/collaborationState.ts` (+ `fixtureGateway.ts`): in-memory model of ledger-first replay,
  `operation_mismatch` on reuse with different content/binding, recorded conflicts, consumed and
  expired terminals, idempotent read state, revisioned assignment, immutable notes with identical
  replay, membership with the last-manager guard and actor authorization rotation, literal search.
  A scripted example per operation overrides the state (how browser specs force 409/503).

### Domain (`src/domain/draftOperation.ts`, pure)
One operation id binds one frozen payload. `beginSave` reuses an uncertain attempt unchanged;
`applySaveFailure` maps 409 `draft_conflict`/`draft_consumed` → conflict (no auto-rebase),
`operation_mismatch` → unusable, 400/404 → rejected, 429/503/500/timeout/network/abort/ownership
loss → uncertain; `reconcile` applies ledger outcomes and keeps `unknown` pending; `rebase` and
`adoptServerCopy` are the only ways out of a conflict and both require a fresh server read first.

### App policy (`src/app`)
- `protectedRequest.ts`: every C/D call captures the scope generation and an AbortController,
  returns `ok | stale | failed`, routes 401/409 `context_changed` through `handleError`, aborts on
  unmount in a layout effect. Pages apply nothing on `stale`.
- `collaborationFailure.ts`: user-facing text keyed on the error code only; writes carry the
  "may or may not have been stored" qualifier when uncertain.
- `mailboxes.tsx`: the loaded mailbox list shared as capability display hints (server decides).
- `Shell.tsx`, `Sidebar.tsx`, `SearchBox.tsx`, `App.tsx`: routes, sub-links, search entry, footnote.

### Features
`features/drafts/DraftsPage.tsx`, `features/drafts/DraftEditorPage.tsx`,
`features/thread/ReadStateControl.tsx`, `features/thread/AssignmentPanel.tsx`,
`features/thread/NotesPanel.tsx`, `features/members/MembersPage.tsx`,
`features/search/SearchPage.tsx`, `ui/Field.tsx`, `lib/ids.ts`.

## 2. Rules and how they are honoured

- **Exact retry**: the draft editor and the notes panel freeze `{operation_id|note_id, payload}`
  and resend that pair; a later local edit never re-keys the pending attempt
  (`draftOperation.test.ts`, `DraftEditorPage.test.tsx`, `CollaborationPanels.test.tsx`).
- **Lookup preserves uncertainty**: `unknown` shows "not proof that nothing was stored" and keeps
  Retry; `expired` makes the id unusable and offers a fresh save from the server version.
- **Never silently overwrite**: a conflict disables the form and offers rebase (keep text, new base,
  fresh id) or adopt (server copy); both re-read the draft first; a consumed draft locks the editor.
- **Context/permission changes discard stale protected data**: `request` returns `stale` once the
  generation moved on; a 409 `context_changed` hands control to the session controller, whose
  recovery replaces the context object so every panel restarts its reads (tested for the editor).
  404 on any C/D read shows an unavailable state, never an empty success.
- **Membership self-change consumes the post-write authorization_version**: a result whose
  `authorization_version` differs from the current context triggers an explicit session re-bootstrap
  (`MembersPage.test.tsx` counts the extra `getSession`).
- **Byte/code-point bounds, closed schemas**: inputs validated before dispatch (no fetch on
  violation), responses validated after; request budgets passed per route.
- **No unsafe HTML**: drafts, notes and search rows render React text / `<pre>`; tests assert no
  `img`/`script`/`javascript:` anchors appear for hostile payloads.
- **Targets without a user directory** (coordinator-approved temporary): assignment and membership
  accept "me" plus a typed UUID, labelled "No user directory exists in this build."

## 3. Files touched by this dispatch (all under `apps/web` unless noted)

Source (new): `src/app/collaborationFailure.ts`, `src/app/mailboxes.tsx`, `src/app/protectedRequest.ts`,
`src/app/SearchBox.tsx`, `src/data/fixtures/collaborationState.ts`, `src/domain/draftOperation.ts`,
`src/features/drafts/DraftsPage.tsx`, `src/features/drafts/DraftEditorPage.tsx`,
`src/features/members/MembersPage.tsx`, `src/features/search/SearchPage.tsx`,
`src/features/thread/AssignmentPanel.tsx`, `src/features/thread/NotesPanel.tsx`,
`src/features/thread/ReadStateControl.tsx`, `src/lib/ids.ts`, `src/ui/Field.tsx`.

Source (changed): `src/app/App.tsx`, `src/app/Shell.tsx`, `src/app/Sidebar.tsx`, `src/data/contract.ts`,
`src/data/errors.ts`, `src/data/gateway.ts`, `src/data/http/httpGateway.ts`, `src/data/http/transport.ts`,
`src/data/fixtures/fixtureGateway.ts`, `src/features/thread/ThreadPage.tsx`, `src/app/Shell.test.tsx`
(A/B banner-scoped hunk, already sent), `README.md` (current state).

Tests (new): `src/data/contract-collaboration.test.ts`, `src/data/cd-conformance.test.ts`,
`src/data/fixtures/collaborationState.test.ts`, `src/domain/draftOperation.test.ts`,
`src/features/drafts/DraftEditorPage.test.tsx`, `src/features/thread/CollaborationPanels.test.tsx`,
`src/features/members/MembersPage.test.tsx`, `src/features/search/SearchPage.test.tsx`,
`src/app/collaborationNav.test.tsx`, `e2e/collaboration.spec.ts`.
Tests (changed): `src/data/signal-propagation.test.ts` (13 C/D methods added to the per-method table).

Docs: this file. Not touched: Rails, `contracts/**`, generated files, `package.json`/lock, the shared
runtime harness, root docs. Nothing committed.

## 4. Test coverage (authored; runtime NOT RUN)

| File | Covers |
| --- | --- |
| `contract-collaboration.test.ts` | 23 two-way type pins; every `cd_examples` entry against the schema it names; every `cd_requests` entry; error statuses/codes and the fixed 404 wording; negative bounds: note 4096/4097 cp, search 256/257 cp and whitespace-only (incl. U+3000), subject 998/999, body 65536/65537, to 100/101, versions −1 / 2^31−1 / 2^31 / 1.5, note `version` literal, operation union discriminator, closed objects, roster/search page ≤50, error message 256/257, request id 128/129 |
| `cd-conformance.test.ts` | Each of the 13 routes: path, method, context/proof headers, query, exact body; segment encoding; 201 vs 200 note replay; DELETE without body or content type; 9 local-validation refusals with no fetch; all 13 error examples → `GatewayError` (code/status/request id/message); Retry-After 30 kept, 301 dropped; A/B route rejects a collaboration code as malformed; wrong-shape success is malformed |
| `collaborationState.test.ts` | Ledger-first replay after later saves, mismatch on content/binding reuse, recorded conflict replay, consumed, expired/unknown/foreign binding, read-state idempotency, assignment revisions and ineligible targets, note replay vs mismatch, membership revision/no-bump/last-manager/rotation/absent delete, literal case-insensitive scoped search; gateway: mailbox list, state-backed threads/reader, scripted overrides, shared state |
| `draftOperation.test.ts` | beginSave id/payload freezing and reuse, refusal while saving/conflict/unusable; applySaved stale/foreign; 14-row failure classification; reconcile applied/conflict/expired/unknown/foreign/idle; rebase/adopt/dismiss |
| `DraftEditorPage.test.tsx` | recipients parsing; new draft version 0→1 with reply binding; existing draft inert; 404 vs new, malformed id; 503 load + retry; subject bound disables save; consumed read-only; real conflict → rebase → fresh operation; adopt; conflict on a consumed draft; 503 keeps text and retries identical payload; lookup applied/unknown/expired; 409 context change → re-bootstrap restarts from server copy |
| `CollaborationPanels.test.tsx` | read toggle both ways and 503 non-flip; assign to me / clear / typed UUID / invalid / ineligible; stale revision → reload; hostile note inert, "You" attribution; uncertain note frozen and retried under the same id, different note gets a fresh id; abandon attempt; over-long note; unavailable list hides the form; reply-as-draft stable id with nothing created server-side |
| `MembersPage.test.tsx` | roster/revision/You badge; add member; stale revision → reload; last-manager demotion/removal refused; self-demotion with rotated authorization re-bootstraps the session; remove another member; 404 unavailable; 503 retry |
| `SearchPage.test.tsx` | idle, whitespace-only refusal, cross-mailbox literal results linking into the reader with no HTML, scoped and `%`-literal queries, unavailable vs outage with retry |
| `collaborationNav.test.tsx` | capability-gated sub-links, search entries, footnote, `aria-current` on mailbox and sub-link |
| `signal-propagation.test.ts` | pre-aborted and mid-flight abort for all 13 new methods on both adapters |
| `e2e/collaboration.spec.ts` | nav gating; create+save+list a draft; scripted conflict → rebase; scripted uncertain → lookup unknown; read/assign/note in the reader with persistence across hash navigation; uncertain note retry; membership add + last-manager guard; literal/scoped search; 390 px overflow on five C/D views; screenshots under `e2e/.results/cd-*.png` |

## 5. Design decisions worth a second look

1. **Explicit Save only, no autosave.** Autosave would multiply operation ids and make "which attempt
   is uncertain" ambiguous; the contract's one-id-one-payload rule is easiest to honour with a
   deliberate action. Revisit if product wants autosave.
2. **`?new=1` stays in the URL after the first save.** A reload re-GETs the now-existing draft;
   only a genuine 404 under that marker is treated as "not created yet". Navigating away with
   `replace` after the first save would re-trigger the load effect.
3. **A 409 `context_changed` during a save drops the local attempt and reloads the server copy.**
   This follows the session rule that a recovered context restarts all reads; the user's unsaved
   text is lost in that one case. If that is unacceptable, the editor would need to carry the buffer
   across the context key (new UX decision).
4. **Membership conflict wording** covers both a stale revision and the last-manager guard, since
   the contract uses one code for both.
5. **Fixture default mailbox list** appends "C/D fixture mailbox" after "Fixture inbox" so existing
   A/B assertions keep their positions; `authorization_version` in fixture envelopes is `authz_A_…`
   (session A), not the `authz_CD_…` of the static examples, so the session context matches.
6. **`useMailboxes` without a provider reads as `loading`** so pages render in isolation; a throw
   would have coupled every component test to `Shell`.

## 6. Known limits and integration inputs

- Request byte budgets for drafts (1 MiB) and notes (64 KiB) cannot be exceeded by any schema-valid
  payload, so they are passed but not provable through the gateway; transport-level budget
  behaviour is covered by the existing transport suites.
- `SearchBox` is hidden below the `sm` breakpoint; the sidebar "Search" link is the entry there.
- Validator inputs: `operation_a_after_b_or_consumption` is only asserted to parse (its outcome is
  not assumed); the editor's 409-context-change test assumes recovery calls `getSession` once more.
- Possible follow-ups if the container run disagrees with static inspection: the `Mutual` pins
  (if the generated union for `DraftOperation` differs in shape), `it.each` tuple typing in the
  boundary table, and any Testing Library text matcher that collides with pre-existing reader text.
