# Production readiness plan

A numbered plan built from the owner's readiness checklist and judged against this repository on 2026-10-18 at `712a3cbf`. Verdicts were decided by reading `apps/server`, `apps/web`, `ops`, `tests` and the recorded gate evidence in `state.md` and `docs/completion/`, not by assumption; each row cites the file, test or receipt that supports it.

Verdicts:

- APPLIES-NOW: needed before the private pilot (ten users, 100 Gmail mailboxes, 3,000 sends a day, Resend-first).
- APPLIES-LATER: needed for growth or enterprise customers.
- ALREADY-DONE: implemented, with the evidence cited.
- NOT-APPLICABLE: not relevant to this product or scope, with the reason.

Owners are roles (Tech lead, Backend, Frontend, DevOps, Security, QA); effort is S (under a day), M (one to three days) or L (more). Backend items are listed as tasks for the backend route and were not implemented here.

## Verdict counts

| Theme | ALREADY-DONE | APPLIES-NOW | APPLIES-LATER | NOT-APPLICABLE | Items |
| --- | --- | --- | --- | --- | --- |
| Schema | 1 | 0 | 0 | 0 | 1 |
| Auth | 8 | 1 | 3 | 1 | 13 |
| Data | 8 | 2 | 5 | 2 | 17 |
| Security | 7 | 9 | 6 | 2 | 24 |
| Ops | 4 | 11 | 11 | 3 | 29 |
| Testing | 5 | 1 | 2 | 0 | 8 |
| Billing | 0 | 0 | 1 | 7 | 8 |
| API | 3 | 2 | 1 | 1 | 7 |
| AI | 1 | 2 | 3 | 2 | 8 |
| UX | 6 | 1 | 1 | 2 | 10 |
| Code health | 6 | 7 | 2 | 0 | 15 |
| People | 0 | 1 | 0 | 0 | 1 |
| Total | 49 | 37 | 35 | 20 | 141 |

Of the 37 APPLIES-NOW items, 9 were applied in this branch (files only, no backend code), 13 are backend tasks (listed at the end) and the rest are DevOps, tech-lead or frontend work.

## Risk-ordered plan for the private pilot

Every APPLIES-NOW item, ordered by the damage its absence could do during the pilot. Items marked applied were done in this branch; the rest are owned as shown.

| Order | Items | Why first | Owner | Effort |
| --- | --- | --- | --- | --- |
| 1 | 19, 41 | Scheduled, encrypted, off-host backups with a tested restore: a disk failure on the single VPS otherwise loses every conversation, credential binding and audit record | DevOps | M |
| 2 | 70, 101, 86 | Resend adapter with signed webhooks feeding suppression: without bounce and complaint handling the account is shut down at a 0.08% complaint rate | Backend | M |
| 3 | 4 | TOTP MFA for all pilot users: the app guards up to 100 mailbox credentials | Backend | M |
| 4 | 138, 51 | Privacy notice, sender identification and unsubscribe under the Spam Act 2003; erasure procedure for contact data | Tech lead | M |
| 5 | 106 | Decide app passwords versus Gmail OAuth before enrolling mailboxes; it sets whether CASA (A$779 to A$8,658 a year) applies | Tech lead | S |
| 6 | 40, 39 | Reverse-proxy security headers and the expected-origin list for desktop and Android hosts | DevOps, Backend | S |
| 7 | 69, 63 | SPF, DKIM and DMARC for every sending domain; automated TLS and domain renewal with expiry monitoring | DevOps | S |
| 8 | 57, 128 | CI on every push (applied) plus branch protection with required checks; the Ruby suites stay on fleet-02 until task B11 | DevOps, Tech lead | M |
| 9 | 77, 76 | External uptime checks and error grouping so the first outage is noticed by the team, not the users | DevOps, Backend | S |
| 10 | 139, 140 | Company-owned provider accounts with two administrators and a second operator with production access | Tech lead | S |
| 11 | 31 | Retention policy and purge job | Tech lead, Backend | M |
| 12 | 37 | OWASP Top 10 pass over the v2 outreach and attachment endpoints | Security | M |
| 13 | 33, 72 | Key-rotation schedule executed at go-live; usage and cost alerts on Resend and enrichment APIs | DevOps | S |
| 14 | 108, 109 | Connector safeguards before the AI connector ships: mail bodies are data, visible external-AI indicator | Backend, Frontend | M |
| 15 | 116 | Android network-loss handling | Frontend | S |
| 16 | 133 | README quick start at the top | Tech lead | S |
| 17 | 35, 46, 47, 58, 73, 82, 83, 129, 137 | Applied in this branch: Dependabot, SECURITY.md, runbooks, DR draft, CHANGELOG | - | - |
| 18 | 141 | Staff the roles above at the fractional days costed in `financial planning/pilot.md` | Tech lead | - |

