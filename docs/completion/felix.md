# QA-817 Felix candidate

Scope: adversarial security/performance regression coverage on the isolated `completion/felix-qa817` branch, based on `bbf2353b254a05d48c2da7a508c143e6fba78691`. Source: `apps/server/test/qa817/adversarial_boundaries_test.rb`. No production, contract, secret or deployment files changed.

The tests use existing `WriteInput`, `SendWorker::Control` and `SendWorker::SubmissionResult` interfaces. They require only existing Minitest and Ruby standard library dependencies. Happy path: exact origin, bounded literal plaintext, valid release control and simulated accepted evidence. Likely failures: origin/media spoofing, duplicate or illegal JSON, excess stream bytes, corrupt or oversized worker control, and forged/non-simulated result values.

Assumptions and limits: these pure boundary tests cannot establish cross-tenant reads/writes, organization escalation, stale database generations, CSRF token enforcement, worker locking races, secret absence across all outputs, or a measured hot-path budget. Those need authenticated HTTP/real PostgreSQL/fake transport fixtures owned by the relevant implementation teams and Docker execution by Soren. No benchmark number is claimed. Host application tests were not run.

Requested Soren command (fleet-02, under `/home/tanzeel/elevateo-mail-wave-20261014/control/soren-docker.lock`): in the maintained disposable server test image with repository mounted at `/workspace`, run `cd /workspace/apps/server && bundle exec ruby test/qa817/adversarial_boundaries_test.rb`; Soren selects the exact authenticated Compose recipe and resource labels. Also request bounded authenticated HTTP/PostgreSQL cases for cross-tenant read/write, org escalation/personal content, stale generations and worker race; origin/CSRF; forbidden secrets and hostile IPC; and a timed bounded hot path with measured setup and limits. Exact command may need Soren's recipe adjustment; execution NOT_RUN.

Design tradeoff simulation for root (analytical, not executed): a pure input test catches malformed bytes quickly but cannot prove that SQL claims use the same tenant and generation as the request. A locked race fixture costs more setup yet is required to distinguish stale-generation rejection from an incidental 404. For performance, request count and query count are more stable initial oracles than a fabricated latency target; record latency only with fleet environment details.

Candidate SHA: pending commit. Review coverage: pending independent bounded review. Tests requested: above; tests executed: none. Limitations: no integrated acceptance or benchmark evidence.

## Continuation: actual database candidate

Added `apps/server/test/qa817/tenant_authority_database_test.rb` using `CollaborationDatabaseCase`: happy literal plaintext note under a real API role, foreign tenant read/write denial with exact admin witness unchanged, and private mailbox denial without explicit membership. This is not a simulation of a completed Docker run. Soren command from `/workspace/apps/server` in the maintained disposable backend test image: `bundle exec ruby test/qa817/tenant_authority_database_test.rb`; require `BE02_API_DATABASE_URL` and the existing disposable database fixture environment. Also run the boundary candidate and affected RuboCop/Steep. Exact image/project/cleanup belong to Soren.

SEC-802, SEND-809 and native IPC are absent from this baseline. Pending integrated tests: protected role ceiling and personal consent plus frozen legacy mutation bypass; revoked worker claim/authorize/record/cancel/unknown races; native IPC and callback denial. Coordinator was asked to relay exact owner seams. Performance evidence scan found PERF-01 design records explicitly unmeasured; a latency/memory budget cannot be defined from that source. Request Soren capture warm/cold latency, query count, peak RSS and environment on a frozen integrated build before setting thresholds.

Review request: independently review the new 44-line database test against full rubric in a <=200 LOC packet, plus dedicated design tradeoff review. Own source inspection is not independent coverage. No confirmed defect density claim. Tests executed: none.

Independent peer review completed for Sabine's 152-line SEC-802 `access.sql`; exact hash, rubric, 0 observed defects and the unresolved legacy bypass are recorded in `docs/completion/felix-sec802-review.md`. This does not review QA-817's own source or replace the required separate design review.

Independently reviewed Rowan's SEND-809 worker SQL in two <=200-line packets (223 unique LOC); SHA, full rubric, zero observed static defects and untested adapter/race gaps are in `docs/completion/felix-send809-review.md`. No application execution or separate design review is implied.

Added `apps/server/test/qa817/origin_csrf_controller_test.rb`: actual V1 controller with canned SQL, happy same-origin plaintext write and failure cases for cross-origin, missing origin, malformed CSRF and forbidden secret field. Soren command from `/workspace/apps/server`: `bundle exec ruby test/qa817/origin_csrf_controller_test.rb` in the maintained disposable backend image, plus affected lint/Steep. It is NOT_RUN and does not prove authenticated HTTP or real PostgreSQL. Independent QA-817 source review remains requested; no self-review density claim.

## SEC-802 integrated privacy candidate

Sabine committed the legacy hook at `1a0ecfa` while integration is pending. Added `apps/server/test/qa817/private_sales_database_test.rb` to check assigned sales read of a private team mailbox, unassigned sales denial, and organization admin denial for a personal mailbox using actual API role/RLS. It requires the SEC-802 migration; it is NOT_RUN on the isolated baseline. Soren command after immutable integration, from `/workspace/apps/server` in the disposable backend image: `bundle exec ruby test/qa817/private_sales_database_test.rb`. Request exact real-DB authorization traces and cleanup; no budget claim. Independent review of this test source remains pending.

Independently reviewed Sabine's 85-line committed legacy mailbox hook with full rubric; 172-line companion test was read only as coverage context, 257 unique LOC across two <=200-line packets. Zero observed SQL defects in bounded static pass, 0/KLOC; runtime/design still pending. See `docs/completion/felix-sec802-legacy-review.md`.

