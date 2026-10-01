# Project state

Status: frontend prototype built, tested, visually checked, and reviewed on `feature/frontend-prototype`.

## Completed
- Engineering standards approved 2026-10-01 (frontend scope; Tailwind chosen for styling).
- Interactive frontend prototype covering Overview, Activity, Mail, Compose, Campaigns, Contacts, Settings, and global search, with mock data persisted in the browser.
- Checks in Docker on fleet-02: lint, typecheck, unit/component tests, build, Playwright e2e (desktop + mobile).
- Visual QA from e2e screenshots; adversarial code review logged in `code-reviews.md` (57 defects, 56 fixed).

## Awaiting a decision
- STANDARDS §3 was amended during implementation (page-level components may keep private helpers in the same file). Needs confirmation.
- Deferred review finding: features write to the store directly for most edits instead of through `MailroomGateway`. Accept for the prototype, or move them behind the gateway now.

## Not started
- Backend API, database, scheduler, authentication.
- Real Resend sending, inbound mail, and webhooks.
- Deployment.

## Next
1. Review the prototype and collect change requests.
2. Draft backend standards and architecture (provider is now decided: Resend for sending and receiving).
3. Implement an HTTP `MailroomGateway` behind `src/data/ports.ts`.

## Decisions since initial planning
- Provider: Resend for sending and receiving; no Gmail / Google Workspace connection.
- Identities: nine fixed sender identities (3 local parts × boltloop.co, flooda.co, elevateoco.com) in one unified inbox. This replaces the earlier unconfirmed "18 mailboxes" assumption.
- Audience: roughly 800–900 explicitly opted-in CEO contacts; campaign emails always carry an unsubscribe footer.