## Backend tasks handed to the backend route

These need changes under `apps/server`, which this plan does not edit.

| Task | Items | Scope |
| --- | --- | --- |
| B1 | 26, 105 | Resend send adapter behind the existing worker transport: stable idempotency key per logical send, pinned API version, `unknown` on ambiguous acceptance, retry deadline below the 24-hour key window (`docs/mail-delivery-and-hosting.md`) |
| B2 | 70, 101 | `POST` webhook endpoint for Resend events with Svix signature verification, replay-safe event ledger, bounce and complaint events feeding lead suppression and send status |
| B3 | 4 | Supabase Auth TOTP enrolment, verification on login, recovery codes, enforced for every organization member |
| B4 | 39 | Expected-origin configuration for Tauri and Android WebView hosts in `write_input.transport!` and session cookie policy |
| B5 | 66, 136 | Operator endpoint and view for `needs_review` and `unknown` sends with reconcile-or-replace actions that never resubmit automatically |
| B6 | 31, 71 | Lease-fenced purge job for expired sessions, rate-limit buckets, rejected and quarantined attachments and old receipts under the retention policy |
| B7 | 51 | Erasure endpoint for lead and contact data that keeps a hashed suppression record and writes an audit event |
| B8 | 76 | Error reporting SDK (Sentry or GlitchTip) in API, workers and scanner with the existing redaction applied to events |
| B9 | 86 | Integration tests for B1 and B2 against Resend test mode, including lost response, duplicate webhook and out-of-order events |
| B10 | 106 | Gmail OAuth token storage and refresh, only if OAuth is chosen over app passwords |
| B11 | 57 | GitHub Actions job that brings up the pinned Supabase stack and runs `ops/tests/be02/test-suites.sh`, or a documented fleet-02 status check reported to GitHub |
| B12 | 57 | `test/be_02/session_security_test.rb:14` fails `rubocop --lint` (Lint/AmbiguousBlockAssociation) on the current branch; the applied CI job will stay red until it is parenthesised |
| B13 | 57 | `bundle exec steep check` reports one NoMethod problem on the current branch: `lib/elevateo/sessions.rb` calls `config.mode` but `sig/` declares no `mode` on `Elevateo::Config`; the CI Steep step stays red until the signature is added |

## Applied in this branch

| Item | File |
| --- | --- |
| 46 Disclosure process | `SECURITY.md` |
| 137 Changelog | `CHANGELOG.md` |
| 35, 129 Dependency scanning and monthly upgrades | `.github/dependabot.yml` |
| 57 CI running lint, typecheck, contract checks and tests | `.github/workflows/ci.yml` |
| 32 Secret scanning | `.gitleaks.toml` and the `secrets` job in `ci.yml` |
| 47 Stolen-laptop plan | `docs/runbooks/stolen-laptop.md` |
| 82, 83, 33, 51 Incident runbook with postmortem template, rotation schedule and erasure procedure | `docs/runbooks/incident-response.md` |
| 73, 58, 19 DR and restore runbook draft | `docs/runbooks/disaster-recovery.md` |
| 131 Files over 1,000 lines | `docs/large-files.md` |
## Catalogue by theme

Columns: number, item, verdict, evidence or reason (paths are relative to the repository root), owner role, effort (S under a day, M one to three days, L more).

### Schema

| # | Item | Verdict | Evidence or reason | Owner | Effort |
| --- | --- | --- | --- | --- | --- |
| 1 | Designed schema | ALREADY-DONE | 34 migrations in `apps/server/db/migrate`; per-domain SQL in `apps/server/db/*/tables.sql`; FORCE RLS in `apps/server/db/sec802/access.sql`; `docs/backend-database-tutorial.md` | Backend | - |

### Auth

