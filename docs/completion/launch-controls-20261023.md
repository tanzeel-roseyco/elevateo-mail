# Launch controls backend — 2026-10-23

Task `task_7401ca3a7efb`, dispatch `ctx_31410810c0f5`; uncommitted work over `177c4d26883437dd3f10074fc6323da653778da5`. This is a held implementation, not production acceptance or deployment authority. No UI, transport, inbound, thread, existing initializer or mailruntime files were edited by this lane. Other workers' shared-checkout changes are excluded from this report.

## Root decisions and activation blockers

- Exact verified Tanzeel Ahmad company Auth user UUID, organization UUID and sender mailbox UUID remain unresolved. A display name or the browser's `tanzeel@boltloop.co` account cannot establish the requested company owner. No arbitrary principal was selected; no owner role is automatically assigned.
- Google Cloud console/API/OAuth setup and resource operations were explicitly revoked during this dispatch. None were performed. The existing Google adapter remains a dormant implementation dependency, not an authorized identity architecture. No alternative IdP was activated. Fully self-hosted identity would require a separately accepted provider integration; this patch does not implement one.
- App membership admission is not an Auth-service public-registration restriction. Do not enable public Auth signup: provider-level prevention of non-company Auth-account creation is not implemented or verified here. Root explicitly deferred a Google-specific before-user-created hook until identity architecture is resolved (`msg_843054657b72`). Existing Auth configuration was not changed.
- Root supplied the approved 120-address allocation across `mail.roseyco.com`, `mail.flooda.co`, `mail.bluepillar.co`, `outreach.elevateoco.com`, `mail.boltloop.co`, 24 each. Only those addresses were copied into the disabled plan; no identity or provider metadata was inferred. The application host `mail.elevateoco.com` is avoided. Root MX remains unchanged. Source CSV: `C:/Users/Tanzeel/Code and projects/Elevateo Existing Infrastructure Launch 20261023/approved-mailbox-assignments.csv`, SHA-256 `b7e7e012c536e3ccdac99ee38c0d1bc9f4d7f70b2f6647a2547f94968d11f327`.
- Quota unit conflict is OPEN: this lane's plan is decimal 2 GB = 2,000,000,000 bytes per mailbox (240,000,000,000 payload bytes), while the approved CSV says `QuotaMiB=2048`, meaning 2,147,483,648 bytes each. Root must resolve the authoritative byte value and positive measured storage/backup overhead budget before integration. No capacity or enforced quota was allocated or provisioned.
- Transport owner/root must prove the exact sender allowlist, atomic 30/day/mailbox accounting and consent/suppression checks at every delivery boundary, including retries and warmup. This lane adds a configuration ceiling only; it does not establish those runtime guarantees.
- Ruby targeted units and scoped CI lint PASS; whole-project Steep fails outside this lane. Mandatory supplemental reviews remain blocked on coordinator-only dispatch (`consumer_fenced`), so this is an incomplete held delivery, not review-complete work. Production deployment belongs to root exclusively.

## Implemented boundaries

| Control | Implemented behavior | Evidence limit |
| --- | --- | --- |
| Signup switch | Exact boolean environment switch defaults false; enabling requires SSO-only configuration | Does not configure or enable Auth signup |
| Company admission | After token verification, callback passes only verified user/session UUIDs to a narrowly granted SQL definer | Requires root installation and separately enabled pinned DB policy |
| Identity checks | Reads trusted Auth users/identities/sessions; exact `@elevateoco.com`, confirmed active user, Google identity JSON boolean verification and matching email, bound unexpired session | Assumes Auth owns these tables; no browser/provider claims are accepted as enrollment inputs; no real-provider proof |
| Tenant/role | Root-pinned existing verified owner; reject other-tenant membership; new users receive associate only; existing role preserved | Pinning Tanzeel's actual identity is a human/trusted-record root gate |
| Revocation | Receipt tombstones survive removal/rollback; authorization history fences earlier revoked users | Requires existing authorization generation protocol on access mutations |
| Concurrency | Sorted identity/generation locks plus a membership SHARE ROW EXCLUSIVE table lock precede revalidation | Global serialization prevents privileged cross-tenant phantom inserts; lock deadline contention fails closed |
| Daily send limit | Typed config accepts only integers expressed as strings 1–30; default 30 | Not an atomic delivery counter or allowlist |
| Warmup | Offline validator accepts a disabled 14-day plan `[2,3,4,5,6,8,10,12,14,16,18,20,25,30]`; rejects activation/cost approval | No scheduler, provisioner, provider connection, external recipient network or sends |
| Mailbox plan | Strict exact fields, UUIDs, addresses, exact domains, uniqueness, 120-count readiness and capacity checks | No real mailboxes or enforced storage quotas created |

