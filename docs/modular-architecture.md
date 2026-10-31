# Backend modular architecture

Scope: `apps/server`, on the modular-boundaries branch, 2026-11-01. The binding baseline is
[STANDARDS.md](../.planning/STANDARDS.md). This is an enforced logical modular monolith with
explicit legacy safety exceptions, not a claim of complete database or physical-directory isolation.

## Contracts and rules

[architecture.json](../apps/server/architecture.json) is the checked-in contract: every runtime file has
one capability owner; every public Ruby constant is named explicitly. Unlisted constants are internal.
Nested constants are not implicitly exported with their parent class. Controller/worker composition
roots are classified too. New source files must be classified before the backend gate passes.

Synchronous Ruby calls use these named APIs. `Mailbox::MessageSnapshots#search/#read` returns bounded,
untrusted plain-text DTOs with citations, using the caller's existing guarded connection. Connector
operations no longer query mailbox tables or borrow the drafts SQL adapter for message reads. Citation
revalidation still precedes draft save. No transaction, authorization, RLS or suppression query changed.

Legacy flat files remain physically flat to avoid broad require-path and auth/send refactors. Their
capability membership is explicit below; existing directories already group delivery, inbound, outreach,
email finder and draft internals. New mailbox persistence lives under `lib/elevateo/mailbox/`.
Application services, validation/domain rules and persistence belong to their capability, even when
legacy filenames are flat. Physical regrouping is a follow-up, not an unverified claim of this change.

SQL routine access is an explicit caller/function pair in `sql_contracts`; the `functions` list is an
identifier catalog, **not** a global export. PostgreSQL session settings share that catalog because they
are schema-shaped string identifiers, not tables. Existing SQL functions are transactional APIs where
splitting reads/writes would weaken current authority. Their foreign-table exceptions are below.

There is no new event bus or dependency. Existing durable send intents/jobs, ingestion receipts,
webhook records and finder jobs coordinate asynchronous work. Do not replace atomic permission checks
with eventually consistent events. API/worker calls within each process remain in-process; separate
workers consume durable PostgreSQL state rather than RPC between business modules.

## Single release artifact

`ops/production/compose.yaml:3-4` defines `x-runtime` with one required pinned
`ELEVATEO_PRODUCTION_IMAGE`. `launch-api`, `launch-worker`, `email-finder-worker` and the attachment
gateway inherit it. `apps/server/Dockerfile` copies the same backend and gems into one image. Processes
are separate, as STANDARDS requires, but capabilities are not independently deployed services. The
private attachment gateway HTTP/storage boundary is an existing infrastructure exception. Mox,
Supabase, edge and the separately packaged MCP client adapter are infrastructure/adapters outside this
backend release artifact; this does not claim the whole product is one image.

## Capability and entry-point map

Paths below are relative to `apps/server`. The manifest contains the exhaustive file and public API map.

| Capability | Responsibility | Files | Location |
| --- | --- | ---: | --- |
| attachments | Inbox attachments, quarantine, scanning and storage | 10 | `lib/elevateo` |
| connectors | Revocable connector grants and search/read/draft application operations | 3 | `lib/elevateo` |
| delivery | Approval, immutable sends, worker transports and Resend ingress/events | 33 | `lib/elevateo`, `lib/elevateo/resend_events`, `lib/elevateo/send_api`, `lib/elevateo/send_worker` |
| drafts | Draft editing, versioned persistence and draft attachment binding | 9 | `lib/elevateo`, `lib/elevateo/drafts` |
| email_finder | Bounded lookup, CSV jobs and resumable worker | 7 | `lib/elevateo/email_finder` |
| entrypoints | HTTP controllers, worker launchers, initializers and private gateway adapters | 60 | `app/controllers`, `app/controllers/v1`, `app/controllers/v2`, `app/controllers/v2/admin`, `app/controllers/v2/outreach`, `attachment_gateway`, `bin` |
| identity | Sign-in, sessions, revocation and SSO | 17 | `lib/elevateo` |
| inbound | IMAP/fake ingress, MIME conversion, leases and receipts | 17 | `lib/elevateo/inbound` |
| mail_credentials | Validated credential/binding snapshots | 2 | `lib/elevateo/mail_credentials` |
| mailbox | Threads, messages, search, collaboration and snapshot DTO reads | 13 | `lib/elevateo`, `lib/elevateo/mailbox` |
| outreach | Campaigns, consent, sequences and marketing runs | 7 | `lib/elevateo/campaigns`, `lib/elevateo/outreach_sequence` |
| shared_kernel | Tenant identity/policy, bounded input/output/configuration and shared errors | 16 | `lib/elevateo` |