| # | Item | Verdict | Evidence or reason | Owner | Effort |
| --- | --- | --- | --- | --- | --- |
| 2 | Plus-sign emails | ALREADY-DONE | `apps/server/lib/elevateo/auth_input.rb:52-55` trims, lowercases and accepts any local part including `+`; aliases are deliberately not collapsed | Backend | - |
| 3 | Expiring single-use reset links | ALREADY-DONE | `POST /v1/auth/recovery` (`apps/server/app/controllers/v1/auth_controller.rb:24-29`); `apps/server/db/be02/pending.sql` rejects expired or completed entries and claims with a 10-second deadline; 30-minute window in `be02/entry.sql`; `apps/server/test/be_02/auth_entry_test.rb` | Backend | - |
| 4 | MFA and recovery codes | APPLIES-NOW | No `totp`, `webauthn` or `mfa` anywhere in `apps/server`; the app will hold credentials for up to 100 mailboxes, so enable Supabase Auth TOTP for every pilot user with recovery codes | Backend | M |
| 5 | Session timeout | ALREADY-DONE | 12-hour session ceiling (`apps/server/db/be02/tables.sql:21`), 30-minute refresh windows (`be02/refresh.sql:80`), Auth `JWT_EXP` 3600 (`compose.yaml`) | Backend | - |
| 6 | Kill-all sessions | ALREADY-DONE | Logout scope `global` (`auth_controller.rb:38-42`, `lib/elevateo/sessions.rb:102-105`), `be02/revocation.sql`, `test/be_02/revocation_worker_test.rb` | Backend | - |
| 7 | SSO | APPLIES-LATER | Ten internal users do not need it; Supabase Auth supports OIDC when a customer requires it | Backend | M |
| 8 | SAML and SCIM | APPLIES-LATER | Enterprise only | Backend | L |
| 9 | Deep roles | ALREADY-DONE | Organization grants (`apps/server/app/controllers/v2/admin/organization_grants_controller.rb`), mailbox members (`v1/mailbox_members`), `test/qa817/role_escalation_database_test.rb`, `role_owner_race_database_test.rb` | Backend | - |
| 10 | IDOR checks | ALREADY-DONE | Tenancy frames (`apps/server/lib/elevateo/tenancy.rb`), FORCE ROW LEVEL SECURITY, `test/qa817/tenant_authority_database_test.rb`, `adversarial_boundaries_test.rb`; foreign campaign returns 404 in browser evidence (`docs/completion/product-acceptance-matrix.md`) | Backend | - |
| 11 | Tenant isolation | ALREADY-DONE | As 10 plus `apps/server/db/sec802/access.sql` and separate database logins in `ops/db/bootstrap-auth-grants.sql` | Backend | - |
| 12 | Audited impersonation | NOT-APPLICABLE | No impersonation feature exists and ten internal users do not need one; if built it must write `app.organization_role_audit` | - | - |
| 13 | Login rate limits | ALREADY-DONE | `apps/server/db/be02/rate_limits.sql` (5 per email and 30 per IP per 15 minutes), `test/be_02/rate_limits_test.rb`, `Retry-After` (`v1/api_controller.rb:68`) | Backend | - |
| 14 | Smart lockouts | APPLIES-LATER | Fixed windows exist; adaptive lockout and user notification are growth items | Backend | S |

### Data

