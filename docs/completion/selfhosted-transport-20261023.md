# Production self-hosted application transport ? 2026-10-23

Status: canonical full backend PASS: 1204 runs / 13808 assertions, zero failures/errors; Steep and lint PASS. Final nonce real-Mox protocol BLOCKED before Ruby; final targeted lint NOT_RUN. Exact cleanup PASS; NOT accepted for activation.
Owner dispatch `ctx_6594097677c5`, task `task_675b2412d6dd`; no commits or nested agents.

## Scope and behavior

Distinct `ProductionMoxProfile` / `ProductionMoxTransport` use profile `mox-smtp-v1`, mandatory STARTTLS on port 587, system certificate roots, peer and hostname verification, authenticated SMTP, and private Bundle resolution. The exact account/organization/mailbox/version/reference/protocol tuple comes from SQL and is checked by the existing strict Bundle, then snapshot organization/mailbox and verified envelope sender are checked before connecting. Production receipts use `mox-v1:` and observation source `mox_smtp_v1`; SMTP acceptance is not proof of delivery. Fixture profiles retain their test-only namespaces and behavior; provider routing remains separate.

The forward migration `20261023000041` adds disabled-by-default operator domain authority and secret references, extends existing approval/claim/final-check/observation functions, and preserves immutable historical migration inputs. Production approval and dispatch require existing session, membership, capability, policy, suppression and budget gates, plus explicit recipient consent, an active exact SMTP binding and enabled organization-scoped domain evidence. Runtime roles cannot enable domains. Production attachments remain unsupported. Rollback refuses domain authority, production attempts or secret bindings; it must not erase production history.

Any exception after SMTP DATA may begin becomes durable unknown. Existing reconciliation records no-evidence observations and never submits another SMTP transaction; ambiguous results require operator reconciliation. Existing control-file epoch/hold and process hold remain independent barriers.

Existing TLS IMAP composition now accepts explicit `mox-imap-v1` in production Mox mode, using the same verified host on port 993, system roots and separate secret-backed IMAP Bundle entries. Fixture IMAP keeps localhost:1993, fixture CA and test refs. Inbound authentication still uses SQL-authorized identity/version and existing lease/cursor/storage machinery. A dedicated nonce-bound Ruby-adapter real-Mox protocol test is present, but its isolated runtime proof remains BLOCKED as detailed below.

Migration `20261023000042` repairs trusted enrollment under forced organization RLS: SELECT plus row-lock UPDATE policies apply only to elevateo_owner while session_user is elevateo_migrator. The reversible migration leaves runtime roles unable to enroll. Regression tests use a real migrator login, reject missing membership, and deny runtime enrollment. Compose overlay and its README belong to the coordinator; this worker does not edit them.

## Configuration interface for root / provisioning owner

Keep `ELEVATEO_OUTBOUND_HOLD=true` and control-file `outbound_held=true`. Constructing configuration does not authorize activation.

- `ELEVATEO_MODE=production`, `RAILS_ENV=production`, existing production role/process/database/auth settings.
- `ELEVATEO_OUTBOUND_MODE=mox`; `ELEVATEO_MOX_PRODUCTION_ENABLED` defaults false and must remain false until root acceptance. Releasing process hold requires this explicit true switch.
- `ELEVATEO_MOX_HOST`: verified lowercase public certificate hostname; `ELEVATEO_MOX_VERIFIED_DOMAINS`: JSON array of 1..120 unique exact sender domains (maximum 32768 bytes), rejecting reserved/documentation names and IP literals; the host must belong to one listed domain. SMTP port is fixed 587; plaintext/opportunistic fallback is absent.
- `ELEVATEO_MOX_CREDENTIALS_PATH`: absolute private mode0600 Bundle file, format 1. Do not print it or credentials. Use existing exact Binding fields: account_id, organization_id, mailbox_id, credential_version, credential_ref (`secret:`), protocol (`smtp` or `imap`). No fixture identity substitution.
- IMAP: `ELEVATEO_IMAP_PROFILE=mox-imap-v1`, `ELEVATEO_IMAP_CREDENTIALS_PATH` absolute private Bundle, existing attachment worker-storage settings. Production IMAP shares the validated Mox host and does not accept a custom CA override. Inbound/outbound credentials remain separate protocol entries even when backed by one mailbox password.
- Provision SQL active account rows and all existing budgets/capabilities through the separately reviewed initialization owner. Add organization/domain evidence only after verified domain ownership, DNS/TLS/mail policy and root acceptance. This worker performed no production database mutation.

