# Frontend agent result — 5 October 2026

Branch `design/fable-frontend`. Frontend only. Committed locally; nothing pushed, deployed or sent. The backend worktree was not modified.

## Delivered

- Gold accent, white light theme, dark-grey dark theme, transparent logo (sidebar and favicon), on the existing Fable layouts.
- Navigation: Overview, Inbox, Campaigns, Contacts, AI Assistant, Connections, Settings.
- Connections: Mailboxes (ten-mailbox limit, per-mailbox usage against 30 a day, simulated connect, history import, disconnect), Sending, AI, Enrichment, Domains.
- AI Assistant preview: prepares a labelled placeholder draft for review; cannot send.
- Loading, empty, error-with-retry and offline states.
- Six new `MailroomGateway` methods with a mock adapter; saved data from before this change still loads.

## Evidence

| Item | Result |
|---|---|
| Docker checks on fleet-02 | Lint, typecheck, build passed; 187 unit/component tests; 45 browser tests, 1 intentional mobile skip |
| Domain coverage | 99.73% lines |
| Initial JavaScript | 183.23 KB gzip (budget 250 KB) |
| Visual QA | Both themes at 1440 × 900 and 390 × 844 from Docker screenshots; dark desktop also opened live in Chrome |
| Adversarial review | 1,054 source lines, 14 defects (13.28 per 1,000), all fixed; 16 test weaknesses addressed |
| Design review | Six decisions kept, one changed (gateway returns DTOs), one deferred |

Details: `docs/validation/2026-10-05-brand-connections.md`, `code-reviews.md`, screenshots in `output/fable/`.

## Decisions that need the user

`docs/proposals/2026-10-05-open-decisions.md`: daily window; To/CC/BCC counting; whether Resend sends draw on a mailbox's allowance; alias matching; the carried-over STANDARDS §3 amendment; Contacts placement. No quota is enforced until these are settled. Backend standards remain unapproved.

## Exceptions and limits

- Review agents ran on `gpt-6.1-sol` (the installed Codex default), not the `gpt-5.6-sol` named in the routing rules.
- Codex's read-only sandbox could not read files on this machine; reviewers were given the code in the prompt instead.
- No Obsidian tradeoff simulation was run; design tradeoffs were reasoned from the code.
- The chrome-devtools browser tool hung; live inspection used the Chrome extension and covered dark desktop only.
- Shared fleet-02 build cache was not pruned, to avoid disturbing other running work. Task containers and image were removed.
- Deferred: one cache coordinator for gateway adapters; existing direct store mutations for star, archive and settings.
- Saved appearance preferences keep their old accent; new or reset profiles get gold.
- `.planning/STANDARDS.md` names branch `feature/frontend-prototype`; this work stayed on `design/fable-frontend` as instructed.

## Credential checklist (for the final integration stage; nothing was requested or stored)

1. Google Cloud OAuth client (web) with Gmail read and, separately, send scopes; external-app verification may take weeks.
2. Resend API key restricted to sending, plus verified sending subdomains; DNS records added by hand after review. Never root MX.
3. Per-user Hunter and AMF keys, only if enrichment is wanted; AMF product still to be identified.
4. Cloudflare account and API token for Workers, D1, R2 and Queues, held by the backend deploy process only.
5. Each user's own Codex CLI sign-in on their own computer; never shared with the app.

All of these belong in the server-side secret store. None may be typed into the frontend, committed, logged or pasted into chat.