| # | Item | Verdict | Evidence or reason | Owner | Effort |
| --- | --- | --- | --- | --- | --- |
| 15 | Reversible migrations | ALREADY-DONE | 31 of 34 migrations define `down`; the deliberately irreversible attachment migration is refused by the restore drill (INT1001 in `state.md`); `test/campaigns/rollback_migration_test.rb` | Backend | - |
| 16 | Non-locking migrations | APPLIES-LATER | No `CREATE INDEX CONCURRENTLY`; fine at pilot table sizes, required before growth | Backend | S |
| 17 | Indexes | ALREADY-DONE | 24 `CREATE INDEX` statements in `apps/server/db`; selector p95 23 ms at 712 mailboxes and 1,000 jobs (MAIL1022, `state.md`) | Backend | - |
| 18 | Connection pooling | ALREADY-DONE | `ELEVATEO_DB_POOL` in `apps/server/config/database.yml`; workers hold one connection (`apps/server/bin/inbound-worker`); an external pooler is a growth item | Backend | - |
| 19 | Nightly backups with tested restores | APPLIES-NOW | Tooling exists (`ops/supabase/stack.sh backup`, `ops/supabase/restore-drill.sh`; INT1008 rehearsal passed) but nothing is scheduled, encrypted or off-host; `docs/operations/supabase.md` lists retention, encryption and RPO/RTO as activation blockers | DevOps | M |
| 20 | Point-in-time recovery | APPLIES-LATER | WAL archiving (pgBackRest or WAL-G) to B2 once tolerated data loss is under a day | DevOps | M |
| 21 | Soft deletes | NOT-APPLICABLE | Ledgers are append-only (`app_send_private.audit_events`, `app.inbound_receipts`); leads are suppressed, not deleted (`leads_controller.rb:126`); hard deletion is item 51 | - | - |
| 22 | Server-side validation | ALREADY-DONE | `apps/server/lib/elevateo/write_input.rb` and `auth_input.rb` bound bytes, encoding, decimals and lengths; `test/be_02/write_boundary_input_test.rb`; zod at web boundaries (`apps/web/src/features/outreach/contract.ts`) | Backend | - |
| 23 | Timezones | ALREADY-DONE | 130 `timestamptz` columns and no `timestamp without time zone` in `apps/server/db`; ISO 8601 UTC in responses | Backend | - |
| 24 | Apostrophes, emoji and RTL text | APPLIES-LATER | `valid_encoding` checks and an exact-limit Unicode positive control (INT991) exist; RTL rendering in the composer is untested | QA | S |
| 25 | Integer money | NOT-APPLICABLE | No monetary fields; budgets are integer counts (`apps/server/db/be03_send/budget_schema.sql`) | - | - |
| 26 | Idempotency keys | ALREADY-DONE | Logical send IDs and lease fencing (`apps/server/db/be03_send/tables.sql`), draft operation IDs (`/v1/draft-operations`), `apps/web/src/lib/ids.ts`; the Resend key wiring belongs to the adapter (backend task B1) | Backend | - |
| 27 | Dedup | ALREADY-DONE | Inbound receipts replay without duplicates (`test/inbound/imap_ingress_test.rb`); lead suppression and consent events | Backend | - |
| 28 | Deep pagination | ALREADY-DONE | Cursor pagination in `apps/server/app/controllers/v2/outreach/base_controller.rb` and admin controllers | Backend | - |
| 29 | Exports | APPLIES-LATER | No export endpoints; pilot access requests follow the operator procedure in `docs/runbooks/incident-response.md` | Backend | M |
| 30 | Robust CSV import | APPLIES-LATER | Leads are created one at a time (`leads_controller.rb:34`); a validated idempotent CSV import is a growth feature | Backend | M |
| 31 | Retention | APPLIES-NOW | No purge jobs in `apps/server/bin` or `apps/server/db`; define retention for sessions, rate-limit buckets, quarantined attachments, logs and backups, then implement the purge job (backend task B6) | Tech lead, Backend | M |

### Security

