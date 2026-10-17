# BE-02B thread persistence and readers

Status: implementation written; **runtime NOT RUN**. This worker was explicitly prohibited from running Docker, SSH, host application tests, paid calls, review agents or commits. The coordinator owns execution, adversarial review, integration acceptance and root-document reconciliation. Nothing in this report declares BE-02 or the application complete.

Task `task_fa96d0fcf103`, dispatch `ctx_01fd63dfea02`, worker terminal `term_2a6f5121-c2a1-44ba-9a50-7c9830bf584a`. Changes are confined to the B reservation: fourteen implementation/signature/test files plus this report. No dependency was added.

<!-- AIDEV-NOTE: B readers depend on A authorization and A2 cursor/byte utilities; D owns explicit read-state writes. -->

## Contract and implementation boundary

The accepted [implementation brief](be02-implementation-brief.md), [BE-02 decisions](../../.planning/consultations/results/be-02/decisions.md), [local architecture ADR](../decisions/0002-local-architecture.md) and [standards](../../.planning/STANDARDS.md) govern this implementation. Canonical `contracts/v1/openapi.json` remains version `1.0.0-session.1`, SHA256 `f6524b78e870d9af7e6b8c38bda9a327c3d05c8e2c974ef450db489d31c2a7e4`; its hash was checked before and after implementation. No contract or fixture was changed.

| Endpoint | Reader and ordering | Response boundary |
| --- | --- | --- |
| `GET /v1/mailboxes/{mailbox_id}/threads` | `ThreadReads#list(mailbox_id:, query:)`; `last_message_at DESC NULLS LAST, id DESC`; filter `all` or `unread` | Default/max 50; exact ThreadPage; complete serialized body at most 262144 bytes |
| `GET /v1/threads/{thread_id}?mailbox_id=...` | `ThreadReads#detail(thread_id:, query:)`; `sent_at ASC NULLS FIRST, id ASC` | Required mailbox; default/max 20; exact ThreadDetailPage with `messages`; complete body at most 2097152 bytes |

Each method returns a JSON **String** for rendering unchanged. Controllers use `protected_read(allowed_query:, budget:)`, the coordinator's current `mailbox_id`/`thread_id` route parameters and `read_config.cursor_signing_key`. The constructor is `Elevateo::ThreadReads.new(connection:, identity:, session:, cursors:)`; identity supplies `user_id`/`org_id`, session supplies canonical string-keyed context/version fields. Flat RBS describes this boundary and the projection helpers.

The wrapper authenticates outside SQL, reauthorizes inside the same `REPEATABLE READ READ ONLY` snapshot as all reads and serialization, then closes that snapshot before separate session activity maintenance. B neither opens a transaction nor marks a thread read. `ThreadReads::NotAvailable` becomes 404 `not_available`; `InvalidQuery` becomes 400 `request_invalid`; the shared wrapper owns cursor, response-overflow, database and deadline errors. Valid UUID resources that are private, foreign, mismatched or absent have the same unavailable result; no privileged existence probe is made.

## Persistence and visibility

Migration `20261013000002_create_app_threads_messages.rb` executes four fixed SQL resources: three for up, one for down. It creates:

- `app.threads`: UUID identity, organization/mailbox scope, nullable full subject and creation time; composite organization/mailbox FK to the existing mailbox table.
- `app.messages`: UUID identity, organization/mailbox/thread scope, nullable sender and sent timestamp, bounded canonical JSON address/recipient shapes, full plaintext body and attachment count; composite FK to its thread.
- `app.thread_read_states`: organization/mailbox/thread/user primary key, `is_read` and update time; composite thread and organization-membership FKs.

All three tables enable and force RLS. Their policies inherit the existing mailbox visibility through RLS-protected subqueries; read-state rows additionally require the current `app.user_id`. Policies use foundation `app.org_id`/`app.user_id`, not browser-supplied tenant claims. API authority comes through the existing `elevateo_app_read` role and only named SELECT columns are granted; created/update metadata, writes, worker access and PUBLIC access receive no grant. A's authorization-generation/session functions are unchanged.

SQL constraints require canonical address objects with exactly nullable `display_name` and `address` fields, each at most 256 code points; recipients are an array of at most 100 such objects. Sender uses SQL NULL for the nullable canonical sender; JSON `null` is not an address object. Attachment count is 0..1000. Non-null sent timestamps must be finite, UTC-representable years 0001..9999. PostgreSQL UUIDs and composite relationships prevent organization/mailbox/thread mismatches.

