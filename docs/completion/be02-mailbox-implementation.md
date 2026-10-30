# BE-02A mailbox implementation handoff

Status: implementation, flat RBS signatures, and 28 test cases are written. Runtime verification is **NOT RUN**: this dispatch explicitly reserves Docker, application tests, and adversarial review for the coordinator. This document records implementation evidence, not a passing acceptance gate.

Task: task_dd56bdcc7a89. Dispatch: ctx_0123551bd23c. Contract: 1.0.0-session.1, with the exact OpenAPI hash below. The checkout was reused as instructed; no new project, agents, commits, model calls, Docker resources, SSH, provider actions, or live sends were created.

## Implemented behavior

- MailboxReads performs one bound SELECT through the supplied authorized connection. UUID ascending order and one visible lookahead row implement the default/max 50-item page; no count or privileged existence query exists.
- RLS remains authoritative. Actor and organization come only from the root-authenticated identity; context/version come only from the root-authorized Session response. The reader does not authenticate, change tenancy, touch a session, or mutate business rows.
- Membership capability metadata is read in the same snapshot. Missing metadata explicitly yields false for compose, approve_send, and manage_members; visible rows always expose read=true.
- Display strings preserve empty values, null display_address, non-email display text, UTF-8, and JSON escaping. Each non-null display string is checked against the canonical 256-character limit, without truncating legal values.
- Cursors use a five-minute expiry and domain-separated HMAC-SHA256. The signed scope digest binds actor, organization, context, authorization version, resource, filters, order, and limit. Authentication precedes bounded JSON parsing; invalid signatures, expiry, scope changes, malformed positions, and overlong tokens fail closed.
- ReadResponse materializes the exact response bytes once, including the continuation cursor and JSON escaping. It trims whole trailing items to 128 KiB for mailboxes, advances from the last included row, and raises if even one item cannot fit instead of emitting a repeating empty continuation.
- The shared response utility also supports 256 KiB thread lists and 2 MiB message pages with the messages array key. It validates serializable UTF-8 JSON values and reserves envelope pagination keys.

The deliberate tradeoff is a small shared cursor/serializer pair with resource-specific query and projection logic. The reader fetches at most limit+1 rows, and the serializer sums already-serialized fragments instead of copying the entire candidate response repeatedly. No new gem or generalized repository framework was introduced.

## Agreed integration interfaces

The coordinator accepted this ReadController block interface:

~~~ruby
protected_read(allowed_query: %w[cursor limit], budget: Elevateo::ReadResponse::MAILBOX_BYTES) do |connection:, identity:, session:, query:, deadline:|
  # Return an already serialized String.
end
~~~

The controller uses the equivalent keyword block with unused keywords captured anonymously. The wrapper owns authentication outside the transaction, context/version headers, duplicate and unknown query detection, deadlines, the REPEATABLE READ READ ONLY tenancy snapshot, session authorization, successful-materialization touch in a separate transaction, and rendering the returned bytes unchanged.

The controller obtains the signing key from read_config.cursor_signing_key. This is the root/Auth-owned typed configuration seam, agreed as domain-separated derivation from the session key; the new production files never read environment variables. MailboxReads::InvalidQuery maps to AuthError.invalid. Root owns mapping Cursors::Invalid to cursor_invalid/400 and ReadResponse errors to a safe server error.

DB worker ctx_de61578a102c confirmed mailbox display_name, nullable display_address, and the three boolean mailbox_memberships capability columns. The current migration supplies false defaults. Tests reuse its unchanged SessionDatabaseTestCase helper and session-before-authorization-generation fixture locking protocol.

The thread worker ctx_01fd63dfea02 received the Cursors and ReadResponse interfaces and the requirement to return serialized bytes unchanged.

## Test evidence and runtime status

| File | Test cases | Coverage | Execution |
| --- | ---: | --- | --- |
| cursors_test.rb | 7 | Roundtrip, nullable timestamp positions, every scope field, filter order, expiry/clock rollback, tampering/key rotation, malformed signed payloads, size and shape limits | NOT RUN |
| read_response_test.rb | 9 | Canonical fixtures, exact UTF-8/escaped byte count, lookahead/end, pagination progress, overflow, immutable inputs, JSON failures, maximal mailbox and message items | NOT RUN |
| mailbox_reads_test.rb | 12 | Seven query/projection tests and five actual-login database tests: canonical/empty/null data, bound SQL, false/current capabilities, private/foreign/revoked visibility, UUID seek, max 50, byte truncation, read-only snapshot and unchanged business rows | NOT RUN |

The fake connection tests are explicitly limited to query/projection behavior. RLS tests connect as the real elevateo_api role and assert both repeatable-read isolation and read-only mode; they do not use SET ROLE. Those assertions are authored but unexecuted.

Run these commands inside the coordinator's disposable server test container, from the server directory:

~~~sh
bundle exec ruby test/be_02/cursors_test.rb
bundle exec ruby test/be_02/read_response_test.rb
bundle exec ruby test/be_02/mailbox_reads_test.rb
~~~