## Fleet evidence (bounded checks, not activation acceptance)

All attempted runtime work used fleet-02 Docker and the shared `soren-docker.lock`; no host app tests, dependency installs or local app execution occurred. Private source snapshot excludes credentials and production runtime data, uses isolated network and task-owned namespaces. Harness-only corrections: synthetic bootstrap source directory/file read permissions, CRLF-to-LF normalization of script/source inputs, cleanup allowlisting of the existing read-only `ops/production` bind, and restoration of all seven Git-recorded bin executable modes (100755). These are private snapshot adaptations, not repository ops changes.

| Run | Result | Application tests | Cleanup |
| --- | --- | ---: | --- |
| transport20261023-a | PostgreSQL synthetic initialization file permission denied before bootstrap/build | 0 | exact cleanup PASS |
| transport20261023-b | DB/auth bootstrap PASS; pinned Ruby base absent at image admission before build | 0 | exact cleanup PASS |
| transport20261023-c | Build PASS; read-only mount target absent before migrate process start | 0 | exact cleanup PASS |
| transport20261023-d | Migration PASS; transport/fixture/IMAP PASS; production PG setup rejected credential rotation without version advance | 41 runs / 274 assertions, 9 setup errors | exact cleanup PASS |
| transport20261023-e | Migration PASS; empty rollback exposed private-table owner-role requirement, repaired in current source | 0 | exact cleanup PASS |
| transport20261023-f | Up/down/reapply PASS; targeted suites and Steep PASS; default full style command failed, canonical lint pending | 54 runs / 416 assertions, zero failures/errors | exact cleanup PASS |
| transport20261023-g | Up/down/reapply PASS; populated rollback harness stopped on organization RLS denial during synthetic seed under migrator (before probe); corrected to bootstrap-only fixture setup | 0 | exact cleanup PASS |
| transport20261023-h | Up/down/reapply and populated authority refusal PASS; all nine suites and Steep PASS; lint found only seven snapshot executable-mode warnings | 97 runs / 909 assertions, zero failures/errors | exact cleanup PASS |
| transport20261023-i | Build and canonical RuboCop lint PASS (475 files) with Git-recorded bin modes restored | no application tests | exact cleanup PASS |
| transport20261023-j | Deliberately interrupted before build after source upload admission failed; no stale-source tests claimed | 0 | exact cleanup PASS |
| transport20261023-k | 209 standard suites; schema inventory/rollback dependency oracle failed, repaired; CRLF snapshot annotation errors; lint 478 files PASS; Mox harness failed before tests on read-only hosts file | 1204 runs / 13730 assertions, 1 failure / 1 error / 3 dedicated-protocol skips | first cleanup rejected dedicated Mox; exact inspected recovery PASS |
| transport20261023-l | Final allowlist/schema oracle, migration42 down/up, full canonical backend/Steep/lint PASS; dedicated Mox harness hit private-directory readiness permission race before Ruby | 1204 runs / 13808 assertions, zero failures/errors, 3 dedicated protocol skips | first cleanup blocked by dedicated Mox; inspected recovery PASS |

| transport20261023-m | Targeted image PASS; private fixture rejected0755 ancestor before Ruby; harness-only0700 correction | 0 | exact cleanup PASS |

| transport20261023-n | Targeted image PASS; fixture rejected host UID1001 ancestor before Ruby; private-parent root ownership repaired | 0 | exact cleanup PASS |

| transport20261023-o | Final targeted image PASS; zero Ruby log/cases before fixture readiness failure; subsequent host resolver removal PermissionError masked original error; final targeted lint NOT_RUN | 0 | Docker cleanup PASS; exact resolver/parent recovery and namespace absence PASS |

