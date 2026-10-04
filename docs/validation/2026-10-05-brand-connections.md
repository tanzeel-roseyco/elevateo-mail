# Brand theme, Connections and AI Assistant verification — 5 October 2026

Scope: frontend prototype on `design/fable-frontend`. Fictional data only. No provider, credential, DNS record, deployment or real email was involved.

## Automated checks

Run inside Docker on fleet-02 (`docker build -t elevateo-mail-fe-check .` then `docker run`), image `mcr.microsoft.com/playwright:v1.56.1-noble`, repository lockfile. Nothing was run on the Windows host.

| Check | Result |
|---|---|
| ESLint | Passed |
| TypeScript | Passed |
| Unit and component tests | 187 passed in 10 files |
| Coverage, `src/domain` only | 99.73% lines, 98.91% branches, 100% functions |
| Production build | Passed |
| Initial JavaScript | 183.23 KB gzip (budget 250 KB) |
| CSS | 7.87 KB gzip |
| Playwright | 45 passed, 1 intentional mobile skip (desktop-only split view) |

Five runs were made. Run 1 failed one component test (a toast from an earlier test was still on screen). Run 2 failed three browser assertions written against the unminified colour value and a hidden mobile heading. Runs 3, 4 and 5 passed; run 5 includes every review fix.

Known warnings unchanged: the initial chunk exceeds 500 KB before compression, and the earlier Vitest development-tool advisory is still open. No dependency was added.

## Visual verification

Screenshots from the passing Docker run were inspected for both themes at 1440 × 900 and 390 × 844: Overview, Inbox, Campaigns, each Connections section, the mailbox limit state, the offline banner, AI Assistant, and the assistant draft opened in the composer. The final build was also opened in the user's real Chrome through an SSH tunnel to a disposable preview container: Connections → Mailboxes and AI Assistant in the dark theme at desktop width, including the app loading skeleton, with no console errors. The chrome-devtools browser tool hung and was not used. Light theme and phone sizes rest on the Docker screenshots, not on a live session.

Observed and corrected during inspection: the Connect button sat low when stacked on a phone; mailbox rows were taller than needed and their badges wrapped unevenly; a success toast covered the composer's send bar on a phone after "Review draft"; the logo was small at 28px.

Deliverable screenshots, copied from the final run into `output/fable/`:

- `brand-overview-light.png`, `brand-overview-dark.png`, `brand-inbox-dark.png`, `brand-campaigns-dark.png` (desktop)
- `brand-overview-light-mobile.png`, `brand-inbox-dark-mobile.png`
- `connections-mailboxes.png`, `connections-sending.png`, `connections-ai.png`, `connections-domains.png`, `connections-mailboxes-mobile.png`
- `assistant.png`, `assistant-review-mobile.png`, `offline.png`

The seven earlier images in that folder show the previous indigo palette and are kept as the layout reference.

Contrast, computed from the tokens: muted text on surface 7.38:1 light and 6.60:1 dark; on the secondary surface 6.71:1 and 5.75:1; body text 17.72:1 and 12.81:1; gold link text on white 5.85:1. All above the 4.5:1 AA threshold.

## What this does not establish

No real Gmail, Resend, AI, enrichment or DNS behaviour. The 30-per-mailbox figure is displayed, not enforced, and its window and recipient-counting rule are undecided. Custom accent and background combinations beyond the default were not re-inspected. No native desktop build exists. Saved appearance preferences from before this change keep their old accent; only new or reset profiles get gold.

## Docker cleanup

Removed the task containers `elevateo-mail-fe-run` and `elevateo-mail-fe-preview` (no mounts) and the task image `elevateo-mail-fe-check` (1.01 GB), and stopped the SSH preview tunnel. Free space on fleet-02 rose from 300,239,294,464 to 300,558,495,744 bytes (about 0.32 GB; other workloads share the host, so this is not exact). No volumes were touched. The build cache from these five builds was left in place: fleet-02's default builder is shared with other running work, including the backend agent, so the global `docker builder prune -a` and `docker image prune -a` were deliberately not run. Screenshots and logs remain under the ignored `.agent-run/` directory.