HTTP entry points are the classified `app/controllers` v1/v2, auth, health and provider controllers. Worker/boot and gateway entry points are:

- `attachment_gateway/app.rb`
- `attachment_gateway/authority.rb`
- `attachment_gateway/config.ru`
- `attachment_gateway/draft_stage.rb`
- `attachment_gateway/protocol.rb`
- `attachment_gateway/puma.rb`
- `bin/attachment-scanner`
- `bin/email-finder-worker`
- `bin/inbound-worker`
- `bin/rails`
- `bin/resend-events-worker`
- `bin/send-worker`
- `bin/worker`
- `bin/worker-health`

### Constant dependency matrix

Counts are unique caller-file/target-constant edges after the extraction (including named DTO constants), not invocation counts. Same-capability edges are omitted. The exhaustive extracted edges are in [inventory-final.json](completion/modular-monolith-20261101/inventory-final.json).

| Caller \ owner | attachments | connectors | delivery | drafts | email_finder | identity | inbound | mail_credentials | mailbox | outreach | shared_kernel |
| --- | ---: | ---: | ---: | ---: | ---: | ---: | ---: | ---: | ---: | ---: | ---: |
| attachments | 0 | 0 | 0 | 0 | 0 | 0 | 0 | 0 | 0 | 0 | 2 |
| connectors | 0 | 0 | 0 | 6 | 0 | 2 | 0 | 0 | 3 | 0 | 7 |
| delivery | 3 | 0 | 0 | 3 | 0 | 0 | 1 | 5 | 6 | 0 | 9 |
| drafts | 0 | 0 | 0 | 0 | 0 | 0 | 0 | 0 | 4 | 0 | 20 |
| email_finder | 0 | 0 | 0 | 0 | 0 | 0 | 0 | 0 | 0 | 0 | 2 |
| entrypoints | 19 | 8 | 29 | 14 | 6 | 35 | 7 | 2 | 24 | 10 | 108 |
| identity | 0 | 0 | 0 | 0 | 0 | 0 | 0 | 0 | 0 | 0 | 15 |
| inbound | 1 | 0 | 1 | 0 | 0 | 0 | 0 | 4 | 1 | 0 | 3 |
| mail_credentials | 0 | 0 | 0 | 0 | 0 | 0 | 0 | 0 | 0 | 0 | 0 |
| mailbox | 0 | 0 | 0 | 0 | 0 | 0 | 0 | 0 | 0 | 0 | 44 |
| outreach | 0 | 0 | 8 | 2 | 0 | 0 | 0 | 0 | 1 | 0 | 7 |
| shared_kernel | 0 | 0 | 0 | 0 | 0 | 2 | 0 | 0 | 7 | 0 | 0 |

Matrix cells count unique static constant edges; zero means no cross-module edge (including the diagonal).

## Table ownership matrix

The 76 source-declared application tables below include historical schema definitions. No migration was added or modified. Direct runtime SQL references are extracted separately from Ruby strings.

