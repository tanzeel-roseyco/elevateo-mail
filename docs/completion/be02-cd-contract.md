# BE-02 C/D canonical contract handoff

<!-- AIDEV-NOTE: C/D extends the frozen A/B wire contract; generated types and runtime acceptance belong to integration. -->

## 1. Authority, scope and preservation

This is the bounded continuation authorized by [the implementation brief](be02-implementation-brief.md) and [BE02-D01/D05/D07/D08](../../.planning/consultations/results/be-02/decisions.md), under [STANDARDS](../../.planning/STANDARDS.md). It records concrete wire choices within those decisions, without a new opinion/approval gate. Canonical version is `1.0.0-collaboration.1`.

Only `contracts/v1/openapi.json`, `contracts/v1/fixtures.json` and this document are owned by this dispatch. All 13 existing A/B paths and all 25 existing schemas retain their literal JSON values and semantics; the original reads, Address, Error and lifecycle fixtures remain unchanged. Only version values and additions change. The inherited A/session title, description and stage marker remain untouched; this document describes the added C/D stage.

**Rationale and edge cases:** preserve consumer compatibility while adding nine paths, 13 operations, 28 schemas, seven reusable parameters and seven error responses. No application handler, database migration, generated type, lock file, transport, send/consume action, dependency or deployment is supplied. `consumed` is a reserved observable state, not permission to implement BE-03.

## 2. Shared authorization and deterministic errors

Every new operation inherits the existing session-cookie security and requires `X-Session-Context` and `X-Authorization-Version`. Every PUT/POST/DELETE additionally requires exact configured `Origin` and the current session `X-CSRF-Token`; a lifecycle challenge cannot substitute. Headers are consistency/proof inputs, never actor/organization/capability grants. Reuse A's identity authority.

Evaluate bounded transport/JSON syntax first, then local authentication, current upstream identity/session policy, context, resource authority and route semantics. A locally revoked/expired/invalid session returns 401 before a stale-context 409. A valid but stale context returns 409 before cursor/business checks. With current context, absent/foreign/inaccessible resources, wrong mailbox relations, missing required capability and ineligible targets all return the same generic 404 before disclosing versions or existing content. Missing/malformed headers and invalid write proofs are 400; a present well-formed stale context is 409. These priorities describe otherwise valid requests, not a promise to authenticate an unreadable/oversized body.

| Status | Exact C/D code(s) | Meaning |
| --- | --- | --- |
| 400 | request_invalid, cursor_invalid | Boundary/proof error, or invalid/expired/mismatched cursor. |
| 401 | unauthenticated | Missing/invalid/revoked/expired session; never hidden as a conflict. |
| 404 | not_available | Message exactly `This item is unavailable.`; no existence distinctions. |
| 409 | context_changed | Valid session with stale context/generation. |
| 409 | draft_conflict, operation_mismatch, draft_consumed | Draft version, operation identity or terminal state; notes also use operation_mismatch. |
| 409 | assignment_conflict, membership_conflict | Stale assignment/mailbox membership revision; membership also protects the last manager. |
| 429 | rate_limited | Bounded retryable refusal, not proof about a previous write. |
| 503 | temporarily_unavailable | Dependency/deadline/lock failure or version exhaustion. |
| 500 | internal_error | Generic unexpected failure. |

`CollaborationError` is closed: `code,message,request_id`, with message <=256 code points, request_id 1..128 and serialized response <=4096 bytes. It adds codes without widening original `Error`. No subject, body, recipient, payload digest or foreign identity in errors. Each error gets the current request ID; replay preserves the original business outcome, not an old HTTP request ID. Optional Retry-After is an integer 1..300 seconds on 429/503; neither response claims that an earlier request did not commit.