The canonical fixtures and OpenAPI file must be available at the repository-relative paths used by the tests. With the current server-only image working directory /app, mount them read-only under /contracts/v1; alternatively preserve the complete checkout layout. The database suite requires the shared helper's BE02_ADMIN_DATABASE_URL, BE02_API_DATABASE_URL, and BE02_WORKER_DATABASE_URL with the expected actual logins, and the current migrations/bootstrap grants.

Syntax checks, lint, RBS validation, Steep, unit tests, database integration tests, HTTP integration tests, and visual QA are all **NOT RUN** by this worker. No disposable Docker resources were created, so task-owned Docker cleanup is not applicable.

## Coordinator work remaining

1. Finish and verify Auth/Config/ReadController/routes integration, including exact HTTP errors, header handling, duplicate query rejection, deadlines, and successful-session touch. These files are outside this worker's ownership.
2. Run the container test commands, existing relevant suites, lint, and strict RBS/Steep checks. The current Steep integration needs the JSON, Base64, OpenSSL, and ActiveRecord/framework signatures used by these files; this dependency was reported to root.
3. Verify actual responses against the canonical contract and count the bytes delivered by HTTP. Perform the project-level UI gate and adversarial review before any publishing.
4. Record the root-owned review evidence in code-reviews.md and synchronize README/state/documentation as part of the integration commit.

Suggested bounded review assignments: cursors implementation plus its RBS (145 lines); ReadResponse plus its RBS (100); MailboxReads/controller plus their RBS (162); cursor tests (98); response tests (126); mailbox tests split before the RLS class into assignments below 200 lines. A dedicated design reviewer should assess authority ownership, snapshot boundaries, and the byte-budget/progress tradeoff.

No adversarial agents ran in this dispatch. Review defect count and defect density are **not measured**, not zero; root owns the review and code-reviews.md updates.

## Changed file inventory and hashes

There are 11 implementation/signature/test files totaling 894 physical lines: 333 implementation, 74 RBS, and 487 test lines. This handoff report is the twelfth changed file and is excluded from those code counts. All source changes stay within the dispatched exclusive paths.

Paths below are relative to apps/server.

| File | Lines | SHA256 |
| --- | ---: | --- |
| lib/elevateo/cursors.rb | 120 | bf752da8421ac12db52a9fce37ca8752b4cc376b5efdf6c3dddbb2fb9e13efeb |
| lib/elevateo/read_response.rb | 83 | 8659884bcf6321ce8a4ebf320c7bc8a6c45d874e17ed017a22d38b437e4e2915 |
| lib/elevateo/mailbox_reads.rb | 111 | f4b5750eee3be8a6ab66842445a3fc34d41f2f1935497946d89db162befc5e1e |
| app/controllers/v1/mailboxes_controller.rb | 19 | 8e7a5ca8f95c157105af540268af89844f2adda8166ef82d72390d9dfbc5cf8f |
| sig/cursors.rbs | 25 | cb58e92e6a4d9bf873daa35e5188a06027cf256302c87d937b62b2ba1a7da716 |
| sig/read_response.rbs | 17 | e05a4addaab4645cc7518f91230b036117ac9ead03675ed6ccaba6bebf53c7c3 |
| sig/mailbox_reads.rbs | 27 | f8ebf6d205db00f7b450c9d2f748927275c431272ba50c74d202834d9b11a7eb |
| sig/mailboxes_controller.rbs | 5 | 80585b58ec510a7f2dc83cf021fbcb4f2171c5ec2e8b9d985986ae993571d14c |
| test/be_02/cursors_test.rb | 98 | 792817e3ac84cd31828f3c449501559c5e39e62b6c8e88a90fa4fefeecf7e141 |
| test/be_02/read_response_test.rb | 126 | 43850d9a584a39c8428e5a1c32219ed307249aa36f65015705e2b87beb3d0da7 |
| test/be_02/mailbox_reads_test.rb | 263 | ee191c526d9155f2f48b43770cbf4bb16d932b74d1c54b2afae91c0835da3992 |

## Read-only source evidence

| Source | SHA256 |
| --- | --- |
| contracts/v1/openapi.json | f6524b78e870d9af7e6b8c38bda9a327c3d05c8e2c974ef450db489d31c2a7e4 |
| contracts/v1/fixtures.json | ad33209fa8a4eb4ee0fcb7dc51249935023fdaf6b3ec45a876fb51271cd5133f |
| docs/completion/be02-implementation-brief.md | 3dd5a83272b9e9e3278c4f05452b81bb93555537e618736d324a95858173abd8 |
| .planning/consultations/results/be-02/decisions.md | 173f9088cb548076a5a8d04ce87573f000338789744e92567bd7fa915de680f9 |
| .planning/STANDARDS.md | 7c01430086ed2dc263c8edcb1b2a9f41b572a23a11b36c1179be802e2874bd10 |
| docs/decisions/0002-local-architecture.md | 5a9c7bd24bb35f8a19f78925ea25786ec77e632622535ea3da184da03eef223b |
| apps/server/test/be_02/database_test_helper.rb | 810d6a615c91bff9c3cefd2d71338d030dc548a45cee4fc29ea687ede215d369 |
| apps/server/db/migrate/20261013000001_create_private_sessions.rb | 14c480c927b70749e4f002fcdb1f133c29e0cd3832d6934d1b83f7ef25bdf3bd |

The migration hash records the observed dependency; this worker did not modify or execute it.