| Owner | Tables |
| --- | --- |
| attachments | `app.inbox_attachments` |
| connectors | `app_connector_private.grants` |
| delivery | `app.resend_inbound_receipts`, `app.resend_inbound_routes`, `app.resend_webhook_events`, `app_send_private.approval_operations`, `app_send_private.attempt_budgets`, `app_send_private.attempts`, `app_send_private.audit_events`, `app_send_private.budget_limits`, `app_send_private.budget_routes`, `app_send_private.budget_usage`, `app_send_private.intents`, `app_send_private.jobs`, `app_send_private.mailbox_policy`, `app_send_private.mailbox_schedule`, `app_send_private.mox_domains`, `app_send_private.observations`, `app_send_private.organization_policy`, `app_send_private.recipient_suppressions`, `app_send_private.reconciliation_checks`, `app_send_private.resend_acceptance`, `app_send_private.resend_delivery`, `app_send_private.resend_events`, `app_send_private.scheduler_cursor`, `app_send_private.smtp_accounts` |
| drafts | `app.draft_attachments`, `app.drafts`, `app_drafts_private.attachment_stage_operations`, `app_drafts_private.operations` |
| email_finder | `app.email_finder_domains`, `app.email_finder_jobs`, `app.email_finder_people`, `app.email_finder_rate_state`, `app.email_finder_results`, `app.email_finder_suppressions` |
| identity | `app_auth.authorization_generations`, `app_auth.pending_entries`, `app_auth.rate_limits`, `app_auth.revocation_intents`, `app_auth.sessions` |
| inbound | `app.inbound_fake_accounts`, `app.inbound_imap_accounts`, `app.inbound_imap_receipts`, `app.inbound_imap_rejections`, `app.inbound_receipts` |
| mailbox | `app.messages`, `app.thread_assignments`, `app.thread_notes`, `app.thread_read_states`, `app.thread_stars`, `app.threads` |
| outreach | `app.campaign_accounts`, `app.campaign_consent_events`, `app.campaign_leads`, `app.campaign_mutations`, `app.campaign_sequence_mutations`, `app.campaign_sequence_occurrences`, `app.campaign_sequence_steps`, `app.campaign_sequences`, `app.campaign_suppressions`, `app.campaigns`, `app.marketing_enrollments`, `app.marketing_runs` |
| shared_kernel | `app.mailbox_grant_ceilings`, `app.mailbox_membership_revisions`, `app.mailbox_memberships`, `app.mailbox_policy_receipts`, `app.mailbox_security`, `app.mailboxes`, `app.organization_access`, `app.organization_enrollment_receipts`, `app.organization_memberships`, `app.organization_role_audit`, `app.organizations`, `app.user_display_preferences` |

The shared kernel includes organization/mailbox membership identity, its access/policy/revision/receipt
and audit tables, and user display preferences used by tenant administration. These are the explicit
legacy tenancy-policy extension to the three identity concepts in the brief, not arbitrary business
tables. Composite organization/mailbox foreign keys and RLS are retained by design. There are no
undeclared direct Ruby foreign-table edges after moving connector reads to the mailbox API.

## Runtime exceptions

Each exception is exact caller + target; a different caller or target fails. Composition roots may
construct existing adapters but those adapters are not globally public. In particular campaign and
finder repositories expose a generic `rows` helper internally and are **not** global public APIs.
Their existing HTTP roots are explicit legacy exceptions; adding another cross-capability caller fails.

| Caller | Internal target | Reason |
| --- | --- | --- |
| `app/controllers/v2/email_finder_controller.rb` | `Elevateo::EmailFinder::Repository` | Legacy composition root invokes bounded domain methods under existing authorization; generic rows is internal, not a public cross-module contract. Preserve schema-worker-owned repository unchanged. |
| `app/controllers/v2/inbox_attachments_controller.rb` | `Elevateo::Attachments::Repository` | Composition root constructs the existing adapter and injects it into the public service; no domain-to-domain persistence API is exported. |
| `app/controllers/v2/outreach/base_controller.rb` | `Elevateo::Campaigns::Repository` | Legacy composition root invokes bounded domain methods under existing authorization; generic rows is internal, not a public cross-module contract. Preserve schema-worker-owned repository unchanged. |
| `attachment_gateway/app.rb` | `Elevateo::Attachments::PrivateStorage` | Composition root constructs the existing adapter and injects it into the public service; no domain-to-domain persistence API is exported. |
| `bin/attachment-scanner` | `Elevateo::Attachments::ClamdScanner` | Composition root constructs the existing adapter and injects it into the public service; no domain-to-domain persistence API is exported. |
| `bin/attachment-scanner` | `Elevateo::Attachments::Repository` | Composition root constructs the existing adapter and injects it into the public service; no domain-to-domain persistence API is exported. |
| `bin/email-finder-worker` | `Elevateo::EmailFinder::Repository` | Legacy composition root invokes bounded domain methods under existing authorization; generic rows is internal, not a public cross-module contract. Preserve schema-worker-owned repository unchanged. |
| `bin/send-worker` | `Elevateo::SendWorker::SmtpProfile` | Composition root constructs the existing adapter and injects it into the public service; no domain-to-domain persistence API is exported. |
| `bin/send-worker` | `Elevateo::SendWorker::SmtpTransport` | Composition root constructs the existing adapter and injects it into the public service; no domain-to-domain persistence API is exported. |
| `lib/elevateo/campaigns/runs.rb` | `Elevateo::SendAPI::Database` | Marketing run calls existing send authorization stored-function adapter; preserve approval authority and transaction ordering. |
| `lib/elevateo/campaigns/runs.rb` | `Elevateo::SendAPI::Service::CANCEL_SQL` | Existing outreach/send authority bridge preserves locked review/cancel stored-function semantics; SQL is not a general public facade. |
| `lib/elevateo/campaigns/runs.rb` | `Elevateo::SendAPI::Service::REVIEW_SQL` | Existing outreach/send authority bridge preserves locked review/cancel stored-function semantics; SQL is not a general public facade. |
| `lib/elevateo/connector_grants.rb` | `Elevateo::Drafts::Database` | Existing bound-query/JSON adapter reused inside caller-owned RLS transaction. Retained to avoid changing auth/send transaction seams; arbitrary SQL is not a public contract. |
| `lib/elevateo/resend_events/content.rb` | `Elevateo::Inbound::ImapHtmlText` | Provider ingestion reuses the bounded HTML-to-plain-text sanitizer; one sanitization implementation prevents divergent unsafe rendering. |
| `lib/elevateo/send_api/database.rb` | `Elevateo::Drafts::Database` | Existing bound-query/JSON adapter reused inside caller-owned RLS transaction. Retained to avoid changing auth/send transaction seams; arbitrary SQL is not a public contract. |
| `lib/elevateo/send_api/service.rb` | `Elevateo::Drafts::Projection` | Send responses reuse draft DTO timestamp conversion; immutable approval/status projection retained to avoid wire-format drift. |
| `lib/elevateo/send_api/status.rb` | `Elevateo::Drafts::Projection` | Send responses reuse draft DTO timestamp conversion; immutable approval/status projection retained to avoid wire-format drift. |