| # | Item | Verdict | Evidence or reason | Owner | Effort |
| --- | --- | --- | --- | --- | --- |
| 32 | Secrets out of the repo and history | ALREADY-DONE | `.gitignore` excludes `.env*`; a HEAD scan for AWS, Anthropic and OpenRouter key patterns and private keys is clean outside `third_party`; history holds only example env files and vendored self-signed sample certificates under `third_party/upstream/billionmail`; `.gitleaks.toml` and a CI job were added by this plan | Tech lead | - |
| 33 | Key rotation | APPLIES-NOW | Mail credentials carry `credential_version` (migrations 20261016000021 and 22, `lib/elevateo/mail_credentials/binding.rb`); the rotation schedule for DB passwords, the Auth JWT secret and provider keys is in `docs/runbooks/incident-response.md` and must be executed at go-live | DevOps | S |
| 34 | Package verification | ALREADY-DONE | Image digests pinned (`compose.yaml`, `apps/server/Dockerfile`); `Gemfile.lock` and `package-lock.json` exact versions; Gradle pinning (`apps/android/pin_gradle.py`) | Tech lead | - |
| 35 | Dependency scanning | APPLIES-NOW (applied) | `.github/dependabot.yml` covers npm, Bundler, Cargo, Docker and Actions | Tech lead | S |
| 36 | Input sanitisation | ALREADY-DONE | Item 22; the web never renders HTML (no `dangerouslySetInnerHTML` in `apps/web/src`); inbound HTML becomes plaintext (MAIL1026) | Backend | - |
| 37 | OWASP Top 10 pass | APPLIES-NOW | `test/qa817` covers auth, CSRF and tenancy, but no recorded OWASP pass exists over the v2 outreach and attachment endpoints | Security | M |
| 38 | Scanned and size-limited uploads | ALREADY-DONE | `MAX_BYTES` 10 MiB (`apps/server/lib/elevateo/attachments.rb:8`), ClamAV scanner process (`apps/server/bin/attachment-scanner`), quarantine states, `test/attachments` | Backend | - |
| 39 | Strict CORS | APPLIES-NOW | No CORS headers are emitted, so cross-origin reads are blocked, and writes require an exact Origin match (`lib/elevateo/write_input.rb` `transport!`, `test/qa817/origin_csrf_controller_test.rb`); desktop and Android hosts still need their origins in the expected-origin configuration (`apps/native/auth-contract-proposal.md`) | Backend | S |
| 40 | Security headers | APPLIES-NOW | API sets `no-store`, `nosniff` and `Referrer-Policy` (`v1/api_controller.rb:46-48`, `auth_entries_controller.rb:7`); the web bundle has no CSP, HSTS, X-Frame-Options or Permissions-Policy and `ops/` has no production reverse-proxy config | DevOps | S |
| 41 | Encryption | APPLIES-NOW | Session and refresh material is encrypted (`lib/elevateo/session_crypto`, `be02/tables.sql` `refresh_token_ciphertext`); TLS in transit; VPS disk encryption and encrypted off-host backups are not configured | DevOps | S |
| 42 | Least privilege including AI agents | ALREADY-DONE | Separate migrator, API, worker and gateway logins with FORCE RLS (`ops/db/bootstrap-auth-grants.sql`, `apps/server/db/sec802`); AI connector grants are specified in `docs/end-goal.md` and covered by item 108 | Backend | - |
| 43 | Safe audit logs | ALREADY-DONE | `app.organization_role_audit`, `app_send_private.audit_events`, receipt tables; callback secret redaction (`lib/elevateo/auth_callback_redaction`), redacted worker logs | Backend | - |
| 44 | Pentest | APPLIES-LATER | Before external customers; `financial planning/cost-model.csv` X01 | Security | L |
| 45 | Security questionnaire | APPLIES-LATER | Enterprise | Tech lead | S |
| 46 | Disclosure process | APPLIES-NOW (applied) | `SECURITY.md` | Tech lead | S |
| 47 | Stolen-laptop plan | APPLIES-NOW (applied) | `docs/runbooks/stolen-laptop.md` | Tech lead | S |
| 48 | SOC 2 | APPLIES-LATER | Enterprise; cost model X02 and X03 | Tech lead | L |
| 49 | HIPAA and BAAs | NOT-APPLICABLE | No health data is processed | - | - |
| 50 | View-audit | APPLIES-LATER | Per-user read state (`/v1/threads/:id/read-state`) is not an access log | Backend | M |
| 51 | GDPR deletion everywhere | APPLIES-NOW | Outreach stores third-party contact data with no erasure endpoint; document the operator procedure now (incident runbook) and build the endpoint before growth (backend task B7) | Backend | M |
| 52 | PCI | NOT-APPLICABLE | No card data | - | - |
| 53 | Data residency | APPLIES-LATER | Hetzner offers EU, US and Singapore; Resend processes in the US; Australian residency is unavailable on this stack and must be disclosed when asked | Tech lead | S |
| 54 | Access reviews | APPLIES-LATER | Quarterly review of `apps/server/config/administration/roster.json` grants and provider accounts | Tech lead | S |
| 55 | Matching environments | ALREADY-DONE | Pinned Supabase images and identical live and test Compose projects (`ops/supabase/compose.yaml`, `docs/operations/supabase.md`) | DevOps | - |

### Ops