Reviewed Rowan's corrected SEND-809 tail at commit daf5161, exact SHA and 157-line packet in `docs/completion/felix-send809-followup-review.md`: zero observed static defects, 0/KLOC; worker-memory snapshot boundary and integrated race/runtime gates remain open.

## SEND-809 integrated worker observation candidate

Added `apps/server/test/qa817/worker_observation_database_test.rb` targeting Rowan's corrected single-path SQL. It uses actual worker login and real PostgreSQL: valid `local:` receipt accepts, foreign receipt and wrong attempt leave job dispatching, and stale lease generation cannot mark accepted. Soren command after immutable integration from `/workspace/apps/server`: `bundle exec ruby test/qa817/worker_observation_database_test.rb` with disposable BE02/BE03 fixture environment, then affected lint/Steep. Source is NOT_RUN; independent review requested. The existing Rowan suite covers broader cancellation/revocation/unknown races and remains required.

Independently reviewed Orion's immutable native OAuth seam at commit 5859593 in two <=200-line packets (201 unique LOC), exact SHA and full rubric in `docs/completion/felix-native812-review.md`. Zero confirmed static defects observed; raw callback alias/issuer userinfo policy probes, native IPC wiring, Rust runtime and Windows callback acceptance remain open.

Correction: committed Sabine hook SHA `aa1efedb` has one HIGH legacy delete ceiling bypass (11.76 defects/KLOC in 85 LOC), contrary to my earlier zero-defect report. `apps/server/test/qa817/legacy_ceiling_database_test.rb` checks happy delete, ceiling-revoked delete denial without mutation, and unclassified denial. Soren command after Sabine fix is frozen/integrated: `bundle exec ruby test/qa817/legacy_ceiling_database_test.rb` in the disposable backend image. NOT_RUN; a working-tree fix is not acceptance.

Sabine's committed repair `0df2b1f` was independently re-reviewed at exact hook SHA `6bb09546` (96 LOC). The old HIGH deletion bypass is statically addressed; zero new defects observed (0/KLOC), while the historical 11.76/KLOC remains recorded. See `docs/completion/felix-sec802-repair-review.md`; fleet execution of QA-817 and Sabine cases remains required.

Corrected Rowan SEND-809 SQL now has full bounded static coverage at SHA `8a6d25e`: head lines 1–168 and earlier tail lines 169–325, 325 unique LOC in two <=200-line packets, zero observed static defects in either. See `docs/completion/felix-send809-head-review.md`; fleet SQL/race and separate design evidence still pending.

Critical integration audit: read-only hash of Cassian isolated integration at HEAD `34ee753` showed `membership_patch.sql` SHA `aa1efedb`, the exact confirmed HIGH old-hook bypass. Root/Cassian were escalated to import Sabine immutable repair `0df2b1f` and run the QA-817 real-DB regression before accepting authority. This is an observed source hash, not a runtime test or claim about later integration commits.

## Protected actor projection candidate

Added `apps/server/test/qa817/grant_actor_database_test.rb` for Sabine's current `app.organization_grants_page`: stable owner actor on first and second redacted pages, auditor denial, and forged tenant GUC denial. Uses actual API login and real PostgreSQL; pending integration and NOT_RUN. Soren command from `/workspace/apps/server` in disposable backend Docker: `bundle exec ruby test/qa817/grant_actor_database_test.rb`; record migration SHA, exact exits and cleanup. Separate authenticated Theo V2 HTTP and owner/admin role mutation races remain mandatory.

Added `apps/server/test/qa817/role_owner_race_database_test.rb` for distinct-owner concurrent inserts, bounded worker joins and exact one-owner postcondition using a disposable real PostgreSQL database. Soren command after SEC-802 integration from `/workspace/apps/server`: `bundle exec ruby test/qa817/role_owner_race_database_test.rb`. Test/lint/independent review NOT_RUN; this supplements Sabine's sequential uniqueness and direct owner deletion checks.

Added `apps/server/test/qa817/role_escalation_database_test.rb`: real API-role success and stale revision, direct admin self-to-owner rejection, and owner demotion trigger denial. Soren command after immutable SEC-802 integration from `/workspace/apps/server`: `bundle exec ruby test/qa817/role_escalation_database_test.rb`. It supplements Sabine's role tests; NOT_RUN, independent source review pending.

Independently reviewed Theo's 200-line protected grants controller at exact SHA `584fcee9`, with 179 lines of HTTP/input test coverage context in separate bounded packets (379 unique LOC). Zero observed controller defects (0/KLOC static), actual HTTP/DB and design pending; see `docs/completion/felix-adm803-review.md`.

Integrated Cassian SEND-809 delta at SHA `e242ce37` was independently reviewed in 82 bounded contextual LOC: new due discovery and explicit final false, zero observed static defects (0/KLOC), runtime tests for empty/canceled/busy/epoch and claim race pending. See `docs/completion/felix-send809-integrated-delta-review.md`.

## Integrated migration privilege blocker

Soren's integrated f787bbc backend migration failed before QA817 cases with `permission denied for schema app` in Nadia `AddSendCancellation`: migration selects `elevateo_send_owner` then creates `app.cancel_send`. I sent Nadia the exact source seam and requested a narrow, reversible owner fix. Added `apps/server/test/qa817/cancellation_privileges_database_test.rb` as a post-repair real-DB check: private function owner, API-only execution grant, public/worker denial and no runtime schema CREATE privilege. Soren command after owner fix and migration success from `/workspace/apps/server`: `bundle exec ruby test/qa817/cancellation_privileges_database_test.rb`; NOT_RUN. No performance budget can be defined from the failed migration gate.
