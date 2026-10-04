# Connections implementation inspection

Documentation-only development preparation. Backend/desktop standards remain unapproved; no application code, infrastructure, provider credentials or external connectors were changed. Current application is a fictional browser prototype, not a functioning mail service.

## Current behaviour and incompatibilities

- Settings has appearance, identities, notifications, sending and account sections; `/settings/connections` currently redirects to appearance (`src/features/settings/SettingsPage.tsx`). The existing `settings/:section` route can host the future section without inventing another routing system.
- `src/data/ports.ts` has only seven prototype operations. No connection lifecycle, permission grant, mailbox discovery, credential health, AI scope, DNS approval or provider configuration contract exists. Its `load()` returns recovery status while mutating global cache; real connected resources need bounded paginated DTOs.
- `src/domain/schema.ts` hardcodes three company domains and requires nine identities in persisted state. `src/domain/identities.ts` derives sender IDs from addresses. Neither distinguishes connection, stable provider mailbox, alias, tenant or verified send identity. New connections cannot safely be inserted into this fixed schema without a versioned migration and updating dependent filters/brand views.
- Identity settings show explicitly labelled mock DNS status. They do not verify DNS or prove permission to send. Settings and identity edits write directly to Zustand; the README already records this gateway deviation.
- The **30/mailbox/day limit is not implemented**. `DAILY_LIMIT_MAX` is 500, default pacing is 40 per identity, and settings accepts 1–500. `batchSize()` multiplies campaign pacing by identity count; `runCampaignBatch()` can be repeatedly invoked without a clock-based quota ledger. `sendMessage()` has no quota check. These are existing prototype behaviours, not new regressions.
- Campaign suppression is checked at creation and simulated dispatch. New campaign messages require opted-in subscribed contacts. Replies/ordinary messages only warn for suppressed contacts; purpose classification and enforcement must be tightened before real provider dispatch so marketing cannot be relabelled as personal mail.
- AI selected-mailbox reading and drafting are now authorised as product scope; sending needs a separately enabled capability. Draft access is not send approval. The prototype has no AI grants, revision approval ledger or MCP boundary.
- Earlier planning says no DNS writes. Latest user instruction supersedes that absolute prohibition: permit management only for explicitly approved subdomains. Protect all root MX. `in.elevateoco.com` reportedly serves SES already; no repointing or ownership claim is established.

## Future touchpoints

| Existing file/area | Required integration work after approval |
|---|---|
| `src/features/settings/SettingsPage.tsx` | Add Connections section; retain URL navigation and accessible section controls. |
| New `src/features/settings/ConnectionsSettings.tsx` | Connection status, mailbox selection, read/draft grant, separately enabled sending, revoke/reconnect, provider health; loading/empty/error/expired states. Never display raw secrets. |
| `src/data/ports.ts`, `gateway.ts`, `mockGateway.ts` | Typed connection list/detail and lifecycle ports, capability updates and bounded mailbox discovery; mock responses labelled simulated. HTTP adapter later. |
| `src/domain/schema.ts`, proposed `connections.ts` and quota rules | Validate capability combinations, stable mailbox-to-alias mappings, provider IDs, limits and user ownership. Separate grant state from health and action approval. Keep pure domain dependencies. |
| `src/data/store.ts`, `seed.ts`, `identities.ts` | Versioned mock persistence migration, independent connection DTO cache, dynamic identity/domain associations. Keep production secrets out of browser storage. |
| `SendingSettings.tsx`, `IdentitySettings.tsx`, campaign wizard/tabs | Replace misleading per-identity quota with mailbox allowance and lower campaign pacing; verified identity choices, provider-purpose eligibility and blocked reasons. |
| Composer, mail list/thread/reply views, global filters/search | Selected mailbox scope, disconnected/revoked sender behaviour, dynamic own-address recognition, capability-aware draft/send UI. Server remains authoritative. |
| Future desktop bridge and backend | Encrypted credentials, ownership checks, approval-bound action ledger, atomic mailbox/user quota admission, idempotency and unknown-outcome reconciliation. These modules do not exist yet. |

Bounded MCP should expose purpose-specific read/query/draft operations with mailbox allowlists, pagination, byte/result/time limits and revocation checks. A tool being discoverable does not grant access. Send tools require the distinct send capability plus exact-revision approval and server admission. Never grant generic shell, credential export, unrestricted HTTP or arbitrary DNS tools merely to implement Connections.

Self-host provider configuration needs a separate adapter contract and trust decision: authentication, endpoint validation, TLS, outbound-network restrictions, timeout/size limits and stated capability support. It must not bypass consent, quotas or approvals. Gmail sync, campaign delivery and app-subdomain receiving are separate roles; adding a connection does not authorize DNS changes.

## Integration tasks and acceptance checks

1. Reconcile product plan, blueprint and draft backend standards with latest AI and subdomain permissions; obtain backend standards approval before implementation.
2. Define connection/mailbox/identity/capability DTOs, migration and gateway methods; include consent evidence source/time/purpose instead of treating imported address validation as permission.
3. Route affected writes through the gateway, then add Connections UI and mock error states; preserve existing fictional prototype data during migration.
4. Implement server-owned read authorization and send admission. Alias and reconnect share stable mailbox quota; every recipient across manual, campaign, AI and self-host paths counts under the same rules.
5. Verify read/draft-only cannot send, revoked grants stop new reads, one user cannot access another connection, and empty/huge mailbox lists remain bounded. Test malicious mail/tool content, expired credentials and provider timeout without unsafe fallback.
6. Verify two concurrent final-slot sends, aliases, reconnect, multiple recipients, stalled dispatch crossing window boundary, duplicate tool actions and unknown acceptance. Repeat campaign suppression immediately before dispatch.
7. Prove DNS requests reject root MX changes and any unapproved subdomain, and bind approval to exact zone/name/type/value changes. Preserve existing SES routing unless a separate reviewed migration is approved.
8. Docker checks plus actual desktop/mobile visual validation remain required before publishing. No build/tests were run for this read-only application inspection.

## Unresolved conditions

- Confirm rolling 24-hour versus calendar-day counting and per-recipient counting; 30/mailbox/day and earlier 600/user/day are recorded limits, but these mechanics remain proposals.
- Specify self-host provider technology and which roles it supports; do not assume every provider can sync, draft, send and receive.
- Specify exact mailbox selections, AI data handling/retention and provider-policy approval route before transferring real Google content.
- Record explicit subdomain approval and existing consumer inventory before any DNS plan is executable; existing SES ownership/rules/storage are unverified.

## Inspection coverage and defect accounting

Reviewed 1,120 physical source lines in targeted chunks of at most 200 lines per file/read: ports, SettingsPage, SendingSettings, rules, mockGateway, identities, App, store, IdentitySettings, and schema lines 1–25 and 56–200. This is integration inspection, not complete adversarial certification of the application. Existing boundary tests were located by search; no historical test results were rerun. Formatting checks belong to linters.

New implementation defects: **0** (no application implementation changed). New defect density: **not applicable**, because changed application LOC is zero. Existing prototype integration gaps above are documented separately and must not be reported as newly introduced regressions.