| # | Item | Verdict | Evidence or reason | Owner | Effort |
| --- | --- | --- | --- | --- | --- |
| 56 | IaC | APPLIES-LATER | One hand-built VPS for the pilot with steps recorded in the DR runbook; Terraform or Ansible when a second host exists | DevOps | M |
| 57 | CI-gated deploys | APPLIES-NOW (partly applied) | `.github/workflows/ci.yml` runs web lint, typecheck, contract checks and Vitest plus server RuboCop lint and Steep; the Ruby suites need the Supabase stack and stay on fleet-02 (backend task B11); the deploy gate itself is DevOps | DevOps | M |
| 58 | Rollback | APPLIES-NOW (applied as runbook) | `docs/runbooks/disaster-recovery.md` covers image rollback and migration reversal; reversible migrations are item 15 | DevOps | S |
| 59 | Zero-downtime deploys | APPLIES-LATER | Single VPS; announced restarts are acceptable for ten users | DevOps | M |
| 60 | Feature flags | NOT-APPLICABLE | `ELEVATEO_OUTBOUND_HOLD` and `live_activation` are the only switches the pilot needs; a flag service would be speculative | - | - |
| 61 | Autoscaling | NOT-APPLICABLE | Single VPS pilot; revisit at growth | - | - |
| 62 | CDN | APPLIES-LATER | Cloudflare proxy is free and can front the web bundle when users are far from the host | DevOps | S |
| 63 | DNS and SSL renewals | APPLIES-NOW | Auto-renew the domain, use Caddy or certbot, add an UptimeRobot TLS-expiry monitor | DevOps | S |
| 64 | Job queues | ALREADY-DONE | PostgreSQL durable queue with leases and mailbox rotation (`apps/server/db/be03_send`) | Backend | - |
| 65 | Retries with backoff | ALREADY-DONE | `attempt_count` and `retry_deadline` (`be03_send/tables.sql:52-55`); bounded backoff in scanner and inbound workers (MAIL1029, MAIL1024) | Backend | - |
| 66 | DLQ | ALREADY-DONE | `unknown` and `needs_review` terminal states (`be03_send/tables.sql:48,89-90`) replace a DLQ; the operator view is backend task B5 | Backend | - |
| 67 | Single-run cron | ALREADY-DONE | Lease-based scheduling (`apps/server/db/migrate/20261016000025_lease_imap_polling.rb`, send-worker leases) | Backend | - |
| 68 | Cache invalidation | NOT-APPLICABLE | No cache layer; API responses are `no-store` | - | - |
| 69 | SPF, DKIM and DMARC | APPLIES-NOW | Resend domain records plus a DMARC policy for every sending domain; Gmail mailboxes rely on Google records | DevOps | S |
| 70 | Bounce and complaint handling | APPLIES-NOW | No Resend adapter or webhook endpoint exists in `apps/server` (`resend` appears only in config); lead suppression exists; build the signed webhook consumer that feeds it (backend task B2) | Backend | M |
| 71 | Storage lifecycle | APPLIES-LATER | Tied to item 31: attachment quarantine purge and backup rotation | Backend | S |
| 72 | Cost alerts | APPLIES-NOW | Set Resend, Hunter and AnymailFinder usage alerts and a monthly invoice review; Hetzner has no budget alert | DevOps | S |
| 73 | DR plan | APPLIES-NOW (applied as draft) | `docs/runbooks/disaster-recovery.md` | DevOps | S |
| 74 | Second region | APPLIES-LATER | Enterprise | DevOps | L |
| 75 | Structured logs | APPLIES-LATER | Rails logs to stdout at info with redaction (`apps/server/config/application.rb:23-25`) but not JSON | Backend | S |
| 76 | Error grouping | APPLIES-NOW | Add Sentry free tier or GlitchTip to the API, workers and web bundle (backend task B8) | Backend, Frontend | S |
| 77 | External uptime checks | APPLIES-NOW | UptimeRobot free on `/health` and `/ready` (`apps/server/config/routes.rb:4-5`) | DevOps | S |
| 78 | Tuned paging | APPLIES-LATER | Email alerts suffice until on-call exists | DevOps | S |
| 79 | Dashboards | APPLIES-LATER | Grafana or Hetzner metrics at growth | DevOps | M |
| 80 | Tracing | APPLIES-LATER | OpenTelemetry at growth | Backend | M |
| 81 | On-call | APPLIES-LATER | Pilot: named owner in business hours (`SECURITY.md`) | Tech lead | S |
| 82 | Runbooks | APPLIES-NOW (applied) | `docs/runbooks/` plus `ops/ops820/activation-checklist.md` | DevOps | S |
| 83 | Postmortems | APPLIES-NOW (applied as template) | `docs/runbooks/incident-response.md` | Tech lead | S |
| 84 | Status page | APPLIES-LATER | UptimeRobot free includes one; publish when external users exist | DevOps | S |

### Testing

| # | Item | Verdict | Evidence or reason | Owner | Effort |
| --- | --- | --- | --- | --- | --- |
| 85 | Unit tests | ALREADY-DONE | 891 Vitest tests in 67 files (run in Docker on fleet-02, 2026-10-18); 1,068 Ruby tests (MAIL1032, `state.md`) | - | - |
| 86 | Third-party integration tests | APPLIES-NOW | Real Supabase Auth and Storage, ClamAV, Mailpit and Mox are exercised; Resend is not integrated at all, so add adapter tests against Resend test mode (backend task B9) | Backend | M |
| 87 | E2E | ALREADY-DONE | `tests/acceptance` Playwright, Puppeteer and Selenium journeys in real Chromium and Firefox (`docs/completion/product-acceptance-matrix.md`) | QA | - |
| 88 | Load tests | ALREADY-DONE | `ops/perf/load.rb` and baseline guards; MAIL1022 selector benchmarks; 3,000 sends a day is far below measured capacity | QA | - |
| 89 | Synthetic data | ALREADY-DONE | Fixtures mode (`apps/web` `dev:fixtures`), synthetic rosters and seeds (`tests/acceptance/qa816-attachments-seed.rb`) | QA | - |
| 90 | Regression tests | ALREADY-DONE | Every fix in `state.md` ships a regression (INT1005, INT1007 for example) | - | - |
| 91 | Old hardware | APPLIES-LATER | Android 14 / WebView 113 is the only tested device profile | QA | S |
| 92 | Accessibility tests | APPLIES-LATER | 46 web components use ARIA roles and keyboard evidence exists, but no axe run is recorded | QA | S |