`plan.py` always reports `runtime_enforcement_verified: false` and retains explicit root identity, transport and no-activation holds even when complete enough for root review. Configuration-only holds must never be described as enforceable server delivery controls.

## Installation and rollback — root only, not executed on production

`ops/production/launch-controls/enrollment.sql` is a separately invoked transactional operator install, never application startup. It requires direct `supabase_admin` session identity, creates a NOLOGIN/NOINHERIT definer role, fixed search path, restricted grants and associate-only insertion policy. Public cannot execute the function; API can execute it and worker cannot. Existing installer and mailruntime are untouched. Installation always disables the persisted policy, including reinstall after rollback.

Keep `ELEVATEO_COMPANY_SIGNUP_ENABLED=false` and the database policy disabled. Before any later activation, root must resolve all gates above, install against the accepted full production schema, pin independently verified owner/tenant identifiers and demonstrate Auth-level public signup restrictions. This report supplies no production activation command.

Rollback ordering: disable the app signup switch first, then run `remove.sql` as the privileged operator. It disables the persisted policy, removes the executable definer and role grants/policies, and deliberately retains policy/enrollment receipts so removal does not erase revocation history. Reinstallation remains disabled. No production rollback was run.

## Fleet Docker verification

All tests ran on fleet-02 through SSH port 2222 under `/home/tanzeel/elevateo-mail-wave-20261014/control/soren-docker.lock`; no host application tests/builds or localhost application execution occurred. Existing immutable PostgreSQL image: `sha256:94b8c87f0970c71e7a2b24fdeec849254ed30f4fd12f4402f4be3faada9e69e7` (Python 3.8.10 and PostgreSQL tools). Source bind mount was read-only; DB data used tmpfs on a task-owned internal network.

Baseline run after importing root's approved 120 addresses: `python3 -m unittest -v test_plan test_enrollment`, **14 tests PASS, 5.506 seconds, exit 0**. Durable fleet log `/tmp/launch7401-pg-final.log`, SHA-256 `40084505aa050891cf70c8433f529f23a1ee28b24ea8eb01a057ae38d40b1bc1`. Coverage includes disabled/unknown owner; verified provider/email/confirmation/ban/deletion checks; session binding/expiry/nulls; cross-tenant denial; associate-only/idempotent enrollment; preexisting revocation history; runtime permission denial; deterministic concurrent owner ban/access removal; retained tombstones and disabled rollback/reinstall; plan field/type/capacity/address/domain/activation limits.

These are real PostgreSQL decisions against minimal Auth fixtures and slices of existing app schema. They are not full Supabase migrations, live Google integration, complete production trigger integration, API end-to-end, UI or mail delivery evidence. The owner-access race test explicitly follows the authorization-generation locking protocol; root must retain that protocol in every real access-removal path. Runtime SessionStore execution supplies bounded lock/statement deadlines; SQL installer timeouts alone do not bound callback execution.

Earlier attempts are preserved as failures: two incomplete staging imports (missing `admission`, then `initialize` dependencies), then fixture schema-USAGE omissions causing permission errors. Each failed run cleaned its task resources. Corrected fixture passed 12 tests, then concurrency repair passed 13, then rollback/reinstall addition passed the latest 14. Earlier passes do not substitute for latest evidence.

Shared Ruby runner attempt f executed 33 targeted cases / 214 assertions with one new callback test failure: its `not_found` fixture correctly returned 404, while the test expected 503. The fixture now supplies `temporarily_unavailable` for the intended 503 path; no production callback behavior changed. Attempt h was blocked by baseline Auth fixture grants before units. Attempt i passed **33 targeted cases / 215 assertions, zero failures/errors/skips**, including this lane's config and callback regressions. Log `/tmp/launch-mailflows-20261023/source/ops/local/launch-mailflows-20261023-i/012-targeted-units.log`, SHA-256 `49a31306dc2a13a5e916e8fcf6e2f7e072010a61a6763295e58c260d28311aa6`.

