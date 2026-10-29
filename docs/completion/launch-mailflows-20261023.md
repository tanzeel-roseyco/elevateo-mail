# Application mail flows — 2026-10-23

Status: scoped real application mail-chain and review-repair runtime PASS in x. Original report belongs to task `task_edc0933ad433`, dispatch
`ctx_caee7a03be3d`; no production, external-mail, UI or whole-application acceptance is claimed.

## Scope and implementation

Repaired the dedicated real-Mox SMTP/IMAP acceptance fixture that previously executed
zero Ruby cases. It provisions synthetic accounts, runs the production Ruby adapters
inside Mox's network namespace with `--network none`, and records primary failures
separately from cleanup errors. Fixture processes, Docker resources and private
credentials are task-owned; all runtime execution is fleet-02 Docker under the cooperative lock.

Application changes preserve a validated imported RFC Message-ID through protected
IMAP receipt persistence and a mailbox-scoped draft binding. Immutable snapshot v3
retains fourteen slots and binds thread UUID plus RFC reply identity in slot nine.
The SMTP projection emits In-Reply-To/References using the RFC identity while the
sender continues to come from the approved original mailbox. Mox replies without
an imported identity fail readiness. Existing snapshots and recipient/budget indices remain supported.

Migration 20261023000043 is reserved for this work; 42 belongs to verified enrollment.
No canonical API contract, public message projection, Sent or permanent-delete flow
was changed. The root-assigned UI lane currently merges authorized per-mailbox pages;
it adds no organization-wide server thread-list endpoint.

## Runtime evidence

Evidence is under the isolated fleet source directory
`/tmp/launch-mailflows-20261023/source/ops/local/`.

| Attempt | Actual result | Cleanup |
| --- | --- | --- |
| a–d | Fixture setup failed; zero Ruby cases | Passed |
| e | 3 cases, 4 assertions, 2 failures, 1 error; stale deadline 15 exceeded production maximum 10 | Passed |
| f | Targeted units: 33 cases, 214 assertions, one auth callback-test failure; protocol not reached | Passed |
| g | Real Mox protocol: 3 cases, 151 assertions, zero failures/errors/skips; later targeted units hit the same callback-test failure | Passed |
| h | Real Mox protocol passed again; fresh DB migration stopped at existing CreatePrivateSessions because fixture omitted baseline Auth startup/grants | Passed |
| i | Shared units passed 33 cases/215 assertions; Steep failed six diagnostics in two files before database stage | Passed |
| j | Shared units passed 55 cases/392 assertions; fresh migrations through 43 and identity/IMAP tests passed 8 cases/49 assertions; Steep and incorrectly broad lint failed | Passed |
| k | Units55/392 and identity/IMAP/reply DB10/67 passed; targeted lint17 files passed; own one Steep diagnostic plus four unrelated organization-role diagnostics | Passed |
| l | Units55/392, DB26/182, targeted lint17 files passed; own typing clean, four organization-role diagnostics remain; protocol4 cases276 assertions0 failures1 error: invalid_imap_batch during reply setup retrieval | Passed |
| m | DB26/182 and shared units/lint passed; real protocol4 cases276 assertions1 error; structural evidence: requested BODY plus unsolicited FLAGS yielded two FETCH rows | Passed |
| n | UID-bound BODY/deadline and shared units75/505, DB26/182, lint20 passed; four unrelated strict-type diagnostics remain; protocol4/423 errored because Mail parsing had no writable temporary directory | Passed |
| o | Units75/505 and lint20 passed; migrations completed, but DB test container creation failed because task server image had disappeared; protocol not reached | Passed |

The g fixture records `fixture-cleanup-errors.json` as an empty list. Exact logs and
source manifests are preserved in each attempt directory. Protocol evidence proves
adapter submission/retrieval only: application HTTP route → SMTP → IMAP → persisted
import → unified inbox → dynamic reply remains unproved. No live database was used.

## Bounded adversarial review

Root dispatches reviewers; this worker has not launched nested agents. Functional
review of the original fleet harness covered 109 LOC and found one medium cleanup
defect (9.17 defects/KLOC). Functional review of the earlier protocol helper covered
80 LOC and found one medium cleanup defect (12.50/KLOC). A dedicated design review
covered 70 LOC and found one low setup-cleanup defect (14.29/KLOC). These scopes
overlap and must not be added as unique coverage.