### Dynamic and local SQL

Four adapters use reviewed dynamic identifiers: campaign resource tables (literal kind/table allowlist),
session function names (literal allowlist), inbox/draft scanner function families (validated scan kind),
and leased IMAP function names (fixed prefix transformation). `dynamic_sql` stores normalized-source
SHA-256 digests for these exact files. Any edit requires a fresh ownership review; never refresh a digest
just to silence a failure. Concurrent schema-worker suppression changes will require that review if
merged into this branch later. `pg_locks` in the finder worker is a PostgreSQL catalog; `saved` in thread
star persistence is a local CTE. Those two exact caller/name pairs are the only unqualified SQL exceptions.

## Database integrity exceptions

The schema is owned by the concurrent schema-integrity task. Keep these eight non-kernel cross-module
foreign keys: dropping them would weaken tenant, approval or receipt integrity. Paths are under
`apps/server/db`; this audit is source-based and includes migration definitions.

| Source -> target | Source definition | Justification |
| --- | --- | --- |
| `app.drafts` -> `app.threads` | `be02_drafts/tables.sql:18` | Tenant/mailbox reply integrity; thread deletion clears reply reference |
| `app_send_private.intents` -> `app.drafts` | `be03_send/tables.sql:31` | Immutable approval identity and restrictive deletion |
| `app.inbound_receipts` -> `app.threads` | `migrate/20261015000011_create_isolated_inbound.rb:27` | Atomic receipt/content integrity |
| `app.inbound_receipts` -> `app.messages` | same file, line 30 | Replay-safe content association |
| `app.inbound_imap_receipts` -> `app.threads` | `migrate/20261015000012_create_held_imap_ingress.rb:24` | Tenant-bound fenced ingestion |
| `app.inbound_imap_receipts` -> `app.messages` | same file, line 27 | Tenant-bound fenced ingestion |
| `app.inbox_attachments` -> `app.messages` | `migrate/20261015000015_create_inbox_attachments.rb:35` | Exact message tenancy/lifecycle |
| `app.resend_inbound_receipts` -> `app.messages` | `resend_events/schema.sql:21` | Deferred integrity for atomic provider ingestion |

The other 23 cross-owner FK edges terminate in the shared kernel: drafts/threads/send mailbox policy,
campaign accounts, inbound accounts/rejections, marketing runs, connector grants and resend routes ->
mailboxes; thread read/star state -> organization memberships; Mox domains/send organization policy,
five finder tables, campaigns/suppressions/mutations and marketing runs -> organizations. Same-module
and shared-kernel-internal FKs are not cross-module exceptions.

### Stored-routine table access exceptions