Attempt i whole-project Steep failed: two empty-collection annotations in transport-owned `send_api/review.rb`, and three errors plus one fallback-any warning in `v2/admin/organization_grants_controller.rb` outside this lane. No owned config/SSO/session-store/signature error was reported; that is not a whole-project typecheck PASS. Log `013-strict-types.log` beside the unit log, SHA-256 `e555d3fa14ec0cbf1b6e66c14230f904e120888cd6f51e468f0bd13f54c4b685`. Attempt j passed 55 shared cases / 392 assertions and fresh-DB migration-through-43 plus identity/IMAP tests (8 cases / 49 assertions), reported by transport. Whole Steep still had six diagnostics; j used default style lint rules incorrectly. Attempt l passed CI-style `bundle exec rubocop --lint`: 17 files, zero offenses, exit0, including all five owned Ruby implementation/test files, confirmed by transport and independently read. Log `.../launch-mailflows-20261023-l/014-targeted-lint.log`, SHA-256 `cecb17d24ec7ef7a5cccfc9acba17e35a34057e08eb49405e5ec00394c7054fc`. Its shared units passed55 cases/392 assertions (log `012-targeted-units.log`, SHA-256 `6a6fda9a891013db2ccb55e42614567902f8a5a08dfb5c953e05a6819fcb8d58`). Whole Steep now has only the other-lane organization-role controller diagnostics, not an overall PASS (`013-strict-types.log`, SHA-256 `badd69d98286c1005940a3ef23088df7b4d1096bd9bb1ee9e31a0d01832aeedc`). Shared-run cleanup was reported PASS. No dependency installation or unapproved fallback build was performed by this lane.

Additional cleanup failure injection initially ran 17 tests with 16 passing and one failure: a shell EXIT trap returning 1 did not replace an otherwise successful process exit. The runner now explicitly preserves the original failure status and exits nonzero when cleanup verification fails. Its three fake-Docker regressions cover preflight daemon error, cleanup daemon error and successful absence queries without accessing the real daemon. The final retry passed **17 tests in 5.302 seconds, exit 0**, plus actual exact container/network absence verification. Log `/tmp/launch7401-pg-harness-final2.log`, SHA-256 `86d8b3744e3f6e76a16c0e8b75f16e4c1d734d415e71f8ace7269c4a6d551161`. `/tmp/launch7401-pg-harness-final.log` retains the failed 17-case run, SHA-256 `d02b8fdf61f7c737b32102d1fa900930ab741a03783a2f2d15bd9a87cc0ddfe8`. Actual task cleanup after that failed suite also passed independent queries.

Latest membership-phantom repair run: **18 tests PASS in 7.606 seconds, exit 0**, including concurrent privileged other-tenant provisioning with no Auth/generation lock. Log `/tmp/launch7401-pg-concurrency2.log`, SHA-256 `b1b52dc23c4d8fad7439f3767abd4981a6447d181bd087556c1f720e06d17572`. Actual task container/network absence PASS. The first attempt timed out acquiring the common lock before Docker activity (empty log `/tmp/launch7401-pg-concurrency.log`); it is not a test failure or pass.

## Bounded adversarial review

Coordinator dispatched read-only reviewers because worker-start was coordinator-fenced. The full project rubric applied; formatting remained a linter responsibility. Requested profiles are not independently verified billing identities.

| Review | Coverage | Findings and density | Repair status |
| --- | --- | --- | --- |
| Enrollment functional | Initial SQL 91 + rollback 18 =109; tests112; total221 unique LOC, bounded packets | 1 MEDIUM masked second owner-denial scenario; 4.52/KLOC total, 8.93/KLOC tests, SQL0/KLOC | Reset fixture each iteration; latest Docker suite passes; supplemental independent review requested |
| App/plan functional | Plan105+tests57=162; app71 changed+49 context=120; total282 unique LOC | 1 LOW accepted consecutive/trailing local-part dots; 3.55/KLOC total, 6.17/KLOC plan packet; app0/KLOC | Reject empty dot segments; regressions pass; added separate unavailable-enrollment callback test; repair review requested |
| Dedicated design | SQL99 and plan105 in separate bounded packets,204 unique LOC | 1 HIGH unlocked owner revocation/ban race; SQL10.10/KLOC | Sorted identity locks plus tenant-generation protocol added; independent current SQL104 re-review: 0 new defects, 0/KLOC; runtime concurrency regressions pass |

Overlapping packets are not additive whole-project coverage. SQL re-review was source-only and conditional on access-removal generation locking; it did not independently inspect new race tests. Supplemental test lines113–157 (45), fleet runner50 and harness regression56 form a 151-line packet; the approved address allocation expands plan JSON to a separate packet. These and functional repair re-review remain requested. A subsequent four-line SQL membership-lock delta and 19-line cross-tenant concurrency regression require a fresh functional reviewer: adding that packet to the projected 385 unique LOC would exceed the 400-line cap. Dedicated design review must assess global membership-write serialization and fail-closed lock contention; neither supplemental review is claimed complete. Self-review/regression found one cleanup false-success defect (106 shell/test LOC, 9.43/KLOC); shared execution found one callback-test fixture defect (38 added callback-test LOC, 26.32/KLOC), separate from the three independent review defects above. Both are repaired and runtime revalidated. No whole-project approval is claimed. Root owns central `code-reviews.md` integration; this lane was explicitly authorized to write only this completion report.

