# ADV130 — Corin ingress oracle and protected-write typing

Exact source b8ef42677cf199d00306ad2360c7d4a9bb655d7e, fleet-02 /home/tanzeel/orca/workspaces/integration/completion-corin-mail819. Integration d6c69dc supplied, not independently reviewed. No tests/builds/Docker/live operations performed.

## Coverage and findings

341 unique versioned source LOC: current fake_inbound_controller.rb1–46; imap_ingress_test.rb1–87; lib/elevateo/inbound/imap_ingress.rb1–66; v1/write_controller.rb1–53; lib/elevateo/inbound/fake_ingress.rb1–65; parent diff context fake_inbound_controller.rb13–20 (8), imap_ingress_test.rb42–57 (16). Current diff overlap counted once. Each packet below180; assignment below350. Confirmed defects0; density0/341=0/KLOC.

Excluded MIME selection/attachment allowlist implementation beyond FakeIngress65, PostgresStore/RLS, SessionWrites internals, routes, scanner/storage implementation, typecheck and actual runtime. No claim of broader attachment acceptance or durable import correctness.

## Controller typing and authority

The guard lambda explicitly accepts input and query, matching protected_write's actual guard_users.call(input:, query:) invocation. Its object/hash annotations and yielded WriteStatements/SessionIdentity/object annotations agree with the reviewed parent seam. The body still accepts additional yielded keywords via **; annotations do not discard session/query/deadline behavior or cast away validation.

Test route requires both RAILS_ENV=test and explicit fake-inbound enablement before the protected boundary. Parent checks transport, bounded body, context, CSRF shape, guard-user UUIDs and authenticated cookie before SessionWrites transaction. Actor must equal authenticated identity, mailbox is UUID validated, and PostgresStore authorization must succeed for identity organization/mailbox. The source contains no new auth bypass. Effective session revocation, RLS and environment configuration remain runtime/dependency proof, not certified here. Simulated response label is retained.

## Corrected missing-storage oracle

ImapIngress parses/captures MIME before checking whether attachments need storage. When parsed attachments exist and attachment_storage is nil, it raises attachment_storage_unavailable before storage or durable insert. The new expected code matches this explicit production branch; changing unsupported_mime to the precise unavailable capability outcome does not make a failed import pass. The test still requires a rejection and no durable store calls. Raw MIME/identity bounds remain unchanged; this patch adds no production import behavior.

## Unsupported MIME with storage

The new test supplies a real non-nil recording storage double and unsupported application/x-executable MIME, requires unsupported_mime, and asserts both storage.staged and store.calls empty. This removes the confounding missing-storage condition: an incorrect early attachment_storage_unavailable no longer satisfies the test. The replacement needle matches the exact reviewed MIME constant. The detailed MIME allowlist parser was outside this bounded review; runtime must establish this fixture actually reaches its intended branch.

The retained supported PDF/storage test verifies bytes/key and metadata reach the two doubles. Its name says stages before atomic store call, but it does not independently record relative order or real DB atomicity; reviewed production method visibly stages before insert. Do not use that unit test as database, scan or cleanup proof.

## Design simulations / minimum completion gate

Supported attachment without storage: fail unavailable and persist nothing, allowing a retry after capability configuration rather than pretending clean acceptance. Unsupported attachment with storage present: reject before quarantine upload and persistence; new negative assertions distinguish that route. Storage failure before DB insertion should propagate without inserting; uploaded objects followed by DB failure require existing orphan/retry policy, which this patch neither changes nor proves. A forged actor or wrong mailbox remains blocked by the unchanged protected route checks before fake ingress.

Keeping truthful failure codes and explicit keyword annotations is the smallest maintainable correction. No new abstraction, dependencies, grants or extra hot-path query was introduced. Tests remain isolated unit doubles; source comments explain security boundary intent. Run exact ingress tests and static typing in Soren fleet Docker, with test-route denied-origin/CSRF/revoked/mailbox authorization coverage in the integrated snapshot. Actual DB role, storage/scanner behavior, cleanup and live-provider operation are not established by this static review.
