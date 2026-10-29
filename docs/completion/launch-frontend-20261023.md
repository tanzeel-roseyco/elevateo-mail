# Launch frontend lane — 2026-10-23 (task_9b91ad84d7a9 / ctx_4d5340586325)

Owner: Elevateo frontend implementation worker (Claude Fable 5.1, `claude-fable-5-1`). Scope: `apps/web` only, its tests, and this report. No backend, ops, central-doc or contract files were edited and nothing was committed. All builds, tests and captures ran in Docker on fleet-02 under the `soren-docker.lock` lease; nothing ran on the laptop. No provider, DNS, deployment, mail, secret or Google Cloud action was taken (coordinator revoked Google Cloud setup; no identity-provider assumption remains in copy).

## 1. What changed (working tree, uncommitted, 25 files under apps/web, +1370/−49)

### Honest production settings (no fake success)
- `src/app/featureGateways.tsx`: new optional `simulatedSettings` capability. Only `src/dev/demoMain.tsx` and `src/dev/fixtureMain.tsx` (unless `?production-settings`) set it; `src/main.tsx` never does (verified by review packets P8 and P10).
- `src/features/settings/UnavailableSetting.tsx` (new): shared unavailable state (icon, title, body, one real destination link).
- Production entry now renders an explicit unavailable state instead of a browser-local form for: tags (`TagsPage.tsx`), webhooks list/create (`WebhooksPages.tsx`), API tokens (`DeveloperApiPage.tsx`, reference/Postman/white-label cards kept), workspace rename (read-only server name shown), invite, pending invitations, create workspace (`WorkspacePages.tsx`), password (`ProfilePages.tsx`). Demo/fixture entries keep the labelled "Simulated UI adapter" pages as `Simulated*` components.
- `src/features/help/content.ts`: help articles no longer promise tags, webhooks, tokens or invitations; the settings article lists what is real versus not available.

### Unified inbox (INBOX-SPEC, bounded for 120 mailboxes)
- `src/domain/unifiedInbox.ts` (new, pure): k-way merge of per-mailbox `GET /v1/mailboxes/{id}/threads` pages in server order (last_message_at desc, nulls last, id desc). A row is released only when every feed that still has pages has buffered a row at or past it (bound = newest per-feed frontier). `MAILBOX_BATCH_SIZE = 12`; `perMailboxLimit` = min(50, max(5, ceil(60/batch))); duplicate ids dropped within and across pages.
- `src/features/inbox/UnifiedInboxPage.tsx` (new) at `/inbox`: one mailbox redirects to `/mailboxes/{id}` (filter preserved); more than one renders the merged list. First load covers 12 mailboxes in parallel, never more; "Covering N of M mailboxes" is always visible (aria-live); "Load the next 12 mailboxes" extends coverage; "Show more conversations" fetches only starved feeds or releases already-buffered rows. Failed mailboxes are named in a warning callout and stay reported until Refresh. Rows link to their own mailbox thread (`/mailboxes/{mailbox_id}/threads/{id}`), so replies stay pinned to the conversation's mailbox; star/read/folder/snooze writes go to the row's own `mailbox_id` and apply only the confirmed server state. Loading skeleton, per-view empty state, error state with retry, j/k/o/s/Shift+U/e/!/# keys, focus moves to a neighbour when a confirmed write removes the focused row. Page reads that finish after a confirmed write are folded onto the live state (no snapshot overwrite).
- `src/features/inbox/useThreadMutations.ts`: `useMailboxThreadWrites()` takes the mailbox id per call; `useThreadMutations(mailboxId)` is a thin binding, existing callers unchanged (review P4: 0 defects).
- `src/app/App.tsx`: `/inbox` route → lazy `UnifiedInboxPage`; `InboxRedirect.tsx` removed.

