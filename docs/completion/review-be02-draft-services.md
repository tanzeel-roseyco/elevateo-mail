# BE-02 draft services: bounded adversarial review

Review date: 2026-10-13 Australia/Sydney. Source workspace: `C:/Users/Tanzeel/Code and projects/Elevateo Mail - BE02 Codex`.

Run `run_5cc7ae2ab900`; task `task_2b4e9cb55359`; dispatch `ctx_7d5580ab486b`; reviewer terminal `term_1ac10362-9b0e-45d0-8b75-e04a280898ee`.

**Result: zero confirmed defects observed in 303 unique physical code lines; observed defect density 0.00 defects/KLOC. Runtime: NOT_RUN.** This is a bounded static review, not proof that the feature works or authorization for application acceptance. Transaction, authorization, persistence, expiry and shared-validator implementations are outside the assigned source coverage.

<!-- AIDEV-NOTE: This report covers only the five hashed service files; dependency and runtime claims remain unverified. -->

## Authority and coverage

The full adversarial rubric supplied with this dispatch was applied. Context included project AGENTS instructions, current-state sections of README/state/documentation, `.planning/STANDARDS.md`, the implementation brief, C/D contract handoff, draft implementation handoff, and accepted BE-02 decisions, particularly D01/D05/D07. The protected-write and thread implementation handoffs supplied published dependency interfaces. Older A/B shapes or historical 412/HTML proposals do not override contract `1.0.0-collaboration.1`.

Contract handoff SHA-256: `2F37E8ECB60F40A17AB2E1F6EDBBDA64BF5F0312C38C55161F20F6ABDE87426E`.

Standards SHA-256: `7C01430086ED2DC263C8EDCB1B2A9F41B572A23A11B36C1179BE802E2874BD10`.

Counts and hashes were taken before source inspection and repeated afterwards with identical results. Physical LOC includes comments and blank lines. Each file was read in full in its assigned pass. AIDEV anchors were inspected. Source paths below are relative to `apps/server`.

| Pass | File | Reviewed range | Physical LOC | SHA-256 |
| --- | --- | --- | ---: | --- |
| 1 | `lib/elevateo/drafts/payload.rb` | 1-48 | 48 | `8AAF5B23DEE01BA32E6F43AAC299D366C7F62E8F2DBEEC975A23994A9C5FC310` |
| 1 | `lib/elevateo/drafts/database.rb` | 1-51 | 51 | `C7E7118385F86DA05CE8542941A692F2BA7E3BC323CBEF9A5DE112F0D39C143F` |
| 1 | `lib/elevateo/drafts/projection.rb` | 1-40 | 40 | `F8926DB020285695A7F38A271321F57BBA362C46FC7EAF9527B0439F023428CC` |
| 2 | `lib/elevateo/drafts.rb` | 1-78 | 78 | `B30E8E8F13A0A0DBB836E52BE8959D25CA00ABC885A567D2571ED9EE001C6C0C` |
| 2 | `lib/elevateo/draft_operations.rb` | 1-86 | 86 | `9FC8842E45AD69E20A81FD92E43E94DAD5A3527B15510F91187B39ACB6A925B7` |

| Pass | Unique physical LOC | Confirmed defects | Observed defects/KLOC |
| --- | ---: | ---: | ---: |
| 1: payload, database, projection | 139 | 0 | 0.00 |
| 2: reads and operation service | 164 | 0 | 0.00 |
| Combined, without double counting | 303 | 0 | 0.00 |

Both passes are below 200 lines; combined coverage is below 400. No unassigned dependency, controller, SQL, signature or test source was reviewed. Documentation and filename inventory are context, not additional reviewed application LOC.

## Findings

No concrete, reproducible defect was established within the assigned five files. Consequently there is no confirmed severity/location/fix/regression finding to enumerate. Zero observed defects must not be interpreted as zero possible defects, passing tests, or complete contract conformance.

### Cross-assignment authorization-order question, not a confirmed defect

Locations: `lib/elevateo/drafts/payload.rb:14-23` and `lib/elevateo/draft_operations.rb:19-21`. Payload construction performs expected-version/content validation before the operation service calls `app.save_draft`. The controller and SQL are unreviewed, so this review cannot establish whether current resource scope has already been authorized before Payload construction. The published boundary guarantees authentication/context before the business block, but does not by itself establish route-specific scope authorization before semantic validation.

Concrete case for the controller reviewer: a current authenticated caller with current context supplies an inaccessible mailbox/draft plus otherwise parseable content exceeding a semantic limit. Confirm the intended contract priority at this boundary: generic `404 not_available` for inaccessible resources versus `400 request_invalid` for semantic input. Transport or unreadable/oversized-body errors remain first. If the separate controller review establishes a scope-order violation, the minimal correction is to establish mailbox/draft authority inside the protected transaction before content semantics, while preserving bounded transport parsing and the SQL recheck. Add the combined inaccessible-resource/invalid-content regression, plus an authorized invalid-content control. This conditional recommendation is not a request to weaken transport checks or remove database reauthorization.