Evidence root: `/tmp/transport20261023-work/source/ops/local/`; each namespace has `result.json`, `cleanup.json`, mount audit, source hashes, command logs and host/Docker space receipts. The initially absent canonical image was `ruby:3.4.11-slim-bookworm@sha256:22165c5f904d76a8a02fbdd419d0269481369523fd66978232d16c88099730e2`. Root explicitly authorized pulling this exact pin, which was pulled under the shared lease; no substitute was used. Shared services, images, volumes and persistent data were preserved. Run a removed exactly 2 containers, its db-config/db-data volumes and isolated network; run b removed exactly 3 containers, its db-config/db-data volumes and isolated network, with zero cleanup errors. No image or build cache was created by either failed run. Run b host free space was 73,188,048,896 bytes before and 73,153,712,128 after (net decrease 34,336,768 bytes; no reclaimed-byte claim); final Docker usage was images 103.7GB, containers 4.911GB, volumes 16.81GB, build cache 4.62MB. Other workloads remain active, so no global prune or Docker shutdown/compaction was attempted. Windows Docker virtual-disk compaction does not apply to the remote Linux fleet host.

Durable archive: [selfhosted-transport-20261023-evidence.tar.gz](selfhosted-transport-20261023-evidence.tar.gz), 2,654,142 bytes, 838 files, SHA256 `acf14418f750b7add721f3cb491cdd828dba54ddaacf7f88172816ddec138e28`. It retains all attempted run command logs, result/cleanup/mount/space receipts, complete source manifests and private harness source; private credentials and environment files are excluded. Historical failures remain intact. Final namespace audit found zero task containers, volumes, networks or images; private runtime/resolver directory absent. Final fleet free space before staging removal: 73,383,403,520 bytes. After durable archive verification, exact `/tmp/transport20261023-work` (non-symlink task staging copy, without `.git`) was removed under the lease and independently absent; free space became 73,392,443,392 bytes, an additional 9,039,872 bytes released. Shared base images and active unrelated services remain; no global prune or shutdown occurred.

Final targeted blocker: no actual Ruby SMTP/IMAP case executed. The final attempt stopped before a Ruby log was created; its finally cleanup PermissionError masked the original fixture error, so the original cause is UNKNOWN. The dedicated fixture logs were not retained before container removal. Root bounded further attempts; no additional build is requested by this report. The final94LOC test lint also remains NOT_RUN. Canonical full-suite PASS applies to the prior frozen source, with its three opt-in protocol skips; it does not establish this missing protocol proof.

## Review and remaining acceptance

Bounded source packets (maximum 180 physical lines) and whole-file SHA256 values are supplied to root for independent functional/security review and a dedicated design reviewer. The existing profile/transport static report covers its own exact hashes only, with zero confirmed defects / 113 physical LOC / 0 defects per KLOC; it does not cover SQL, runtime, tests or the entire integration. Central `code-reviews.md` and global state integration belong to root. Initial SQL approval review found 1 LOW defect / 326 physical LOC = 3.07 defects/KLOC; initial state review found 1 MEDIUM test-coverage defect / 347 LOC = 2.88 defects/KLOC (test packet alone 1/192 = 5.21/KLOC). Both have source repairs and passing regressions, with final SQL repair re-review PASS on its exact 348-LOC source packet and other exact-current-hash reviews owned by root; overlapping review coverage is not additive.

Run h additionally passed provider stub 6/76, approval 15/202, budget 13/148 and SMTP binding 9/67. Provider traffic stayed inside the test container HTTP stub; no external Resend request occurred. Run f and h both passed: real PostgreSQL 15 runs/106 assertions (9 production cases plus 6 inherited fixture cases), auth configuration 12/101, production SMTP 11/72, fixture SMTP 10/63 and inbound configuration 6/74. Steep passed exit0. PostgreSQL covers durable unknown/no replay, consent, budget, disabled and foreign tenant domains, runtime-role authority denial, post-authorization account-version rotation, enabled-domain evidence constraints, and NULL mode for fresh/replayed approval. Empty rollback and reapply passed. The run-h 450/550 transport cases use doubles and check no receipt before/after DATA; real private protocol evidence is recorded separately.