Indexes cover mailbox thread keys, message `(organization_id, mailbox_id, thread_id, sent_at DESC NULLS LAST, id DESC)` order and actor/mailbox read-state lookup. A reverse scan of the message index supports the canonical ascending/nulls-first detail order. Down drops only B tables/functions, in dependency order, without CASCADE; later C/D dependants must be rolled back before B. Foundation and A objects remain untouched.

## Read-state handoff to D

Unread is `NOT COALESCE(current_actor_state.is_read, FALSE)`: absent state means unread, including an empty conversation. Reading never creates or updates that state. Two actors can independently read the same shared thread without overwriting each other.

D's explicit read-state write should upsert `(organization_id, mailbox_id, thread_id, authenticated_user_id)`, set `is_read` from its validated canonical request and maintain `updated_at` inside the accepted session/generation/business-row lock order. B deliberately grants no API DML; D must supply its reviewed write authority. Any future incoming-message ingestion that should make an already-read conversation unread must explicitly invalidate/update these actor states in its write transaction; automatic ingestion is outside this slice. No global unread flag was added to threads.

## Bounded projection, pagination and design tradeoff

Queries use bound values and explicit UUID/timestamp/integer casts. They fetch only `limit + 1` visible rows, with the extra row proving continuation. Subject/body source text is clipped in SQL to the canonical limit plus one where truncation must be reported; preview is clipped to 256. JSONB address fields are cast to text and parsed through a bounded shape-checking boundary, avoiding PostgreSQL adapter decoder differences. Full source text can be retained without materializing unbounded bodies into Ruby.

Summary subject is at most 256 characters; detail subject is at most 998; message body is at most 16384. Truncation flags reflect the extra source character. Null sender/date/subject, nullable address fields and empty conversation/message arrays are preserved. Plaintext containing HTML remains literal text. UTC formatting retains PostgreSQL microseconds, so cursor ties are not accidentally merged. Message count is derived from RLS-visible messages and capped at the schema's signed-int maximum; no pagination total or hidden-resource total is returned.

Shared `Cursors` binds actor, organization, context, authorization version, resource, mailbox, thread when present, filter, order and limit. Positions contain only the last included UUID and nullable timestamp; wrong keys, invalid calendar dates, invalid IDs, tampering and scope changes fail closed. The null branches explicitly implement both canonical orderings. Source lookup and each continuation re-use the authorized snapshot supplied by A.

Shared `ReadResponse.page` receives the complete envelope and uses `items_key: "messages"` for detail. It measures UTF-8 JSON after escaping, includes envelope/cursor bytes and removes only whole trailing entries. Its cursor always refers to the final included entry. An item that cannot fit alone raises an overflow rather than yielding an empty or skipped continuation. Tests construct the canonical maximum body/100 recipients/address fields/attachment count/context/cursor plus control characters that expand to six JSON bytes each; execution of that serializer proof is still pending.

Activity, latest sender/preview and count remain derived rather than cached on threads. Analytical tradeoff: after message insertion or deletion, derived values follow the same snapshot immediately and cannot disagree with separately maintained counters; a cached activity key could enable a cheaper mailbox-level ordered scan but adds write-time synchronization and revocation-sensitive maintenance. The chosen query performs indexed latest-message lookup per eligible thread, then sorts activity in PostgreSQL before bounded LIMIT; count work applies only to returned/lookahead threads. This keeps application materialization bounded but does not claim constant database work for a large mailbox. The coordinator should assess plans and deadline behavior on representative data; no performance benchmark or Obsidian simulation was executed here.

## Authored checks and remaining acceptance

There are 23 test methods across three files; all are **NOT RUN**:

| File | Authored coverage |
| --- | --- |
| `thread_projection_test.rb` | Exact null/empty shapes, separate subject limits, Unicode body truncation, literal hostile text, JSONB text decoding, malformed shapes, maximum escaped message fit, overflow, timestamp precision/invalid dates, invalid source values |
| `thread_reads_test.rb` | Canonical fixtures, default limits/lookahead, bound values/no write SQL, last-included cursors, tamper and actor/org/context/version/mailbox/thread/filter/limit/resource scope rejection, authenticated malformed positions, both page byte caps, required/unknown query fields, unavailable resources |
| `thread_database_test.rb` | Real API/worker login expectations, source clipping, PostgreSQL keyset traversal with nulls/ties/microseconds, per-user unread filtering, unchanged business state on reads, private/foreign/missing/mismatched visibility, before/after-snapshot membership revocation, FORCE RLS and privilege denials, composite FK/JSON/count constraints, transactional down/reapply rollback |