This question was sent promptly through Orca status `msg_a9c7277eea45`; `msg_e5934fb9cb73` corrected its initial illustrative status to **400**, matching the C/D vocabulary. No source expansion was used to resolve another assignment's controller coverage. Severity and defect accounting remain pending that evidence.

## Static review checklist

“Observed” below refers only to source inspection. “Delegated/unreviewed” is a dependency limitation, not a passing result.

| Area | Static observation | Remaining evidence |
| --- | --- | --- |
| Closed payload and empty values | Payload checks its seven exact keys, canonicalizes three IDs plus optional reply ID, uses integer bounds 0..2147483647, and permits empty subject/body/recipient list. Recipient entries require both exact keys and retain null versus empty members. | Upstream object/duplicate-key/type guarantees and primitive validator implementation are delegated/unreviewed. |
| Maxima and Unicode | Explicit limits are subject 998, body 65536, recipients 100, and each address member 256. No trimming, normalization, or HTML interpretation appears in these files. | UTF-8, unpaired-surrogate/NUL rejection and code-point length semantics are delegated to WriteInput/ThreadProjection; actual extrema tests NOT_RUN. |
| Canonical digest | `canonical_bytes` constructs the contract's ordered semantic array, recipient pairs in display-name/address order, excludes operation ID, and hashes generated JSON with SHA-256. It retains recipient order and null distinctions. | The pinned Ruby JSON generator's exact control escaping, raw slash/U+2028/U+2029 and UTF-8 output require the authored byte-level test execution; not runtime-proven here. |
| Parameterization and disclosure | All SQL parameters go through bound QueryAttributes. Reads include organization/actor/mailbox scope, and direct detail also includes draft ID. No body, recipient or digest is copied into error responses by these services. | Real roles, forced RLS, private ledger access and correct trusted identity/session inputs are unreviewed. |
| Full projection | Draft projection constructs the closed documented fields, requires a positive bounded version and editable/consumed state, retains nullable reply ID, and emits full subject/body/recipients for detail. | Shared source-JSON/address/text/UUID/timestamp validation behavior remains unreviewed. |
| Summary projection | SQL retains 257 subject code points; projection emits the first 256 and tests length greater than 256 for the flag. Body/recipients are omitted, both lifecycle states remain observable. | PostgreSQL and Ruby behavior on non-BMP extrema is not executed evidence. |
| Pagination and resource limits | Default/max page size is 50; query fetches limit+1, sorts descending by updated_at/id and uses a strict tuple continuation. Scope includes actor/org/context/authorization/mailbox/order/effective limit. Authorization precedes cursor decode. | Shared ReadResponse whole-entry shrinking, final-cursor selection, empty-page behavior and Cursors integrity/expiry are delegated/unreviewed. |
| Serialized byte budgets | Database.encode measures generated JSON bytes after escaping. Detail uses 2097152, summaries 262144, and save/lookup 4096. Lookup measures its complete envelope. | List envelope measurement is delegated to ReadResponse; transport's actual incoming 1048576-byte cap is outside this assignment. |
| Save result validation | Success is exactly draft_id/operation_id/version/state, IDs must equal the request, state must be editable, version positive and bounded. A success does not replace original metadata with today's draft. | SQL must supply the persisted original result and increment at most once. |
| Commit versus rollback | Terminal draft_conflict/draft_consumed/operation_mismatch return already serialized WriteResponse objects. Nonterminal allowed codes raise CollaborationError; invalid projections raise; serialization overflow is converted to internal_error before a response can return. | The transaction wrapper must commit terminal records and roll back raised failures or serializer errors; its implementation is unreviewed. Operation mismatch must leave records untouched in SQL. |
| Lookup shape and uncertainty | Exact field sets distinguish applied/conflict/unknown/expired; IDs must match requested binding. Unknown/expired expose base metadata only. Recorded conflicts remain outcomes inside the operation object, not fresh HTTP conflicts. | Durable original conflict data, original timestamps and no reexecution require SQL verification. |
| Expiry and reconciliation | The Ruby lookup passes through validated expired/unknown outcomes and does not invent replacement operation IDs or retry mutations. It never infers successful application from an unknown lookup. | Exactly 604800 seconds, equality at expiry, pre-compaction expiry, tombstones and replay-before-current-state checks are entirely delegated to SQL. |
| Revocation, auth priority and deadline | Read service access is documented as protected snapshot work; write service assumes the protected transaction. No independent cache, background I/O or retry appears here. | Session-before-generation-before-business locks, before/after-snapshot races, revoked 401 before stale 409, CSRF, deadline and scope-before-semantics require other assignments and runtime tests. |
| Complexity and performance | Small service/helper responsibilities reuse shared validators/projection/cursor/error facilities. Recipient processing is capped at 100; list projection at 51 rows. No per-recipient SQL or obvious N+1 loop appears. | Index choice/query plans and contention are SQL/runtime concerns, not measured here. |
| Comments, documentation and standards | AIDEV notes explain canonicalization, protected scope, projection reuse and commit semantics. The draft handoff documents routes, limits, dependencies, tests and outstanding acceptance. No new framework, transport, secret or independent domain backend appears in scope. | Strict RBS/Steep and lint are NOT_RUN; signatures are unreviewed. The dedicated design/Obsidian review remains separately assigned. |
| Test quality and failure cases | Six matching draft test files exist, and their documented intent includes happy paths plus validation, scope, conflict, rollback, expiry and concurrency failures. | Test bodies were not inspected: assertion quality, regression discrimination, coverage and results are UNREVIEWED/NOT_RUN. |