Repairs preserve the primary exception, isolate cleanup stages and track ownership
before deleting a private directory; independent re-review is pending. Product RFC
SQL/Ruby packets and a dedicated snapshot design review have been requested from
root, with each assignment limited to 200 LOC. Source review is not runtime acceptance.

Design tradeoff: retaining fourteen snapshot slots avoids changing recipient-budget
consumers, at the cost of a version-specific reply slot and explicit normalization
through the existing validator. This needs independent review and SQL regressions.
No Obsidian connector is available in this worker; no vault simulation or synchronization is claimed.

## Outstanding acceptance

- Root authorized a pinned prerequisite pull/build and task-internal app proof in `msg_795687144c68`; the full common flock now covers build, tests and exact cleanup.
- Every runtime consumer now uses the immutable image ID captured immediately after building; o's image-loss cause remains unproved.
- Fresh migration, imported identity/replay/lease, immutable reply snapshot, tenant/mailbox denial and protected approval/worker authority passed in l (26 cases/182 assertions).
- The four historical typing diagnostics are resolved in the captured q/r source: 78 units/521 assertions, strict typing and targeted lint pass. The final real application chain and repair regressions passed in x.
- PASS w: actual Auth/HTTP inbox route reads the persisted real Mox import; browser acceptance belongs to the UI lane.
- PASS w: actual HTTP actor creates/saves the reply; guarded SQL approval and production worker deliver original-mailbox From and RFC In-Reply-To/References.
- Verify 120-address inventory, 30/day per-mailbox cap and disabled warmup with the owning controls lane.
- Complete bounded functional/design review and record exact final hashes and defect density.

No commit or central documentation update was made by this worker.

## Continued actual app-chain execution: p through r

All attempts use the fleet Docker common flock from admission through cleanup. The
immutable Ruby prerequisite reference was absent in p, which failed before building
or application tests. Root authorized restoring that exact pinned prerequisite;
existing shared images and unrelated workloads were preserved. An earlier message
mistakenly inferred an empty image store from a quoted formatting command; an
unformatted image listing disproved that inference, and the correction was sent to
root before proceeding. No daemon reset or broad prune occurred.

q passed 78 targeted cases/521 assertions, strict Steep and targeted lint, then fresh
migrations and 26 database cases/182 assertions. The four real Mox protocol cases
reported one assertion failure: Mail returns one In-Reply-To identity as a scalar,
but the assertion expected an array. Both reply header assertions now normalize
through Array without changing the expected identity. No protocol PASS was claimed
for q.

r used immutable image
`sha256:24f11e770370521d01b5ac3a58f048dcbba51b8164ad94960b91ad7d6a9a1bff`.
Its 78 cases/521 assertions, strict Steep, targeted lint, migrations and 26 database
cases/182 assertions all passed. All four real Mox protocol cases then passed with
424 assertions, including wrong password and certificate hostname denial and real
reply sender/In-Reply-To/References checks. These protocol cases do not establish
the persisted application chain.

r's subsequent app-chain admission failed because Docker refuses to attach an
internal network to a container started in private `none` mode. No app-chain test
executed. s starts Mox directly on the independently verified task network with
Internal=true, while retaining its loopback-only DNS fixture. It adds actual Auth
invitation/session cookies, an authenticated imported-inbox GET, rejected CSRF with
unchanged draft version, authorized HTTP reply save, and logout, followed by the
protected approval and actual SMTP worker. Browser acceptance remains separate.

p/q/r exact cleanup passed; task containers, synthetic volumes/networks, own server
image, builder and private fixture files were removed. Evidence is retained under
`/tmp/launch-mailflows-20261023/source/ops/local/launch-mailflows-20261023-{p,q,r}`.
s first timed out at the 55-second flock admission, before any Docker mutation.
Root then authorized one background admission with a 1800-second timeout, queued
behind the existing owner without preemption; no s result is claimed here. The
same common lease covers the entire build/test/cleanup critical section.
Bounded functional/design review is
still requested from root, including the new 65-line HTTP fixture and the divided
app-chain fixture. No review approval or Obsidian simulation is claimed.

