# Visual QA matrix — FE01 read checkpoint states (COMPLETE at r11 agent inspection level)

Date: 2026-10-12. Source: HEAD 284aa71 + the four reviewed r11 repair files. This matrix covers
ONLY the FE01 read checkpoint: features that exist in the frozen implementation. It invents no
new UI or behavior, and completing it does NOT constitute whole-application acceptance (real
Rails integration, mutation flows and future UI remain separate gates).

**Current status:** the matrix is EXECUTED and INSPECTED. The r11 fleet-02 run passed lint,
typecheck, 209 unit tests with coverage, the production build, and the browser matrix
(163 passed / 0 failed / 50 expected skips), capturing all 112 matrix PNGs; every capture was
then individually inspected in-session with zero defects (agent visual verification — see
"Inspection status" below). The trigger-recipe text that follows is retained as historical
documentation of how the capture spec was planned.

## How each state is triggered (no source change required)

- **Fixture entry** (`dev-fixtures.html` → `fixtureMain.tsx`) uses the default `FixtureScript`
  only, so it shows happy-path states plus whatever the defaults contain.
- **Error/empty/alternate states** are triggered the way `e2e/production.spec.ts` already does:
  Playwright `page.route('**/v1/...')` fulfilling with the canonical examples from
  `contracts/v1/fixtures.json` against the production preview build. Example names available:
  `session_a/b`, `mailboxes`, `mailboxes_empty`, `threads`, `threads_empty`, `thread_empty`,
  `thread_truncated`, `thread_hostile_plaintext`, and error examples `unauthenticated`,
  `not_available`, `context_changed`, `cursor_invalid`, `request_invalid`, `rate_limited`,
  `temporarily_unavailable`, `internal_error`.
- **Loading / loadingMore (transient)** states are frozen by fulfilling the route from a promise
  the test never answers: the route stays pending (held unanswered until test teardown), freezing
  the transient state for the capture. No manual release step exists or is needed.
- **retry_required / recovering**: serve `context_changed` once mid-session (first list call
  succeeds with `session_a` tokens, second returns the `context_changed` error example) to walk
  the one-recovery allowance; serve it twice to exhaust it and land on retry_required.
- **Themes**: `page.emulateMedia({ colorScheme: 'light' | 'dark' })`.
  **Reduced motion**: `page.emulateMedia({ reducedMotion: 'reduce' })` (matches the existing
  Playwright `reduced-motion` project).
- **Viewports**: desktop 1280×800 (rail) and narrow 390×844 (drawer), matching the existing
  `desktop` and `narrow-390` Playwright projects. The md breakpoint flips navigation chrome, so
  every row below must be captured at both.

## Inspection status (r11, 2026-10-12) — ALL 112 CAPTURES INSPECTED, 112/112 PASS

r11 ran the frozen workflow with the four reviewed repair files (spec `1c8f1f3d…`): browser
163 passed / 0 failed / 50 expected skips; PNGs at
`Elevateo Mail - FE Validation 20261012-r11/results-fe01r11/e2e-results/visual/`. Every one of
the 112 r11 PNGs was then individually inspected at full resolution in this session (authorized
manual agent visual verification; r10 acceptance is historical — the r11 set was verified
itself). **Zero defects found.** Every ⬜ cell below is now covered: captured in r11 AND
inspected PASS. Acceptance observations (not defects):

- mailboxes-error (both viewports/themes) shows the as-designed bare raw error text
  ("forced by visual QA") + Try again replacing all sidebar/drawer content per Shell.tsx:170-174
  (no brand header).
- Reader header reads "3 messages in this conversation" while one message renders in several
  reader scenarios — synthetic payload artifact (the spec's thread fixture sets
  `message_count: 3`), not a product defect.