All JSON responses use `Cache-Control: no-store`, `Vary: Cookie`, `X-Content-Type-Options: nosniff`. The request budget remains ten seconds, including Auth, transaction and serialization. Protected C/D writes follow the adopted [D05 write-only amendment](../../.planning/consultations/results/be-02/decisions.md#be02-d05-coherent-reads-context-and-revocation) and [deadline decision](be02-write-deadline-decision.md): observed expiry suppresses protected output, but driver/connection calls, cleanup and COMMIT processing prevent an absolute return-time or rollback guarantee. Uncertainty preserves the original operation identity and unsaved work for authorized reconciliation. This amendment does not certify protected-read timing. Auth HTTP is outside application transactions. Protected reads use one `REPEATABLE READ READ ONLY` snapshot; an after-snapshot revocation may leave one complete old response in flight, never mixed authority. Writes lock session, sorted affected authorization-generation guards, then business rows; membership changes use those same guards and atomically bump generations. No direct API membership-table write bypass.

**Rationale and edge cases:** errors do not become a cross-tenant oracle or a second outcome channel. Clients discard superseded successes and errors, bootstrap once on current context mismatch, and preserve the unsaved draft plus operation ID on uncertainty.

## 3. Closed inputs, lengths and pagination

All new object inputs and outputs have `additionalProperties:false` and all declared fields required, except explicitly optional query parameters. Nullable fields must be supplied as null when empty. Reuse canonical UUID `Id` and nullable `Address` unchanged. Parse UUIDs into the same value and emit/bind lowercase hyphenated form; a request cannot supply actor_id or organization_id.

Reject duplicate JSON keys at every depth before the framework collapses them. Reject unknown or repeated decoded query keys, including equal repeated values, percent-encoded aliases and bracket/array variants. Decode a query component once; an invalid percent escape is invalid input. GET and DELETE have no request body. PUT/POST accept only application/json UTF-8, allowing a UTF-8 charset parameter and no non-identity Content-Encoding. Count actual received bytes even when Content-Length is absent. Invalid UTF-8, unpaired surrogates and U+0000 are rejected in all input strings. Other valid scalar values remain exact plaintext.

String limits count Unicode code points, not UTF-16 code units or UTF-8 bytes. JSON mathematical integers within the specified range are accepted; string coercion is not. Query limits/revisions use canonical unsigned decimal syntax (`0` or nonzero leading digit followed by digits), then range checks; no signs, leading zeroes, fractions, exponent, array or whitespace coercion. `ResourceVersion` ranges 0..2147483647; a changing operation at the maximum returns 503 before mutation. A true no-op does not need another version.

| Operation | Request maximum | Success maximum |
| --- | ---: | ---: |
| Draft PUT | 1048576 bytes (1 MiB) | 4096 bytes |
| Complete draft GET | No body | 2097152 bytes (2 MiB) |
| Draft summary / note list / search GET | No body | 262144 bytes (256 KiB) |
| Operation lookup / assignment GET | No body | 4096 bytes |
| Read-state / assignment / membership PUT | 8192 bytes | 4096 bytes |
| Note POST | 65536 bytes | 65536 bytes |
| Membership list GET | No body | 131072 bytes |
| Membership DELETE | No body | 4096 bytes |

Byte caps include the complete actual UTF-8 serialized JSON envelope after escaping, before optional response compression. Return whole list entries and reduce page size to fit. Never truncate JSON, silently skip rows, or return an empty nonterminal loop. A valid single entry fits its route budget; an implementation that cannot fit it fails boundedly rather than claiming an empty success.

Every new list uses optional `limit` 1..50 (default 50) and optional `cursor` 1..2048 characters. Cursors are signed and expire; reuse A's cursor format and lifetime. Bind actor, organization, session context, generation, route, resource IDs, exact filter, order and effective limit; membership lists additionally bind their mailbox revision. Invalid/expired/mismatched cursors give 400 cursor_invalid after current authentication/context/scope. Return cursor from the last included row only when further matching rows exist; otherwise null. No offsets/totals. Each page has a coherent snapshot, not a persistent multi-page snapshot: mutable draft/search ordering can cause repeats/moves between requests, so clients deduplicate by ID and refetch.

**Rationale and edge cases:** separate code-point and serialized-byte limits prevent non-BMP and JSON-escaping undercounts. Shared A cursor utilities remain the implementation boundary; this amendment does not redefine A reads.

## 4. C: durable drafts and exact read shapes

| Route | Required query/body | Result |
| --- | --- | --- |
| PUT /v1/drafts/{draft_id} | DraftSaveInput | 200 DraftSaveResult |
| GET /v1/drafts/{draft_id} | mailbox_id | 200 DraftResponse |
| GET /v1/drafts | mailbox_id; optional limit,cursor | 200 DraftPage |
| GET /v1/draft-operations/{operation_id} | mailbox_id,draft_id | 200 DraftOperationResponse |

All four require current compose permission and actor-owned organization/mailbox scope. Shared mailbox readability does not expose another author's drafts. A missing draft on direct GET is 404; an absent draft during a valid version-zero create is expected. An existing foreign-author UUID remains 404.

DraftSaveInput is exactly `mailbox_id,operation_id,expected_version,subject,to,body_text,reply_to_thread_id`. Subject <=998 code points, to <=100 canonical Address entries, body_text <=65536; empty subject/body/to and incomplete nullable Address values are valid unsent content. Complete replacement, never patch/merge. Version zero creates stored version one; every fresh successful save increments once, even when values happen to match. Positive expected_version must equal the stored version. For a new operation, a non-null reply must identify a currently readable thread in the same mailbox. There are no attachment or sending inputs.

DraftSaveResult is exactly `draft_id,operation_id,version,state:"editable"`. It describes the original applied operation, not necessarily today's draft. DraftResponse is `context_id,authorization_version,draft`; Draft is exactly `id,mailbox_id,subject,to,body_text,reply_to_thread_id,version,state,created_at,updated_at`. Full content is untruncated; state is editable or consumed; version >=1, timestamps UTC.

DraftPage is `context_id,authorization_version,mailbox_id,next_cursor,items`. Each DraftSummary contains `id,mailbox_id,subject,subject_truncated,reply_to_thread_id,version,state,updated_at`. Subject is the first 256 code points with a truthful truncation boolean. No body or recipients. Include both own editable and consumed drafts, ordered `updated_at DESC,id DESC`; consumed filtering is not an extra feature. Timestamps and versions are server-owned.

**Rationale and edge cases:** actor ownership avoids shared-mailbox draft disclosure; summaries keep bounded paging separate from full editing content. The consumed fixture only fixes the reserved wire shape and does not prescribe a future BE-03 consumption version increment.

## 5. C: operation identity, canonical digest and reconciliation

Ledger uniqueness is `(actor_id,organization_id,operation_id)`, independent of mailbox/draft. Persist binding, SHA-256 canonical payload digest, expected/result or conflict version metadata, original outcome and timestamps in the same transaction as the save. Terminal version/state conflicts also get a bounded durable record without a draft mutation. Syntax/auth/context/scope failures and operation_mismatch do not create or replace terminal records.

After current authorization and draft ownership/binding checks, inspect the ledger **before** current draft version/state or new reply-target validation. An identical applied retry returns its original DraftSaveResult even after save B, later reply removal or consumed state. An identical recorded conflict returns its original 409 code and unchanged version metadata through lookup. Different binding/digest gives 409 operation_mismatch without overwriting the record. With no ledger record, validate reply scope, then consumed state (409 draft_consumed), then expected version (409 draft_conflict), then save. Lock/uniqueness convergence must prevent two increments for concurrent copies.

Canonical digest bytes are UTF-8 encoding of the following ordered JSON array, without whitespace:

```text
[mailbox_id,draft_id,expected_version,subject,[[display_name,address],...],body_text,reply_to_thread_id]
```

IDs are lowercase canonical UUIDs; expected_version is minimal unsigned decimal. Serialize null as null, preserve recipient order and distinguish null from empty string. Strings escape quote and backslash; use the short escapes for backspace, form feed, LF, CR and tab, and lowercase `\u00xx` for remaining U+0001..U+001F. Emit all other Unicode scalar values directly as UTF-8, including slash and U+2028/U+2029. No Unicode normalization, trimming, newline normalization or object-key-order dependency. SHA-256 is stored as 32 bytes or equivalent lowercase 64-character hex. operation_id is the ledger key, not part of the digest; actor/org are the key scope. Hash the validated semantic array, never raw JSON bytes.

DraftOperationResponse is `context_id,authorization_version,operation`. Every operation variant includes `operation_id,mailbox_id,draft_id,outcome`:

| outcome | Additional exact fields |
| --- | --- |
| applied | expected_version,version,state (always original editable),recorded_at,detail_expires_at |
| conflict | code (draft_conflict or draft_consumed),expected_version,current_version,state,recorded_at,detail_expires_at |
| expired | None |
| unknown | None |

A conflict's current_version/state describe its original decision; absent draft is version 0/state null, otherwise version >=1 and editable/consumed. Outcomes contain metadata only, never subject/body/recipients/digest. The lookup is only for the current actor/org key; rows belonging to other actors are not consulted. A known own record with a different requested mailbox/draft binding gives generic 404. Existing foreign drafts give 404; an authorized absent/unclaimed draft may yield unknown while creation is in flight.

Detail lasts exactly 604800 seconds from the first stored terminal recorded_at; retries do not extend it. At `now >= detail_expires_at`, lookup returns expired even if physical compaction has not yet run. Compaction retains actor/org/operation identity, mailbox/draft binding and digest as a minimal permanent tombstone; no BE-02 purge. It drops original detailed versions/outcome. Any reused expired ID returns 409 operation_mismatch, including an otherwise identical save. That code means the ID is unusable; clients may lookup to distinguish expired. An expired record must never be reexecuted.

**Rationale and edge cases:** an explicit expired variant plus permanent identity preserves replay safety without indefinite detailed history or a new error code. Unknown only means no visible record at snapshot time, never not-performed. A lost response preserves the buffer/ID and prompts reconciliation; do not invent a replacement operation, overwrite later content, or automatically send. Any later rebased save needs deliberate new intent and a fresh operation ID.

## 6. D: explicit read state and versioned assignment

PUT `/v1/threads/{thread_id}/read-state` accepts exactly `mailbox_id,read`. Any current reader sets only their own boolean; no caller actor field. ThreadReadState returns `context_id,authorization_version,thread_id,mailbox_id,read,read_state_version,updated_at`. Missing state is false/0/null. A differing desired boolean increments once and timestamps the change; repeating the same desired boolean preserves version/time, including initial false. Concurrent differing writes serialize; last committed desired state wins. This is state idempotency, not replay of an original historical operation. Existing B unread is exactly the inverse for that actor, and GET never writes. New inbound-mail behavior remains outside this slice.

GET `/v1/threads/{thread_id}/assignment?mailbox_id=...` returns ThreadAssignment. PUT on the same path accepts exactly `mailbox_id,assignee_id,expected_assignment_version`. Response fields are `context_id,authorization_version,thread_id,mailbox_id,assignee_id,assignment_version,updated_at`. Initial unassigned is null/0/null. Any current reader may assign or clear; non-null target must currently belong to the organization and read the mailbox, including shared readers. Target ineligibility is generic 404 before a version conflict. Recheck actor and target through sorted generation guards.

A stale expected_assignment_version gives 409 assignment_conflict even if the desired value currently matches. With matching version, same value is a no-op; changing or clearing increments once. Historical assignee UUIDs after later revocation remain attribution, confer no permission and do not expose profile fields. Every subsequent non-null assignment revalidates eligibility; no automatic reassignment side feature.

**Rationale and edge cases:** read/unread has a minimal explicit desired-state API; assignment needs optimistic conflict detection because replacing another person's assignment is materially different. Read-state has no expected-version field or new GET; existing B reads remain its ordinary observation path.

## 7. D: immutable plaintext notes

GET/POST `/v1/threads/{thread_id}/notes` require current reader access. GET requires mailbox_id, optional limit/cursor, and returns `context_id,authorization_version,thread_id,mailbox_id,next_cursor,items`, ordered `created_at ASC,id ASC`. POST accepts exactly `mailbox_id,note_id,body_text`; body is 1..4096 code points, preserved exactly (whitespace is valid). No HTML/Markdown evaluation, autolinks or remote resource loads.

Note is exactly `id,author_id,body_text,version,created_at`, with immutable version 1. POST returns `context_id,authorization_version,thread_id,mailbox_id,note`: 201 for first creation, 200 for same actor/mailbox/thread/note ID/exact body retry. note_id is unique within organization; concurrent identical requests create one row. Reuse of an own currently visible ID with changed content/binding gives 409 operation_mismatch; other-author/hidden IDs give generic 404. Current authorization precedes replay. Historical author UUID is attribution only. No note edit/delete/notification endpoint.

**Rationale and edge cases:** caller-generated immutable IDs give lost-response safety without a second operation ledger or speculative editing workflow. A POST timeout is not evidence that the note was absent.

## 8. D: guarded explicit mailbox membership

GET `/v1/mailboxes/{mailbox_id}/members`, PUT/DELETE `/v1/mailboxes/{mailbox_id}/members/{user_id}` all require current manage_members. The target must be a current member of the selected organization; otherwise generic 404. No user lookup/provisioning is implicit.

MembershipCapabilities has exactly `compose,approve_send,manage_members` booleans. An explicit active row grants read; PUT cannot supply read/role/actor. Shared mailboxes may grant read without an explicit row. GET lists only explicit current-org members, each `user_id,capabilities`, ordered user_id ASC. Page fields are `context_id,authorization_version,mailbox_id,membership_version,next_cursor,items`; no names/emails/effective-reader directory.

membership_version is a **mailbox-wide** monotonic revision, not per-target revision. PUT body is exactly `expected_membership_version,capabilities`, replacing all three flags. DELETE has no body and requires the single query expected_membership_version. Stale revision gives 409 membership_conflict. With a matching revision, unchanged flags or deletion of an absent explicit row are no-ops. Inserting/removing a row or changing flags increments once, even when shared read already existed. Every stored change also bumps affected user/org authorization generations through D05 guarded routines; never recycle generation on removal/re-add. Visibility changes elsewhere still invalidate all affected shared readers.

Never demote/delete the last explicit manage_members=true member who currently belongs to the organization; return 409 membership_conflict. Serialize the count/check/change under the same mailbox business guard/revision, with actor/target generation guards acquired first, so two managers cannot both leave. Provisioning an initial manager is separately controlled bootstrap work; this route does not infer an administrator.

Success is `context_id,authorization_version,mailbox_id,user_id,membership_version,member`, where member is the complete MailboxMember or null after removal. A matching absent DELETE returns null at unchanged revision. This does not promise removal of shared read. Return the actor's post-write generation; self-demotion can change it. A current successful response with changed generation tells the client to clear protected caches and bootstrap, not to reuse the old authority. A late superseded response never restores access.

**Rationale and edge cases:** mailbox-wide revision is the minimal single consistency boundary for a roster and its last-manager invariant. Even an unrelated member edit invalidates a membership-page cursor through its revision binding. User-org generation remains the independent authorization boundary.

## 9. D: scoped plaintext search

GET `/v1/search` requires q, optional mailbox_id/limit/cursor. q is 1..256 code points and cannot consist solely of Unicode White_Space (U+0009..000D, U+0020, U+0085, U+00A0, U+1680, U+2000..200A, U+2028, U+2029, U+202F, U+205F, U+3000). Preserve every otherwise valid character; no trim or normalization.

Use parameterized PostgreSQL literal case-insensitive substring matching under the pinned database collation: escape %, _ and backslash so caller values are not wildcard/SQL/regex/tsquery syntax. Search authorized thread subject and authorized message body/sender/to names and addresses; exclude drafts/notes. Null fields contribute no match. Return a thread once when any searchable field matches. An explicitly inaccessible mailbox is generic 404; absent mailbox filter means all currently readable mailboxes.

SearchPage is exactly `context_id,authorization_version,q,mailbox_id,next_cursor,items`, with mailbox_id null for all authorized mailboxes. Items are the unchanged ThreadSummary; preview is the canonical B preview, not a new matching body excerpt. Order `last_message_at DESC NULLS LAST,id DESC`, max50/256KiB, no ranking/counts/highlights/HTML. The cursor binds the exact q and optional mailbox; different filters cannot reuse it.

**Rationale and edge cases:** use one existing database query rather than a search service. Parameterization and escaping are both necessary for literal semantics. Any added index needs representative EXPLAIN evidence from the integration owner; this contract is not a performance measurement.

## 10. Fixtures, static verification and remaining acceptance

Additions in fixtures.json are 41 response examples, eight request examples, 36 structured conformance scenarios and eight deterministic boundary recipes, plus a separate synthetic C/D authorization setup and exact status/code map. Existing 17 read examples, three lifecycle examples, 10 read scenarios and 17 lifecycle scenario strings stay intact. Total concrete schema-backed fixture values: 69 (20 existing +49 new). Total scenarios: 63; boundary recipes are eight additional descriptions, not executed tests. Cursors, timestamps, identities and tokens are synthetic, never production credentials or authorization grants.

New schemas: ResourceVersion, CollaborationError, DraftSaveInput, DraftSaveResult, Draft, DraftResponse, DraftSummary, DraftPage, DraftOperationApplied, DraftOperationConflict, DraftOperationExpired, DraftOperationUnknown, DraftOperation, DraftOperationResponse, ThreadReadStateInput, ThreadReadState, ThreadAssignmentInput, ThreadAssignment, ThreadNoteInput, ThreadNote, ThreadNoteResponse, ThreadNotePage, MembershipCapabilities, MailboxMember, MailboxMemberInput, MailboxMemberPage, MailboxMembershipResult, SearchPage. Final OpenAPI inventory: 22 paths, 26 operations, 53 schemas.

Static verification covers JSON parsing, internal references, operation ID uniqueness, schema-backed concrete fixtures, and exact preservation of original path/schema/fixture values. File SHA-256 hashes are sent with the dispatch result. This is static contract verification only. Lint, generated consumer types, application typechecks, unit/integration/concurrency/serializer tests, Docker, Auth/database execution, browser and visual checks: **NOT_RUN by this worker**, explicitly reserved for the coordinator. No agent/opinion/model call, commit/push, live send, purchase or Docker resource was made.

Remaining integration work is to regenerate contract-lock/consumer types, implement C/D through the assigned owners, and execute the published scenarios/boundary recipes in Docker with actual serializers and deterministic concurrency barriers. The pre-existing read/lifecycle generator and fixture harness must explicitly ingest cd_requests and cd_examples; additive fixture namespaces must not silently be skipped. Runtime collation, cursor-lifetime reuse, snapshot/guard behavior and all byte maxima remain unverified until those checks pass. No unresolved wire-shape choice blocks that handoff; this document makes the small contract choices explicit rather than claiming implementation completion.