### Parity fixes and tooling
- `src/app/DashboardPage.tsx`: announcement banner no longer sits 8px lower than the reference.
- `src/ui/PageHeader.tsx`: on phones the title row stacks only when page actions exist, matching the reference's Get Help placement.
- `e2e/launch-visual-capture.cjs` (new): fleet-only Playwright capture of 23 pages × 2 widths with per-page geometry, origin-parsed request allowlist, readiness failures recorded and failing the run.
- Test-only: `App.test.tsx` and `collaborationNav.test.tsx` widen async timeouts (1s default flaked twice under the full coverage gate on the shared host; both files pass 5/5 in isolation and the product code is unchanged).

## 2. Tests and gates (Docker on fleet-02, pinned `node:24.21.0-bookworm-slim` and `apps/web/docker/test.Dockerfile`)

| Gate | Result |
| --- | --- |
| gate1 (before review) | 1089/1090 — `App.test` 1s timeout flake |
| gate2 | typecheck FAIL `PageHeader.tsx` (`cx` received `0`) — fixed with `Boolean(actions)` |
| gate3 / gate4 | 1089/1090 — two different `collaborationNav.test` 1s timeouts under load — timeout widened |
| gate5 | PASS 88 files / 1090 tests, lint 0 warnings, tsc, check:api, check:api:v2, build |
| **gate6 (final tree)** | **PASS 88 files / 1094 tests, coverage 85.38% lines, lint, tsc, both contract checks, `vite build` exit 0** |

The tree tested in gate6 and captured in r4 is byte-identical to the local working tree (235 source files, per-file SHA-256 compared). Targeted suites (domain, inbox, settings, app, ui) were run after every fix. Dev server could not run in the Playwright image (inotify EMFILE on the shared host), so captures use `vite build --mode fixtures` + `vite preview`.

## 3. Visual QA (r4, final tree; 46 PNGs + geometry.json kept at fleet-02 `/home/tanzeel/em-evidence/fe-launch-20261023/visual-r4`)

Every page below was captured at 1440×1000 and 390×844 from the fixtures entry (settings with `?production-settings`), with the reference page from `source-html` captured beside it where one exists. 0 console/page errors, 0 readiness timeouts, 0 `blue-*`/`sky-*` classes on any page, no horizontal overflow at 390 on any app page.

| Page | 1440 h1 Δy / sidebar Δw vs reference | 390 h1 Δy | Notes |
| --- | --- | --- | --- |
| dashboard | −2 / 0 | −2 | Reference 390 page itself overflows (5 stat columns, scrollWidth 472); ours uses 2 columns, deliberate. |
| settings-workspace, profile, password | −2 / 0 | −2 | |
| settings-tags, webhooks, integrations, integrations-mcp | −2 / 0 | 0 | |
| settings-developer-api | −2 / 0 | −6 | Reference `api-settings.html` sits 6px lower than the other reference settings pages at 390; the reference set is internally inconsistent, ours is consistent with its siblings. |
| inbox-unified (+starred), inbox-mailbox (+archive), thread, drafts, search, help, workspace name/invite/invitations/create, webhooks-create, tags demo adapter | no reference page | — | Checked visually: unified list shows coverage label, mailbox label per row, filter tabs (select on phone), empty/loading states; unavailable settings show card + one destination. |

The constant −2px heading offset on desktop is the reference's Livewire heading wrapper padding; every other measured box matches. Gold accent and Elevateo logo are the only intended differences (acceptance criterion 1). Gold focus ring is visible on links and buttons (criterion 6; `focus-visible` outline uses the accent token).

## 4. Adversarial review (proposed rows for root's `code-reviews.md`)

Reviewers: Codex CLI 0.163.0, `gpt-6.1-sol`, reasoning low (header verified in each run log), instructed read-only. The Windows `read-only` sandbox helper could not launch (ShellExecuteExW 1223), so packets ran with `danger-full-access` and the working tree hash was verified unchanged before and after. ≤200 target lines per packet, ≤400 unique lines per reviewer except the dedicated design reviewer (P10) who read the whole diff. Rubric: AGENTS.md code-review system prompt verbatim.