Review findings repaired: SQLAPP01 NULL approval mode now rejects before replay/write; STATE01 adds explicit SMTP450/550 regression cases. Runtime exposed migration down private-table ACLs, fixed by assuming each schema owner while retaining exclusive locks and conservative rollback refusal. Run h passed populated-domain rollback refusal without deleting authority. Its canonical lint found seven `Lint/ScriptPermission` warnings solely from snapshot files being 0644 while Git records 100755; run i restores those modes privately and reruns build/lint only. Default RuboCop style-only findings were not used to trigger unrelated formatting changes.

Final allowlist review verified profile56 + test226 plus nonce protocol and its MIME-decoding successor: 400 conservatively charged cross-version LOC, zero open confirmed defects (0/KLOC); historical raw-MIME oracle defect 1/400 = 2.50/KLOC, repaired before final targeted proof. The final protocol file is 94 LOC, SHA256 `9156ff196a499b8c4e28d2b2c7051e85eaf5309d278643e4db533131d2ce58bf`. Fresh SecureRandom nonce is present in submitted subject/body; fetched MIME is decoded with the already locked Mail parser and both fields must match. Stale fixed-subject and fresh-subject/stale-body negative assertions prevent old deliveries satisfying the proof. Schema oracle independent review covered 44 context LOC, zero defects (0/KLOC), exact private-table inventory and typed Mox dependency drop/rollback restoration preserved. See `selfhosted-review-transport-freeze-20261023.md` and `selfhosted-review-schema-oracle-20261023.md` for exact scope.

Activation additionally requires exact current-hash independent reviews, root acceptance, verified domains and DNS, valid public certificate, private account/Bundle provisioning, authenticated Mox SMTP/IMAP proof in an isolated authorized environment, infrastructure/network readiness, durable recovery/queue reconciliation, and explicit release of both hold layers. No public deployment, live send, DNS mutation, Resend call, purchase or secret output occurred.

Root-requested whitespace-only successor removes final extra SQL blank lines from approval.sql (102 LOC) and observation.sql (57 LOC); runtime semantic inputs remain unchanged. Refreshed hashes appear below.

## Exact source review packets

Whole-file SHA256 binds each inclusive <=180-line packet; changed existing-file packets include five context lines. Repeated context is nonadditive; no review acceptance is inferred from preparation. Runtime snapshots normalized CRLF to LF, and record their separate actual hashes.