The database tests reuse A's fixture helper and actual role URLs `BE02_ADMIN_DATABASE_URL`, `BE02_API_DATABASE_URL`, `BE02_WORKER_DATABASE_URL`; fixtures obtain session locks and authorization-generation guards before membership/visibility changes. Their privileged setup is separate from the production API reads. They use the real tenancy helper and assert read-only/repeatable-read transaction settings. B's revocation tests cover database snapshot visibility; root's session/HTTP tests must establish the complete auth precedence and response behavior.

Coordinator acceptance still required:

1. Run migrations and all three B suites in the existing isolated Docker environment, with A/foundation prerequisites and the pinned application dependencies. Include regression suites and contract assertions; no host-test substitute was used.
2. Run strict Steep/RBS, lint and Rails route/controller integration. Verify the shared connection signatures, error mapping, exact response bytes/headers, duplicate parameter rejection and request deadline/SQL timeout behavior across A/B.
3. Execute rollback using the migration runner as well as B's transactional SQL test. Run B down/reapply before any later dependent C/D migration, or roll those dependencies back first.
4. Run the required adversarial review and dedicated design reviewer against current standards. Each assignment must cover at most 200 lines; split `thread_database_test.rb` into bounded ranges. Record actual coverage, findings and defect density in coordinator-owned `code-reviews.md`. This worker did not run an independent adversarial review, so no zero-defect or defect-density claim is made.
5. Complete actual UI/backend integration and visual validation with the frontend owner before any publication. Reconcile README/state/documentation, and perform task-scoped Docker cleanup after root's execution.

No Docker resources, host services, credentials, external sends, publications, commits or paid sessions were created by this worker. Shared cursor/byte utilities and the observed routes now match B's integration calls; their runtime correctness and A's final integration remain acceptance dependencies.

## File inventory and hashes

Counts include blank and comment lines. Implementation/signatures total **540 lines**, tests **560 lines**, combined **1100 lines across 14 files**, excluding this report. SHA256 values below identify the handoff bytes; the report's own hash and physical line count are supplied separately with the completion message to avoid a self-referential hash.

| File | Lines | SHA256 |
| --- | ---: | --- |
| `apps/server/db/migrate/20261013000002_create_app_threads_messages.rb` | 18 | `d984dff0f27bba53360d6e22e221cb9558fe2598d7f23c26876f9b6eb5eb1cd1` |
| `apps/server/db/be02_threads/validation.sql` | 24 | `8ba289ff6897f462fc20c8d3ac0c05cdf71384732b5718ad4e693608bcd0bb46` |
| `apps/server/db/be02_threads/tables.sql` | 50 | `dce2ada3d0cc33aad99a02e5411dd3dc64fb55e6080449f280fe3451cb456a80` |
| `apps/server/db/be02_threads/policies.sql` | 51 | `55b0ddedfe1c180a51fa60713c9f47e684700a84b480231662a3eba19b374d8f` |
| `apps/server/db/be02_threads/down.sql` | 6 | `827709477f5665a755bf37115762d7924fa94721684c3b3b2b603b1362c33bfd` |
| `apps/server/lib/elevateo/thread_reads.rb` | 182 | `167c2a62dca3da4f0307fa609435d8251b168f1484dd47604b4111bcf42c53d6` |
| `apps/server/lib/elevateo/thread_projection.rb` | 112 | `3f8907387257095c17ecf2707490c542967acc0cf8d40e09e6fb1df4187f532c` |
| `apps/server/app/controllers/v1/threads_controller.rb` | 35 | `0d14ba6dd54647b61fa66661007d48467857cf00c308707fc8fdbc2876165531` |
| `apps/server/sig/thread_reads.rbs` | 38 | `447511e8a7cfb3b36bcfe3be3023941e96ee931e7e3f37c319f658b774245b6f` |
| `apps/server/sig/thread_projection.rbs` | 15 | `707cc13093437a0bba32f72a643f090f978f74590b65b04a0d7a68f8f5617528` |
| `apps/server/sig/threads_controller.rbs` | 9 | `81cab0e48f5f6debe0fcb1f61701c712b651788865873aaacac7b29f75b24eda` |
| `apps/server/test/be_02/thread_reads_test.rb` | 163 | `cdbb5d2dfeab35c656b5ecc2335e9f1213f1460534ff1507fff02a0c7095fba1` |
| `apps/server/test/be_02/thread_database_test.rb` | 286 | `bc1aa708a61056b7ca4efa51e8982f35cc3463a3d1a60becb08658f211cc9556` |
| `apps/server/test/be_02/thread_projection_test.rb` | 111 | `441e5afd14fb8dcff13396002d3e8aca077a01dd8907048bd98355f80bba8f79` |