## Published interfaces relied upon, source unreviewed

| Dependency | Published responsibility used by this review |
| --- | --- |
| WriteInput and protected_write | Bounded transport parsing, exact object/query structures, duplicate rejection, UUID/integer/Unicode validators, current identity/context/CSRF and guarded transaction ownership. Request body/query values reach service entrypoints in the documented types. |
| protected_read / identity / session | One protected repeatable-read read-only snapshot, current actor/org authority and opaque context/authorization envelope. Revocation before the snapshot denies access; later revocation may leave one complete old response. |
| ThreadProjection | `text`, `integer`, `uuid`, `timestamp`, `address` and `source_json` validate shared scalar/address/database projections; invalid values fail closed. |
| ReadResponse / Cursors | Complete serialized page budgeting, whole-entry pagination, valid continuation cursor and signed scope-bound expiring tokens. |
| CollaborationError / WriteResponse / SessionWrites | Closed C/D statuses and safe current-request error envelope, pre-serialized successful or terminal-conflict return, exceptions/overflow rollback before commit. |
| app.draft_scope | Current compose capability plus actor/org/mailbox/draft authority, including absent versus foreign-owned draft handling. |
| app.save_draft | Session/generation/business guard order, current scope before ledger, immutable operation binding/digest, original replay before current reply/state/version, concurrent convergence, atomic draft and terminal record, version exhaustion and expired-ID rejection. |
| app.draft_operation / compaction | Current lookup authority, metadata-only original outcomes, exactly seven-day expiry independent of compaction, unknown uncertainty and permanent identity/digest tombstones. |

A service call to these interfaces is evidence of delegation, not evidence that the implementation fulfills the guarantee. No unassigned source was opened to silently expand review coverage.

## Executed evidence and coordinator verification

Executed: read-only file enumeration and metadata, physical line counts, SHA-256 inventories before/after inspection, AIDEV searches, document/source reads, test-filename existence checks, and Orca lifecycle/status commands. All five source hashes remained equal to their initial values. No source files were edited.

**NOT_RUN:** Ruby execution or serializer probes, application tests, unit/request/integration/concurrency tests, lint, type checking, SQL queries/migrations, Docker, SSH, frontend/client or visual checks. No agents, model calls, ultrareviews, commits, external posts or application services were started. No Docker resources were created, so this review has no task-owned Docker cleanup.

The implementation handoff identifies these suites, whose filenames were confirmed without inspecting their source:

| File under apps/server/test | Documented intended evidence, not verified results |
| --- | --- |
| `be_02/draft_payload_test.rb` | Exact canonical UTF-8/control escapes, UUID/integer equivalence, null/empty/order distinctions, empty and maximum inputs, invalid limits/types. |
| `be_02/draft_reads_test.rb` | Full/summary projections, cursor scoping, scope-before-cursor, metadata and terminal-response distinctions. |
| `be_02/draft_database_test.rb` | Replay after B/consumption/reply deletion, durable conflicts, expiry/tombstones, unknown, binding mismatch and version exhaustion. |
| `be_02/draft_authorization_test.rb` | Guard/RLS/direct-write denial, actor/capability boundaries and invalid database values. |
| `be_02/draft_concurrency_test.rb` | Identical operations, competing version-zero creation and guarded compose revocation. |
| `requests/drafts_test.rb` | Real controller serialization, terminal 409 commit, generic 404, received-byte limits, escaped maximum content and invalid-projection rollback. |

Coordinator follow-through: reconcile the authorization-order question with the controller reviewer; combine independent SQL/shared-boundary/test/design reviews without double-counting these 303 lines; execute the applicable Docker suites against real PostgreSQL roles; record actual acceptance evidence and this review's zero observed defects/0.00 defects per KLOC in coordinator-owned code-reviews.md. This worker changed only this assigned report.