### Billing

| # | Item | Verdict | Evidence or reason | Owner | Effort |
| --- | --- | --- | --- | --- | --- |
| 93 | Subscriptions | NOT-APPLICABLE | Internal tool; no customer billing | - | - |
| 94 | Dunning | NOT-APPLICABLE | As 93 | - | - |
| 95 | PO invoices | NOT-APPLICABLE | As 93 | - | - |
| 96 | GST and VAT | NOT-APPLICABLE | No product billing; supplier GST is in the cost model | - | - |
| 97 | Refunds | NOT-APPLICABLE | As 93 | - | - |
| 98 | Metering | APPLIES-LATER | Per-mailbox send budgets exist (`be03_send/budget_schema.sql`); expose as usage reporting if commercialised | Backend | S |
| 99 | Contracts | NOT-APPLICABLE | As 93 | - | - |
| 100 | Finance reports | NOT-APPLICABLE | As 93 | - | - |

### API

| # | Item | Verdict | Evidence or reason | Owner | Effort |
| --- | --- | --- | --- | --- | --- |
| 101 | Signed and retried webhooks | APPLIES-NOW | Inbound Resend webhooks must be Svix-signature verified and idempotent (backend task B2); the app emits no outbound webhooks | Backend | M |
| 102 | Versioning | ALREADY-DONE | `/v1` and `/v2` with OpenAPI contracts (`contracts/v1`, `contracts/v2`, `apps/server/config/v2_route_registry.rb`); generated client types are checked in CI | Backend | - |
| 103 | Customer API keys | NOT-APPLICABLE | No public API; connector access is a scoped expiring user grant by design | - | - |
| 104 | API rate limits | APPLIES-LATER | Only auth endpoints are limited; body size limits exist; per-session limits at growth | Backend | S |
| 105 | Upstream format changes | ALREADY-DONE | Strict fail-closed parsing of Auth and IMAP responses; the Resend adapter must pin its API version (backend task B1) | Backend | - |
| 106 | OAuth refresh | APPLIES-NOW (decision) | Supabase Auth refresh is implemented (`be02/refresh.sql`); Gmail OAuth is not; decide app passwords versus OAuth before enrolling mailboxes (`financial planning/pilot.md`, decision 1) | Tech lead | S |
| 107 | Sandbox | ALREADY-DONE | Provider simulator, Mailpit, Mox and `ELEVATEO_OUTBOUND_HOLD` | Backend | - |

### AI

| # | Item | Verdict | Evidence or reason | Owner | Effort |
| --- | --- | --- | --- | --- | --- |
| 108 | Prompt injection | APPLIES-NOW | The connector is unbuilt; `docs/end-goal.md` requires that instructions inside mail cannot expand grants; treat message bodies as data and add tests before the connector ships | Backend | M |
| 109 | Keeping data out of prompts | APPLIES-NOW | The UI must show when content is shared with an external AI service (`docs/end-goal.md`); pass the minimum fields to the connector | Frontend, Backend | S |
| 110 | Per-customer spend caps | NOT-APPLICABLE | Users bring their own Claude and Codex accounts; the app pays no model bills | - | - |
| 111 | Evals | APPLIES-LATER | When drafting assistance exists | Backend | M |
| 112 | Provider fallback | NOT-APPLICABLE | The app does not call model APIs | - | - |
| 113 | Model deprecation plan | APPLIES-LATER | Connector maintenance note once built | Tech lead | S |
| 114 | Redacted prompt logs | APPLIES-LATER | Connector logs must redact message content; design with the connector | Backend | S |
| 115 | Human approval for irreversible actions | ALREADY-DONE | Sends require explicit approval of an exact draft version (`/v1/drafts/:id/send-approvals`, `be03_send/approve.sql`); nothing else is irreversible | Backend | - |

### UX