| Packet | Target | LOC read | Defects found | Disposition |
| --- | --- | --- | --- | --- |
| P1 | `domain/unifiedInbox.ts` + test | 186 | 3 (HIGH frontier bound, MED in-page duplicates, LOW NaN limit) | all fixed + regression tests |
| P2 | `UnifiedInboxPage.tsx` 1–200 | 200 | 1 (MED failed-mailbox report lost on Show more) | fixed |
| P3 | `UnifiedInboxPage.tsx` 200–398 | 199 | 1 (MED focus lost when confirmed write removes row) | fixed + test |
| P4 | `useThreadMutations.ts` + inbox test 1–100 | 347 | 0 | — |
| P5 | inbox test 100–172 + `productionSettings.test.tsx` | 200 | 5 (test strength: literal 12 bound, setItem spy, no-form assertion, hrefs, server name) | all applied |
| P6 | `UnavailableSetting.tsx` + `WorkspacePages` diff | 789 | 0 | — |
| P7 | Tags/Webhooks/Profile diffs | 909 | 0 | — |
| P8 | DeveloperApi/featureGateways/dev entries/App/help/PageHeader/Dashboard | 1195 | 1 (LOW pre-existing dashboard banner dismissal in localStorage) | not changed: per-viewer dismissal preference, pre-existing, not a production write of record |
| P9 | `e2e/launch-visual-capture.cjs` | 123 | 4 (HIGH prefix allowlist, MED selector order, MED swallowed reference failures, MED silent readiness timeout) | all fixed; r4 rerun with the fixed script |
| P10 design tradeoffs | full diff | 1720 | 2 (MED pagination snapshot overwrite, MED = P2) | both fixed + deferred-response regression test; recommendations: keep client merge provisionally and describe coverage as traversal coverage (done: "Covering N of M"), keep capability flag, keep per-call hook, keep explicit unavailable states |

Totals: 17 raw findings over 1,400 unique source lines in scope (1,370 added + 49 removed, overlapping reads counted once); 16 actioned, 1 accepted as-is. Defect density before fixes: 12.1/KLOC on changed lines (HIGH 2, MED 9, LOW 6). After fixes the inbox/domain/settings suites and the full gate pass; no reviewer re-run was performed on the fixes (time-boxed), noted as residual risk.

## 5. Missing server endpoints (reported to coordinator; no client-side fake)

Sent earlier as msg_acaa3abd1caf and msg_ab9378da4c9f. Essential for the backend lane:
- `GET /v1/threads?filter&cursor&limit` (org-wide list, same `ThreadSummary` rows, same ordering and `cursor_invalid` semantics as the per-mailbox list) — would replace client batching.
- Sent folder and permanent delete — not exposed; the UI shows no Sent folder and no permadelete control.
- Tags, webhooks, API tokens, workspace rename/create, invitations issuing, password change — no endpoints; rendered as unavailable states.

## 6. Residual limits
- Unified coverage at 120 mailboxes needs 10 batch extensions (≥120 requests of 5 rows); honest but slow until the server list exists.
- The merge orders rows correctly per traversal but cannot be a cross-mailbox snapshot under concurrent writes (P10); Refresh restarts the traversal.
- Reviewer fixes were verified by tests and the full gate, not by a second review pass.

## 7. Docker cleanup (fleet-02)
Removed: image `elevateo-fe-launch-20261023-gate`, named volume `fe-launch-20261023-nm` (node_modules only), workspace `/home/tanzeel/em-work/fe-launch-20261023`, `docker builder prune -a -f` (810.5MB), `docker image prune -a -f` (3.59GB). No `--volumes` prune. Containers were all `--rm`. Retained: evidence moved to `/home/tanzeel/em-evidence/fe-launch-20261023` (23MB: gate logs, visual r1–r4). Lock file `soren-docker.lock` truncated to 0 bytes. Host: 68G free on `/` after cleanup.