Attempt s subsequently acquired the lease and passed 78 unit cases/521 assertions,
strict Steep, targeted lint, migrations, 26 database cases/182 assertions and all
four real Mox protocol cases/424 assertions (zero failures/errors/skips). Its
immutable server image was
`sha256:5a947acbdf3e7b701489fe4034b061aba30657a32aa880759e4c29c295193a69`.
The app-chain container was not reached: Mox had changed its private mount to
root ownership, so host-side creation of hosts/env files failed with PermissionError.
Exact cleanup and independent absence passed; host free space afterward was
71,334,703,104 bytes, without an attributable reclaimed-space claim. Attempt t
moves those runner-owned files into the evidence directory and removes its secret
env file before cleanup; t is queued, with no result claimed yet.

Attempt t passed the same scoped gates and four real protocol cases, then reached
the actual app-chain test: SMTP submission, IMAP worker persistence, app inbox
visibility and unauthorized RLS read denial passed. Its first HTTP assertion
failed (11 assertions total): the fixture omitted required context headers and
expected 401, while the read wrapper deliberately rejects missing context with
400 before authentication. No product authorization defect is claimed. Attempt u
supplies valid-shaped context but no session cookie to reach authentication and
verify 401; HTTP Auth/reply continuation remains pending. t exact cleanup passed.

Attempt u passed scoped gates and real protocol, then passed the app chain through
real Auth invitation/login (13 assertions before error). Synthetic HTTP actor
enrollment tried to add a second owner and correctly hit `organization_single_owner`.
The fixture now preserves the existing owner and adds an operator with explicit
compose permission and no manage-members ceiling. u exact cleanup passed; v is
queued for the remaining HTTP/reply assertions. These fixture failures are not
application acceptance and do not relax production constraints.

Attempt v passed scoped gates, real protocol and the authenticated HTTP inbox,
then failed at reply save: 21 assertions, one failure, zero errors/skips, expected
200 but received 404. The existing draft belonged to the original SQL fixture
actor, so attempting to edit it as the actual Auth user correctly failed closed.
The fixture now creates that authenticated user's own reply, verifies invalid
CSRF creates no draft, saves versions 1 and 2 through HTTP, and uses that user's
real issued session for protected SQL review/approval and worker delivery before
HTTP logout. No administrative SQL changes draft ownership or bypasses approval.
Attempt w PASSED: one real app-chain case, 33 assertions, zero failures/errors/skips. Approval is through protected SQL with the actual HTTP-issued session, not the HTTP approval endpoint.
v immutable image was
`sha256:b4f9c852987e71c4c391104b0fe43d635ee8840ddd4fa84cf90e9072c8f712de`.
v exact cleanup removed four service containers, its builder/container/state
volume, two database volumes, isolated network and own immutable image; shared
bases were retained, cleanup errors were empty and independent absence passed.
Host free space after v was 71,281,221,632 bytes; concurrent fleet activity means
that number does not establish attributable reclaimed bytes.

## IMAP retrieval regression discovered during reply acceptance

Attempt m exposed a real multi-message adapter defect: Mox returned the requested UID BODY
plus an unsolicited FLAGS row. The transport rejected the valid response solely because
its total row count was two. The bounded repair requires exactly one BODY for the requested
UID and ignores metadata-only rows; wrong UID, missing body and duplicate bodies still
fail. Targeted tests cover those cases and existing deadline behavior. Runtime verification
of this repair passed its targeted tests in n; real reply acceptance passed in w.
The structural diagnostic logs no MIME or credentials. Attempt o supplies a bounded
64MiB temporary filesystem to the read-only Ruby protocol container and unique
Message-IDs per submission to prevent duplicate suppression between test cases.
Those fixture corrections remain unverified on the wire: o stopped before Ruby DB
tests because Docker reported `No such image: launch-mailflows-20261023-o:server`
after the same image had completed migrations. The cause is unproved; root was
asked to confirm fleet cleanup isolation before another build. Exact task cleanup
passed and final host free space was 72,783,822,848 bytes; no reclaimed-byte claim
is made because other fleet activity may have contributed.

## Current source receipt

SHA-256 of current working-tree bytes; this is uncommitted held source, not a release.