Design tradeoff simulations: (1) simultaneous callback and owner ban must wait and reject after the ban commits; (2) owner role removal locks tenant generation before mutation and callback rejects after commit; (3) signup disable locks policy and serializes admission; (4) membership removal followed by callback cannot erase receipt/history to rejoin; (5) uninstall/reinstall preserves receipts and disables admission. A final audit found that privileged provisioning could insert a different-tenant membership between the admission check and insert without taking Auth/generation locks. The new table lock fences that phantom at the cost of serializing membership writes globally; UPDATE privilege enables locking but no UPDATE RLS policy enables mutation. The new deterministic regression passed in the final 18-case fleet suite. Self-audit identified one concurrency defect across the prior 104 SQL lines (9.62/KLOC), now repaired; independent repair review remains pending. The coarse locks limit enrollment concurrency and bounded lock timeouts can reject a contended callback, avoiding a parallel authorization system. No Obsidian connection/vault simulation was performed: root retains sole actual-vault authority and must reconcile this analysis there without claiming that it already happened.

## Cleanup and retained resources

Every Docker run inspected mounts, removed exact task-owned `launch7401-db` and `launch7401-net`, and independently verified both absent; tmpfs database storage was released. No volumes, images, build caches, downloads or purchases were created by this lane. Existing shared PostgreSQL image was retained; no shared prune or host disk compaction was attempted. Numeric host disk space reclaimed was not measured and is not claimed.

Task-only staged source remains `/tmp/elevateo-launch7401`, remote archive `/tmp/launch7401-source.tar.gz` and local archive `%LOCALAPPDATA%/Temp/launch7401-source.tar.gz` retained for coordinator review/reproduction; no disposable Docker workload remains. These contain source fixtures, no production data or credentials. Repository source/report remain for root integration.

## Source receipt

Raw file SHA-256 (Windows newline bytes; compare normalized/staged files separately):

```text
5690aa6b2d3e216d4ff535a8b687c7b637fe013e74c6861e4161270aeb7902ce apps/server/lib/elevateo/config.rb
ebad84dd7a1868cebc924ec53b026eee7aff7b21fd5e731d3f281389f9ccc9ea apps/server/lib/elevateo/google_sso.rb
193feb44903cc32a60cd067e53e9493bccbd96a9c47fdd940f425d51b06c9207 apps/server/lib/elevateo/session_store.rb
11df48d4bf761944ad5d0b19aadfcfe2ece324e9f1dc75cd80bf581dd2ee76ea apps/server/sig/config.rbs
01db24ff0c0d13d205403e6183363e3aaa6aab89c1609593fb63181a5e206db3 apps/server/sig/auth_types.rbs
d798443e4c802f1d822d8f1ddb2caae5df7ff151aff46f74f367ad406c56f0fd apps/server/test/be_02/auth_config_test.rb
2388a92f2a957ca85738b2403a38b52accfa3e36e6ef25ad9e96dba796c9dea5 apps/server/test/be_02/google_sso_test.rb
ab46be38d2fa4562b0bae8723e2457274029176243b2a8524a57496eb2c16913 ops/production/launch-controls/enrollment.sql
15c68692f478c3def039e161f32f5cec940eeca690950522816f9c5bb528cf0b ops/production/launch-controls/fleet-test.sh
23a3793e2c6b92c627295380c8e8620082a6a3a26768ca1f078a2db17394f7f4 ops/production/launch-controls/plan.json
745ce12c0b281e8671e262e4389aee5ae88c3acd32bde849ffc4f9bbcc3571be ops/production/launch-controls/plan.py
58181360e2ce08dde2dc2836eff0a647b773b40f133c98988b0c3d23453e92fc ops/production/launch-controls/remove.sql
2cf8fd29522aab42e0f7d7eb1aaa0ddaf5ec662c26a83c2771b3a50a6e3d2b03 ops/production/launch-controls/test_enrollment.py
b73942a10c0a5cf1b786a2f4d77b044f43053a9b6c43abef23c7d389ac71e342 ops/production/launch-controls/test_harness.py
76c35c294181686d2c9838eb7a2916e0349c0545cf6d7bd3838d1ec8bcb2caaa ops/production/launch-controls/test_plan.py
```