| Routine boundary | Foreign data | Definitions under `apps/server/db` | Why retained |
| --- | --- | --- | --- |
| Draft save -> mailbox | `app.threads` | `be02_drafts/save.sql` | Validate reply under current tenant transaction |
| Delivery -> draft/mailbox | `app.drafts`, `app.threads`, `app.messages` | `be03_send/draft_bridge.sql`, `migrate/mail_reply_identity/up.sql` | Atomic approval/consumption/status/reply identity |
| Delivery -> draft attachments | `app.draft_attachments`, `app_drafts_private.attachment_stage_operations` | `be03_send/resend_attachments_v3.sql` | Immutable approved attachment bytes/digest |
| Delivery -> outreach | `app.campaign_leads`, `app.campaign_suppressions`, `app.campaigns`, `app.marketing_enrollments`, `app.marketing_runs` | `be03_send/marketing_authority_v1.sql`, `migrate/20261020000039_create_marketing_runs.rb`, `be03_send/resend_attachments_v3.sql`, `be03_send/production_mox/authority.sql` | Locked consent/suppression/run recheck immediately before dispatch |
| Delivery -> identity | `app_auth.sessions`, `app_auth.authorization_generations` | `be03_send/session_bridge.sql`, `be03_send/worker_authority.sql` | Atomic current authorization and revocation |
| Inbound -> mailbox | `app.messages`, `app.threads` | migrations `20261015000011`, `20261015000012`, `20261015000017`; `migrate/imap_receipt_replay/up.sql`, `migrate/mail_reply_identity/up.sql` | Receipt, lease, content, UID and identity commit together |
| Attachments -> mailbox | `app.messages` | `migrate/20261015000015_create_inbox_attachments.rb` | Tenant-bound parent before staging |
| Resend ingestion -> mailbox/attachments | `app.threads`, `app.messages`, `app.inbox_attachments` | `resend_events/inbound.sql` | Deduplicated atomic provider ingestion |

These are database-layer exceptions, not claims that the Ruby scanner parses PL/pgSQL. Historical
routine bodies can be superseded by later migrations. Database authorization/locking regression suites
remain mandatory; do not infer deployed definitions from directory names alone.

## Guard and proof

`test/architecture/boundaries_test.rb` runs through `ops/tests/be02/test-suites.sh`, the standard backend
gate before Steep and RuboCop. The scanner uses only Ruby stdlib (Ripper, JSON, Digest): syntax-tree
constant references/declarations, SQL string identifiers, declared ownership and exact exceptions.
It rejects unknown source/SQL objects, foreign private references, foreign namespace extensions,
unqualified relations, unauthorized routine callers, dynamic constant lookup, unreviewed dynamic SQL,
and stale constant/table exceptions. Regression fixtures deliberately violate each boundary and assert
rejection; a public class does not export its SQL constant. No production file is corrupted for the proof.

This is a build-time architecture guard, not a malicious-code sandbox or a general Ruby/SQL interpreter.
Runtime-generated code, arbitrary eval and SQL generation outside the documented patterns are not
supported architecture conventions. Source snapshots/digests and explicit API exports require review.
RLS and database privileges continue providing runtime security independently of the guard.

## Tradeoffs and follow-ups

Analytical design review simulated revocation-before-read, edit-after-approval, ingest replay and new
illegal dependencies. Reusing the guarded connection preserves revocation; preserving send/ingest
transactions retains locks and atomic receipts; exact exceptions reject new dependency edges. Splitting
those safety paths for directory purity would risk correctness. No Obsidian connection was available;
these simulations were review reasoning, not external executions.

No schema change is required for the accepted integrity exceptions. A future strict database-isolation
project would need owner-controlled reply lookup/ingest/attachment-parent routines and draft
binding/consumption routines, replacing direct foreign-table privileges with EXECUTE while preserving
transaction boundaries, lock ordering, RLS and final authority checks. That is separate coordinated work.

The full gate exposed an existing rollback defect: `CreateOrganizationAccess#down` drops
`app.authorize_outreach_content_read(text)` while six finder RLS policies still depend on it.
Schema follow-up: roll back the dependent finder policies first in the migration test's dependency order,
or explicitly restore those policies around the function rollback; do not use blind CASCADE. This branch
does not edit `apps/server/db`, add migrations, or change campaign/finder suppression/index SQL.

The latest full gate also had isolated Mailpit acceptance and separate Mox protocol failures; those are
recorded as unrelated follow-ups, not passing results. Validation commands, counts, reviews and cleanup are in
[the receipt](completion/modular-monolith-20261101/receipt.md). No push, merge, deployment or live send occurred.