```text
01eb7864205b6edda927478e97844a824046ffaec40587f2f80d0b4d6a7d8abc apps/server/db/migrate/20261023000043_preserve_mail_reply_identity.rb
9bf376a54f64ead4af94efe2c9394b1d449d93cd247132a461fdd1ffbbe3cbcd apps/server/db/migrate/mail_reply_identity/up.sql
5b2eb278522ea9622be92520e626ee25c2378aa90d0a02c8deacd629943a3463 apps/server/db/migrate/mail_reply_identity/down.sql
5afe0ac6acdb11ed4e1d49347c06fffa334878d3158503b5fba07a20c41e00a7 apps/server/db/migrate/mail_reply_identity/snapshot.sql
d28c37424d0f5bcb27d05d20ef7115bb3e7dd81f15c81811250931484ac04af0 apps/server/db/migrate/mail_reply_identity/snapshot_down.sql
d021c7f8bde727819bfc219853ae8bba4750003449cb86ff5989ea4c5ba208fe apps/server/lib/elevateo/mail_message_identity.rb
6ebda53f57b139187f8344760eb60f2558ce9e4349a094e2479af0be5905b84f apps/server/lib/elevateo/inbound/imap_ingress.rb
cfc9951747f3faaa4c038a470ab8929b51a2913c28b588800eae817211520ffd apps/server/lib/elevateo/inbound/imap_worker_store.rb
84b43b4d2e1d19e63f3ac1ea08d776e6bdf863b3165bdbf9d27a3737d6c13c93 apps/server/lib/elevateo/inbound/tls_imap_transport.rb
f087702bc2e4c5ceb68934b37d2d33c92921ccdf56506a929d7c1d8274dee27e apps/server/lib/elevateo/send_api/canonical.rb
f37ea87417daebe42eb9d4310918c20ce4f3084755d942fca3e3727dc026fd3d apps/server/lib/elevateo/send_api/review.rb
b125b495d6c9ba35f2d3b8c5c9f6e16ab24fe6a57d897e40abe611b94304d50f apps/server/lib/elevateo/send_worker/smtp_snapshot.rb
f2e4dd28861d4afd881ec07b424d10b39bcefd74905e15663607400b0587f1bd apps/server/test/support/launch_mailflows/protocol.py
558a28338b2bea978422192b81975bb1865163857099a2e9973a574698da7f89 apps/server/test/support/launch_mailflows/fleet_protocol.py
528e9cb6e38ac45e538dac43cc84df7936bb23c64aa550a2eee1fe13d37e9766 apps/server/test/support/launch_mailflows/app_chain_test.rb
535553c74f9de3980be2491b801fd4d965c56f2ae89bcdd99dc257f90040ef7f apps/server/test/support/launch_mailflows/http_chain.rb
474703aad8307f4c24cd53243090efa7d92202851bc5eae093f83e70dcccef0d apps/server/test/send_worker/production_mox_protocol_test.rb
```

Retained evidence/source: `/tmp/launch-mailflows-20261023`; task overlay archives in
remote `/tmp` and Windows `%TEMP%` remain for coordinator reproduction. No disposable
task containers, volumes, networks, image or builder remain after x cleanup. Shared
base images and other workloads were preserved. No production data was accessed.

## Final review repair continuation (current dispatch)

Current worker task `task_bab002bd916d`, dispatch `ctx_4b7700cd00c9` continued the
held source inline. Attempt w immutable image was
`sha256:948ff492eb09e581d5c86cc9b8a7088c8e4ae20e60c1115f27194bfc1fc572d1`.
Its scoped units (78/521), strict Steep, targeted lint, migrations, database tests
(26/182), real SMTP/IMAP protocol (4/424), and real application chain (1/33) passed.
All counts are cases/assertions; no historical result substitutes for this run.
Cleanup removed only w's named service containers, builder/container/cache volume,
two disposable database volumes, internal network and task image; errors were empty,
shared bases retained and independent absence passed. Host free space was
71,309,135,872 bytes; concurrent workloads prevent attributable reclaimed-byte claims.

Bounded functional/design reports identified independent teardown, exact CSRF oracle,
missing authenticated mailbox-denial proof, and reply-pagination weaknesses. Current
x source adds cleanup failure-injection tests, a correctly shaped wrong CSRF token
with exact 400/request_invalid and no persisted draft, authenticated organization
session without mailbox grants with inbox exclusion/404/no draft, and an advancing
UID cursor. x runtime passed; independent repair re-review remains with the coordinator. Existing database tests separately
prove disabled outbound-domain and rotated credential fences; the real wire case is
a positive delivery chain, not an outbound-revocation-on-wire claim. No HTTP approval,
background scheduler, browser acceptance, live delivery or whole-project release is claimed.

Additional owned source receipts:

```text
8c469492b4cdd4ba2b67a290b553ffe6daf074b38996356cfb7259a4e7d20ef9 apps/server/test/support/launch_mailflows/cleanup.rb
37af0d57c450cbf766063fd57fede6666368c80eb47c68e81f7d6b58a773b5e2 apps/server/test/support/launch_mailflows/cleanup_test.rb
c1c527e9203cd35c2ca884c77f1f1eff897d54bb45a2bcee9c40c9def8a77962 apps/server/sig/inbound_imap.rbs
c9e08a7c1b76db127ddf9b4f5207d548cb069b7cf3c83674f95edcb2bf2b286e apps/server/sig/send_api.rbs
08d1a3d9357fd4bdd5c00bf863bf302678248078c2c378c6ae1cc75f86dc8aef apps/server/sig/send_worker/smtp_snapshot.rbs
600b92f492a294719119e9ac0afb82dc782adf446f1163bc1889b637bc10d444 apps/server/sig/mail_message_identity.rbs
42be13c782fede26a8eaac3022df26a3ba8c9c179311679e02dc7725acf24f7e apps/server/test/inbound/mail_identity_database_test.rb
51730188fb5a7bcba6dbb96083ecb740101e78529b0ce55d082df2792f80e14a apps/server/test/sends/reply_identity_database_test.rb
1ed1c18f018c90611c26acf029b14476e615735d6d9720ed319474da03654a64 apps/server/test/send_worker/mail_message_identity_test.rb
f7d60669a8b8d9177c5581c5b637b1767a38f14bfd3bf7a9b8199017d7e3b535 apps/server/test/inbound/tls_imap_transport_test.rb
```

## Final acceptance receipt: x

Evidence directory: `/tmp/launch-mailflows-20261023/source/ops/local/launch-mailflows-20261023-x`.
Immutable image: `sha256:d5676f9646e5f42fd219b9dc00820f33efa59590b49b1ba12ca1ff25082e2c76`.
All runtime gates passed under the common flock, with one task build:

| Gate | Evidence | Result |
| --- | --- | --- |
| Scoped units including cleanup failures | `015-targeted-units.log` | 80 cases / 526 assertions, zero failures/errors/skips |
| Strict typing | `016-strict-types.log` | Steep exit 0 |
| Targeted lint | `017-targeted-lint.log` | exit 0 |
| Fresh migrations | `024-migrate.log` | exit 0 |
| Identity, replay, mailbox/tenant and send-fence DB regressions | `025-identity-database-tests.log` | 26 / 182, zero failures/errors/skips |
| Real Mox SMTP/IMAP protocol | `037-ruby-mox-protocol.log` | 4 / 424, zero failures/errors/skips |
| Real app chain with authenticated mailbox/CSRF denial | `046-ruby-mox-app-chain.log` | 1 / 41, zero failures/errors/skips, 31.888729 seconds |
| Exact cleanup | `cleanup.json`, `fixture-cleanup-errors.json`, `result.json` | PASS; errors empty |
| Independent read-only post-cleanup probe | `independent-absence.json` | no task-labeled containers/volumes/networks/images; private fixture absent; source unchanged |

The app case uses actual disposable Auth cookies, persisted SQL authorization and the
application inbox/draft HTTP routes. Protected SQL approves the HTTP actor's own draft,
and the production worker/SMTP adapter delivers it through isolated Mox; recipient
IMAP verifies original mailbox From and original RFC In-Reply-To/References. The same
case verifies unauthenticated rejection, authenticated ungranted-mailbox read/write
denial, well-shaped incorrect CSRF rejection without draft persistence, restricted
SQL identity denial, inactive inbound-account rejection and post-logout 401.

Task-only Mox, four application services, builder/container/cache volume, two DB
volumes, internal network and exact image were removed. Shared bases and unrelated
workloads were retained. Host free space after cleanup was 71,252,447,232 bytes;
reclaimed bytes cannot be attributed amid concurrent fleet activity. No laptop Docker
was used and no Windows Docker virtual disk was created or compacted. Reproduction
source, logs and overlay archives remain at the documented remote and Windows temp paths.

No current scoped runtime gate failed. Remaining external gates are independent
repair re-review, owning controls-lane inventory/caps/warmup verification, HTTP approval,
UI/browser acceptance and integrated launch acceptance; none is represented as passed.
No live sends, public deployment, provider APIs, purchases or production data access occurred.