| File | Inclusive lines | Physical LOC | Whole-file SHA256 |
| --- | --- | ---: | --- |
| `apps/server/bin/inbound-worker` | 28-53 | 26 | `a13dbfab703289d167fefcd7c225780ba478343d10152c08d616b0a7235c2d37` |
| `apps/server/bin/send-worker` | 13-45 | 33 | `0b97eb712b8991e5f1f69710a1d239f83d171806787f516a64e5ab5145bcf92d` |
| `apps/server/bin/send-worker` | 55-76 | 22 | `0b97eb712b8991e5f1f69710a1d239f83d171806787f516a64e5ab5145bcf92d` |
| `apps/server/db/be03_send/production_mox/approval.sql` | 1-102 | 102 | `f69642f00ce10587809b4292ebe189d8a0669fcc67355c11a892565d55c45134` |
| `apps/server/db/be03_send/production_mox/authority.sql` | 1-180 | 180 | `f59d3f660633bc6a9e406e85af7cd3c966d35eb18e4081f0eefe7bec5cf044f4` |
| `apps/server/db/be03_send/production_mox/authority.sql` | 181-231 | 51 | `f59d3f660633bc6a9e406e85af7cd3c966d35eb18e4081f0eefe7bec5cf044f4` |
| `apps/server/db/be03_send/production_mox/observation.sql` | 1-57 | 57 | `f15b26156284fa81267ae7609182da578411393380c24c1604c7cb89db5778f3` |
| `apps/server/db/be03_send/production_mox/reconcile.sql` | 1-17 | 17 | `e43583d9eae526ce632d4e34eea70142f80c4549f5d14affe77fd7b1820c8781` |
| `apps/server/db/be03_send/production_mox/schema.sql` | 1-59 | 59 | `51c5e85806b6d1a7a1f188f67d94034968a19c5c448a10fec7f3585a31175536` |
| `apps/server/db/migrate/20261023000041_enable_production_mox_transport.rb` | 1-65 | 65 | `91414b5a6d5926f2c4aef0544f2fe7f34d2b3e7491d6bdd0c8aa4f678334aa8b` |
| `apps/server/db/migrate/20261023000042_allow_verified_enrollment_lock.rb` | 1-18 | 18 | `82e7c115e8714145b1e59c20f22c75864559e38b09afcc2d61c58fa95030277a` |
| `apps/server/lib/elevateo/campaigns/runs.rb` | 36-46 | 11 | `5f5b030419be5f721b20dc4662e9bb58bdae0e1bf87e0f3e40d19def33ba0ff3` |
| `apps/server/lib/elevateo/config.rb` | 17-27 | 11 | `a4028e2e6a775d0afa27d0a93d80674ec256639ebc32e38f4ebee204297ec2b0` |
| `apps/server/lib/elevateo/config.rb` | 73-91 | 19 | `a4028e2e6a775d0afa27d0a93d80674ec256639ebc32e38f4ebee204297ec2b0` |
| `apps/server/lib/elevateo/config.rb` | 101-113 | 13 | `a4028e2e6a775d0afa27d0a93d80674ec256639ebc32e38f4ebee204297ec2b0` |
| `apps/server/lib/elevateo/inbound/poll_loop.rb` | 4-17 | 14 | `b1a10a6e5fe2d896a23c8558211d006fe95a4c1d1dbbb951ccb18aeb5a4080b3` |
| `apps/server/lib/elevateo/inbound/poll_loop.rb` | 42-52 | 11 | `b1a10a6e5fe2d896a23c8558211d006fe95a4c1d1dbbb951ccb18aeb5a4080b3` |
| `apps/server/lib/elevateo/inbound/worker_config.rb` | 1-44 | 44 | `52479912864a3f1d40017276598754854ea465d81fffb62369b8a145dc488a60` |
| `apps/server/lib/elevateo/mail_credentials/binding.rb` | 13-23 | 11 | `6b6eb901638385de5c121b491cc00f23884af8aa76d48cf32f573ed59dfc643e` |
| `apps/server/lib/elevateo/send_api/review.rb` | 38-48 | 11 | `a9429d29e19cfb3d4ab00e5ebc8cdf2d4b05bced0c0b872da26c056768a3d1c9` |
| `apps/server/lib/elevateo/send_api/review.rb` | 53-63 | 11 | `a9429d29e19cfb3d4ab00e5ebc8cdf2d4b05bced0c0b872da26c056768a3d1c9` |
| `apps/server/lib/elevateo/send_api/service.rb` | 88-98 | 11 | `73b436a970d05c35ff46bf1432b4aa86bd937c968ecd8eba8683679f274d77cc` |
| `apps/server/lib/elevateo/send_worker/database_store.rb` | 15-30 | 16 | `a9a12d19b350b7524345554b386abfccfa0e4f5ef3cb590989fcdd67358366f0` |
| `apps/server/lib/elevateo/send_worker/database_store.rb` | 53-63 | 11 | `a9a12d19b350b7524345554b386abfccfa0e4f5ef3cb590989fcdd67358366f0` |
| `apps/server/lib/elevateo/send_worker/database_store.rb` | 80-90 | 11 | `a9a12d19b350b7524345554b386abfccfa0e4f5ef3cb590989fcdd67358366f0` |
| `apps/server/lib/elevateo/send_worker/database_store.rb` | 113-123 | 11 | `a9a12d19b350b7524345554b386abfccfa0e4f5ef3cb590989fcdd67358366f0` |
| `apps/server/lib/elevateo/send_worker/database_store.rb` | 139-160 | 22 | `a9a12d19b350b7524345554b386abfccfa0e4f5ef3cb590989fcdd67358366f0` |
| `apps/server/lib/elevateo/send_worker/mox_smtp_transport.rb` | 4-14 | 11 | `faa1103f542765ad14bfa5d8c113c1a76088803b37d0330f84dfd288f4c7fb34` |
| `apps/server/lib/elevateo/send_worker/mox_smtp_transport.rb` | 20-30 | 11 | `faa1103f542765ad14bfa5d8c113c1a76088803b37d0330f84dfd288f4c7fb34` |
| `apps/server/lib/elevateo/send_worker/production_mox_profile.rb` | 1-56 | 56 | `4076990546b1b599616d2f28fbbb935fae4bab7641769bcc134653ff64f5a370` |
| `apps/server/lib/elevateo/send_worker/production_mox_transport.rb` | 1-76 | 76 | `805d6e560d2ca345d78d6bd82a546ea638157ca8a022376c704f063a97eef91b` |
| `apps/server/lib/elevateo/send_worker/submission_result.rb` | 9-23 | 15 | `d9d573c46ac07fc6bf2f93d4e69a9603d92c9fb84683679c0dd5746323df033f` |
| `apps/server/lib/elevateo/send_worker/submission_result.rb` | 26-36 | 11 | `d9d573c46ac07fc6bf2f93d4e69a9603d92c9fb84683679c0dd5746323df033f` |
| `apps/server/lib/elevateo/sessions.rb` | 12-22 | 11 | `a7244adda6bc787c793efb8f796559ba36139f2ef9c3a1d9f9adf6b86527f1fa` |
| `apps/server/sig/inbound_runtime.rbs` | 2-35 | 34 | `24e335988353e53e5e9336e079f0f8f5e8aa553ea02463c3a52a565724cc0ec4` |
| `apps/server/sig/send_worker/production_mox_transport.rbs` | 1-30 | 30 | `0a73f3056bad61a49e286e812392c74abb6a9938257bfa5c98d1dbae2a3cda81` |
| `apps/server/test/administration/verified_enrollment_database_test.rb` | 1-49 | 49 | `61160f036469cdc5441e645bbd460cc5dae743fc4834d18168e83d2d6a1001c2` |
| `apps/server/test/inbound/worker_config_test.rb` | 56-91 | 36 | `871a0c107fabc1af7cc4ff99104e0ff4e9bc22e6c8e7a41573c736d87c6d1102` |
| `apps/server/test/send_worker/mox_smtp_transport_test.rb` | 162-173 | 12 | `6a9b7077cc4d3e85540a706ec3bd41ace0d92289519afe401ab3c74684fd4a7b` |
| `apps/server/test/send_worker/production_mox_protocol_test.rb` | 1-94 | 94 | `9156ff196a499b8c4e28d2b2c7051e85eaf5309d278643e4db533131d2ce58bf` |
| `apps/server/test/send_worker/production_mox_transport_test.rb` | 1-180 | 180 | `c52f734c44a9c30afa32ad2b798a09224e549ee33efd472d037375160c58e8d9` |
| `apps/server/test/send_worker/production_mox_transport_test.rb` | 181-226 | 46 | `c52f734c44a9c30afa32ad2b798a09224e549ee33efd472d037375160c58e8d9` |
| `apps/server/test/sends/mox_worker_database_test.rb` | 122-134 | 13 | `edac886aeacbb3e3f4b189d01ee07c5f3c5c63258fdb976240a37b19224afadb` |
| `apps/server/test/sends/production_mox_database_test.rb` | 1-180 | 180 | `57e3c830038c9c34589a29db2882ab62601c48c18a5ff147e8e0f30a65700394` |
| `apps/server/test/sends/schema_database_test.rb` | 60-70 | 11 | `1e0f5d53a613dbb914941081023e39e37d29958670f230d7e7d3ff63ff68dba5` |
| `apps/server/test/sends/schema_database_test.rb` | 107-117 | 11 | `1e0f5d53a613dbb914941081023e39e37d29958670f230d7e7d3ff63ff68dba5` |
| `apps/server/test/sends/schema_database_test.rb` | 122-132 | 11 | `1e0f5d53a613dbb914941081023e39e37d29958670f230d7e7d3ff63ff68dba5` |
| `apps/server/test/sends/schema_database_test.rb` | 146-156 | 11 | `1e0f5d53a613dbb914941081023e39e37d29958670f230d7e7d3ff63ff68dba5` |