| # | Item | Verdict | Evidence or reason | Owner | Effort |
| --- | --- | --- | --- | --- | --- |
| 116 | Hotel wifi | APPLIES-NOW | The web handles transport errors (`apps/web/src/features/thread/ThreadPage.test.tsx` offline cases) but Android does not reflect network loss (ANDROID1035, `state.md`) | Frontend | S |
| 117 | All screen states | ALREADY-DONE | `.planning/STANDARDS.md` requires empty, loading and error states; `InboxPage` and `ThreadPage` tests cover them | Frontend | - |
| 118 | Actionable errors | ALREADY-DONE | Error envelope contract (`docs/completion/vera-adv146-error-envelope-repair.md`); exact alert text in acceptance tests | Frontend | - |
| 119 | Form persistence | ALREADY-DONE | Draft operations and approval recovery (`apps/web/src/app/approvalRecovery.ts`, SCN-DRAFT-003-P) | Frontend | - |
| 120 | Rendering across email clients | NOT-APPLICABLE | Outbound mail is plaintext; no HTML composer or templates exist in `apps/web` | - | - |
| 121 | Notification opt-out | ALREADY-DONE | Consent withdrawal and suppression (`leads_controller.rb:104,126`, `apps/web/src/features/outreach/ConsentEvidenceForm.tsx`) | Backend | - |
| 122 | Undo | ALREADY-DONE | Send cancellation before dispatch (`/v1/send-intents/:id/cancellation`) | Backend | - |
| 123 | a11y | APPLIES-LATER | See item 92 | QA | S |
| 124 | i18n | NOT-APPLICABLE | Single-language internal pilot; revisit if sold abroad | - | - |
| 125 | Back button | ALREADY-DONE | Navigation and filter state live in the URL (`.planning/STANDARDS.md`; react-router search params in `apps/web/src/features`) | Frontend | - |

### Code health

| # | Item | Verdict | Evidence or reason | Owner | Effort |
| --- | --- | --- | --- | --- | --- |
| 126 | Readable code | ALREADY-DONE | Steep strict typing, ESLint `--max-warnings 0`, AIDEV anchors, bounded review packets with defect density in `code-reviews.md` | - | - |
| 127 | Review | ALREADY-DONE | `code-reviews.md` and `docs/completion` review packets | - | - |
| 128 | Branching | APPLIES-NOW | `feature/`, `bugfix/`, `hotfix/` naming is followed; enable branch protection and required CI checks on `main` in GitHub settings | Tech lead | S |
| 129 | Monthly upgrades | APPLIES-NOW (applied) | Dependabot monthly schedule | Tech lead | S |
| 130 | Dead code | APPLIES-LATER | `third_party/upstream` vendored snapshots (a 123k-line gif, Monaco bundles) dominate repository size; choose Git LFS or removal | Tech lead | S |
| 131 | Splitting large files | ALREADY-DONE | No hand-written source file exceeds 1,000 lines; the two generated OpenAPI type files are listed in `docs/large-files.md` | - | - |
| 132 | ADRs | ALREADY-DONE | `docs/decisions/0001-mailbox-ownership.md`, `0002-local-architecture.md` | - | - |
| 133 | README that gets someone running in an hour | APPLIES-NOW | `README.md` is 760 lines led by the state log; "Start the local build" (line 323) and "Setup and testing" (line 367) should move to the top | Tech lead | S |
| 134 | Docs | ALREADY-DONE | `documentation.md`, `docs/`, `.planning/` | - | - |
| 135 | Admin panel | ALREADY-DONE | `apps/web/src/features/members/AdministrationPage.tsx`, `apps/server/app/controllers/v2/admin` | - | - |
| 136 | Support tooling | APPLIES-LATER | Operator view for `needs_review` sends and suppression (backend task B5) | Backend, Frontend | M |
| 137 | Changelog | APPLIES-NOW (applied) | `CHANGELOG.md` | Tech lead | S |
| 138 | Terms and privacy that match the code | APPLIES-NOW | No terms or privacy text in the repository; outreach to external recipients needs a privacy notice, sender identification and a working unsubscribe under the Spam Act 2003 and the Privacy Act | Tech lead | M |
| 139 | Company-owned accounts | APPLIES-NOW | Hetzner, Resend, Cloudflare, Apple, Google Play, Azure and GitHub accounts must be company-owned with two administrators each (checklist in `docs/runbooks/stolen-laptop.md`) | Tech lead | S |
| 140 | Bus factor | APPLIES-NOW | One operator today; a second person with production, backup and account access before go-live | Tech lead | S |

### People

| # | Item | Verdict | Evidence or reason | Owner | Effort |
| --- | --- | --- | --- | --- | --- |
| 141 | Roles needed | APPLIES-NOW | Tech lead, backend, senior full-stack, DevOps, security and QA at the fractional days in `financial planning/pilot.md` | Tech lead | - |