- Light skeletons (#e4e4e7) are clearly visible on both the #f4f4f5 canvas and white surfaces
  (session/inbox/reader loading, drawer loading/paginated) — the r10 invisible-skeleton defect is
  repaired. Dark skeletons (#2f3035) visible on both dark contexts, unchanged.
- narrow truncated-badges: both badges wrap/stack fully inside the 390px viewport, both themes —
  the r10 overflow defect is repaired.
- Hostile plaintext renders inert (escaped `<script>` text, no execution/linkification) in all
  four captured contexts including reduced-motion.

Limitations recorded separately in `docs/frontend-regression-repair-status.md` (static images do
not prove interaction; reduced-motion covers representative rows only — no reduced-motion
session-loading capture by design; geometry assertions prove viewport containment only; contrast
oracle closed statically within the opaque-hex theme scope).

## Matrix

Legend: ✅ sampled in the r7 PNG set (parent-inspected, zero defects); ⬜ = captured in r10/r11
and individually inspected PASS in the r11 set (2026-10-12, this session). All 112 cells are
covered; no cell remains uninspected.

### Session shell (`App.tsx` / `session.tsx` states)

| State | Trigger recipe | light×desktop | light×390 | dark×desktop | dark×390 |
|---|---|---|---|---|---|
| loading (initial "Loading…" gate) | hold `/v1/session` response | ⬜ | ⬜ | ⬜ | ⬜ |
| unauthenticated screen | `/v1/session` → `unauthenticated` | ⬜ | ⬜ | ⬜ | ⬜ |
| error screen (session fetch failed) | `/v1/session` → `internal_error` | ⬜ | ⬜ | ⬜ | ⬜ |
| recovering (one-allowance refetch) | list call → `context_changed` once, hold the session refetch | ⬜ | ⬜ | ⬜ | ⬜ |
| retry_required (allowance exhausted) | `context_changed` twice | ⬜ | ⬜ | ⬜ | ⬜ |
| ready shell (rail/drawer chrome) | defaults | ✅ shell/entry | ✅ drawer-390 | ✅ contrast-dark | ⬜ |

### Mailbox navigation (Shell sidebar / drawer)

| State | Trigger recipe | light×desktop | light×390 | dark×desktop | dark×390 |
|---|---|---|---|---|---|
| mailboxes loading | hold `/v1/mailboxes` | ⬜ | ⬜ | ⬜ | ⬜ |
| mailboxes error + Try again | `/v1/mailboxes` → `temporarily_unavailable` | ⬜ | ⬜ | ⬜ | ⬜ |
| empty mailbox list | `mailboxes_empty` | ⬜ | ⬜ | ⬜ | ⬜ |
| paginated load in progress | first page with `next_cursor`, second page held (the shell auto-follows mailbox cursors, so this shows the loading skeleton, not a Show more button) | ⬜ | ⬜ | ⬜ | ⬜ |
| drawer open over content (populated, ready inbox behind) | `drawer-open-populated` scenario (mobile-only) | n/a | ✅ drawer-390 (sampled) + spec capture | n/a | ⬜ spec capture dark×390 |

### Inbox (`InboxPage`)

| State | Trigger recipe | light×desktop | light×390 | dark×desktop | dark×390 |
|---|---|---|---|---|---|
| loading skeleton | hold `/v1/mailboxes/{id}/threads` | ⬜ | ⬜ | ⬜ | ⬜ |
| ready list + filter pills | defaults | ✅ entry | ✅ inbox-390 | ✅ contrast-dark | ⬜ |
| empty (no conversations) | `threads_empty` | ⬜ | ⬜ | ⬜ | ⬜ |
| empty page WITH continuation cursor | synthetic page: `items: []`, non-null `next_cursor` | ⬜ | ⬜ | ⬜ | ⬜ |
| error + Try again | `not_available` / `internal_error` | ✅ production-api-failure (desktop light only) | ⬜ | ⬜ | ⬜ |
| loadingMore (Show more pressed) | hold second page | ⬜ | ⬜ | ⬜ | ⬜ |
| unread filter active state | click Unread pill; route serves an unread-only payload for `filter=unread`; capture proves the request query, unread rows present and read rows excluded | ✅ contrast surfaces | ⬜ | ✅ | ⬜ |

### Conversation reader (`ThreadPage`)

| State | Trigger recipe | light×desktop | light×390 | dark×desktop | dark×390 |
|---|---|---|---|---|---|
| loading skeleton | hold `/v1/.../threads/{id}` | ⬜ | ⬜ | ⬜ | ⬜ |
| ready (hostile plaintext, badges) | `thread_hostile_plaintext` | ✅ reader | ⬜ | ⬜ | ⬜ |
| truncated subject/body badges | `thread_truncated` | ⬜ | ⬜ | ⬜ | ⬜ |
| unavailable (not_available) | `not_available` | ⬜ | ⬜ | ⬜ | ⬜ |
| error + Try again | `internal_error` | ⬜ | ⬜ | ⬜ | ⬜ |
| no messages (terminal empty) | `thread_empty` | ⬜ | ⬜ | ⬜ | ⬜ |
| empty page with continuation | synthetic: `messages: []`, non-null `next_cursor` | ⬜ | ⬜ | ⬜ | ⬜ |
| loadingMore (Show more messages) | hold continuation page | ⬜ | ⬜ | ⬜ | ⬜ |

### Reduced-motion representative rows

One capture each under `reducedMotion: 'reduce'` (behavior already machine-asserted by
`read.spec.ts`; these are the human layout checks): shell ready, inbox loading skeleton,
reader ready. Both themes, 390 only (densest chrome).

## Execution notes

- Capture mechanism: AUTHORED (not executed) as `apps/web/e2e/visual-states.spec.ts` — 27
  scenarios × light/dark themes (one mobile-only), run under the existing desktop and narrow-390 projects
  (reduced-motion runs the representative rows only: shell-ready, inbox-loading,
  reader-ready-hostile), each asserting the intended state is on screen before saving
  `e2e/.results/visual/<project>-<theme>-<scenario>.png`. Ready rows (shell, inbox list,
  active unread filter, hostile-plaintext reader) are included for their unsampled theme/viewport
  cells. Route fulfillment + emulateMedia only; zero product source change. It skips, visibly,
  when `ELEVATEO_PRODUCTION_URL` is unset, exactly like `production.spec.ts`.
- Acceptance = human inspection by the parent, recorded per cell in
  `docs/frontend-regression-repair-status.md`, same as the 2026-10-12 sampled inspection.
- Out of scope here (future features, NOT required fixes): automatic retry scheduling/countdown
  UI, mutation flows (compose/send/cancel), real Rails data, attachment viewing.
