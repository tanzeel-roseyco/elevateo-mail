# Isolated HTTP approval mailflow

Task `task_d50ae5ffd220`, dispatch `ctx_4be80c8bfe6d`. Scope: launch-mailflow test helpers and matching fleet harness only. Attempt c is pre-repair runtime evidence only; three unique independent review findings required repairs. Attempt d passed the repaired delivery assertions but failed finalization; exact recovery cleanup passed. Attempt e runtime, cleanup and independent absence PASS; functional repair review accepted 385 LOC with zero new defects. Subsequent cleanup-only refinements passed five focused Docker regressions; their final delta static review accepted 146 LOC with zero new defects. No release authority is claimed.

## Contract and scope

The chain saves the authenticated actor's reply draft, obtains `GET /v1/drafts/:id/send-review?mailbox_id=...`, and approves through `POST /v1/drafts/:id/send-approvals`. Only the returned committed `send_id` enters the real isolated Mox worker. There is no protected SQL approval fallback.

Assertions cover review versions and digest rotation, wrong digest, stale draft version, missing authentication, invalid CSRF, a compose-only actor without approval permission, successful approval and idempotent replay. Denials must leave zero send intents. Existing inbox authorization, draft CSRF, logout, disabled IMAP account, original mailbox From, and RFC In-Reply-To/References checks remain.

The API uses production configuration with `outbound_mode=mox`, outbound hold true, activation false, secure cookies, and the exact launch browser origin. Its control is written to disposable API tmpfs. The HTTP client models the private proxy hop using forwarded HTTPS; it does not prove browser TLS, SameSite behavior, public routing or SSO. The shared Auth fixture still generates its local URL; the test helper supplies the configured browser redirect for production staging validation. Only the separate synthetic worker control is unheld, on a verified internal Docker network without published ports. Live/public sending, warmup and production activation remain held.

## Frozen source and review packets

Fleet source: `/tmp/launch-http-approval-mailflow-20261023/source`, copied from retained successful x baseline, then overlaid with these four files. Prior sources and evidence remain retained. Production send service and Rails application hashes match the workspace; baseline configuration predates concurrent OIDC changes, so this run cannot establish integration acceptance of those changes.

All paths below are relative to `apps/server/test/support/launch_mailflows/`. Every packet is <=200 lines and each reviewer receives <=400 unique lines. Baseline functional, design and harness receipts exist in launch-http-approval-review-20261023.md, launch-http-approval-design-review-20261023.md and launch-http-approval-harness-review-20261023.md. They found three unique MEDIUM defects (replay cardinality overlaps functional/design); targeted functional repair review subsequently accepted 385 LOC with zero new defects; final cleanup delta review accepted 146 LOC with zero new defects. The table below preserves pre-repair hashes.

| Packet | File and lines | Unique LOC | SHA-256 |
| --- | --- | ---: | --- |
| H1 | http_approval.rb 1-66 | 66 | 9a0a61280404b3e6f1754813b91218365f61232fb676dba29d915ba3e0f38e6f |
| H2 | http_chain.rb 1-122 | 122 | 0f2875ccdd00a6857f9a2213ca4a69daebf1750329ce0f05b28c343642fa246b |
| H3 | app_chain_test.rb 1-178 | 178 | 34e1a55fc61f45fbc9ef8f262d4b7c2b7a759062c3c4e2fc6089e7b6a41b8848 |
| H4 | fleet_protocol.py 1-140 | 140 | 80aacc1ccd38e6e89b7457260042264a8c1a2eda3b16fc9f355c29f6f9c510b8 |
| H5 | fleet_protocol.py 141-279 | 139 | same file hash |

Functional allocation: H1-H3 = 366 unique LOC; H4-H5 = 279 unique LOC. Dedicated design: H1, H2, H4 = 328 unique LOC, considering version/state guards, private proxy simulation, held API versus worker control, cleanup and isolation. Formatting belongs to lint. No Obsidian connection is exposed in this dispatch, so no vault simulation or synchronization is claimed.

Production provenance: `lib/elevateo/send_api/service.rb` SHA-256 `73b436a970d05c35ff46bf1432b4aa86bd937c968ecd8eba8683679f274d77cc`; `config/application.rb` `3f7ad2477e081688b93b4a1f574a6dcc8b6d5dbf7e5c281d9f012139cf283ecc`; frozen `lib/elevateo/config.rb` `3270acaf20fe811fd5678531e9370a66394e41361e39e4c37601ca06b9ccea17` (workspace concurrent OIDC hash was `f3b1e9d75ecdca18a43fdb3bab17097dabd3b17374d0c73c71a781317971e0d9`). Paths in this paragraph are under `apps/server/`.

## Runtime history

All attempts use the common fleet flock for build, tests and cleanup. Prefix: `/tmp/launch-http-approval-mailflow-20261023/`; evidence: `source/ops/local/launch-http-approval-mailflow-20261023-<attempt>`; output: `attempt-<attempt>.log`. Tests run only inside fleet-02 Docker.

- Attempt a: source gates PASS (80 runs, 526 assertions; Steep; lint), database gate PASS (26 runs, 182 assertions). App chain FAILED at invitation staging (expected 303, actual 400), before approval. Extra read-only control-file bind caused cleanup to fail closed; after inspecting exact mounts/ownership, recovery removed eight task resources. `recovery-inspected-mounts.json` and `recovery-cleanup.json` preserve receipts. No global prune or persistent-data deletion.
- Attempt b: source/database gates PASS; app chain ERROR before approval (relative `URI::Generic` does not expose `request_uri`). Corrected helper to preserve relative URL with `to_s`. Cleanup PASS. Immutable image `sha256:4ef8d1ada09511f0b3435cc7d0ef717103d12c330bfa9a00fdd336cbd0f8be35` removed.
- Attempt c: pre-repair runtime PASS, insufficient for final acceptance. Targeted units 80 runs/526 assertions; database integration 26 runs/182 assertions; isolated Mox protocol 4 runs/424 assertions; actual HTTP approval and worker chain 1 run/83 assertions. All report zero failures/errors/skips. Strict Steep and targeted lint exited 0. Build, production-configured API readiness, verified internal network, fixture cleanup and exact Docker cleanup passed. Immutable disposable image was `sha256:8ae54bddaae9ac672b09f0811311cc623bd59cfb3e588285d8ade998c2f320dd` and is now absent.

## Pre-repair c evidence and cleanup

The c evidence directory above retains every command log. The before/after source manifests match exactly. `independent-absence.json` additionally verifies all three attempt namespaces have no containers, volumes, networks, builder containers or build-cache volumes; direct image inspection confirms all three immutable image IDs are absent. All three private fixture trees and runtime/app-chain environment files are absent. This check is separate from the harness cleanup result.

| Receipt under c evidence | SHA-256 |
| --- | --- |
| result.json | 6511c6bf6464e260f44ac6cbe51da96e5878a005880aa3de466313a1e872abce |
| cleanup.json | 6885fb908cec4fa3912588fa9a383f41b81de469446dd27676c9d9191bf42fc6 |
| immutable-image.json | ab5a938c396614c96ea29fd11f0bf047edd1f288635fa40852ee0219d3d6a220 |
| independent-absence.json | 31c3453fc51cb448159fe9aa5e7fb9c85115d3be40779d1743a0434c9d9b5245 |
| source.sha256.json and source.after.sha256.json | 194fb1d556fa02bd08b02ee8890521259b723336603ebc06cee4063a0cbcd43b |
| 049-ruby-mox-app-chain.log | 571b04ee2c906d7d20b2dfa7b6a6042fdf5980012233a658100843962869982e |
| 040-ruby-mox-protocol.log | e251d6d0fb6a2438e674fcb267135b3a6b7e17398286d33f08c1d6e217eda072 |

The c cleanup removed four synthetic service containers, the build container/registration/cache volume, both synthetic database volumes, the private network and its disposable server image; protocol teardown separately removed Mox and private fixture data. Attempt a's fail-closed cleanup and separately verified recovery remain recorded rather than rewritten as an initial pass. Shared Docker usage returned to its pre-attempt totals (images 103.9 GB, containers 4.886 GB, volumes 16.81 GB, build cache 4.62 MB); net task-owned retained Docker storage is zero. Reclaimed bytes cannot be isolated from these rounded shared-fleet totals. Final host available space was 71,746,838,528 bytes. Other tasks' containers, shared prerequisites and persistent data were preserved; no global prune or service shutdown was performed.

The passing chain is the frozen x production baseline plus these helpers, not acceptance of concurrent OIDC edits or browser UI behavior. PostgreSQL emitted UUID type-cast warnings; assertions still passed. The test helper's forwarded HTTPS and configured redirect model a private proxy and fixture staging, so deployed TLS and real Auth-provider redirect behavior remain outside this result. No production application source changed and no live/public sends occurred.

Source remains retained; disposable images, dependency/build caches and synthetic services are task-owned cleanup targets. Shared prerequisite images are retained. No local Docker/WSL activity occurred, so local virtual-disk compaction is not applicable.


## Three review repairs and final verification

Draft-wide intent row count must equal one, and that row must carry the approved HTTP send ID. Recipient delivery now compares the MIME Message-ID to production SmtpSnapshot rendering of the approved stored snapshot and send ID, asserts original sender as To and original mailbox as From, retains RFC threading, and counts matching deliveries for two seconds after first arrival. This observation does not claim universal exactly-once delivery.

Fixture finalization independently attempts credential unlink, fixture teardown, and evidence recording, catches BaseException to preserve interrupts, and preserves the original protocol exception. Cleanup receives an independent 240-second budget. Before generic finalization an exact name/project/image/bind-ownership checked fixture backstop retries dedicated removal; generic guards remain unchanged. Failure injection ran in fleet Docker under the common flock: 3 tests PASS, including interrupt plus unlink failure, retained-resource reporting with primary failure preservation, and cleanup failure after a successful protocol. Receipt: `/tmp/launch-http-approval-mailflow-20261023/fixture-finally-regression.log`.

Final repair packet paths relative to `apps/server/test/support/launch_mailflows/`:

| Packet | Inclusive source lines | SHA-256 |
| --- | --- | --- |
| R1 | http_approval.rb 49-69 | 300b08d1685911b2c896e7096a1b0c1ac94ba18ae09474fa481d99903f95b7a4 |
| R2 | app_chain_test.rb 127-174 | 1d1353d1368a45da6d38c3d36ba71fac6b11d5ad84cbe18e51cc0c7d76f14745 |
| R3 | fleet_protocol.py 78-124, 203-209, 283-305 | 2e88d91660207b0c8c8bf6295e11b4a8de827050cd278f13d648261300ca1331 |
| R4 | fixture_finally.py 1-26 | def29ca252454c75ee2093ca05ab38a2b15b9afd36026f77e224ed8ded0c5148 |
| R5 | fixture_finally_test.py 1-37 | 85d3066a7c1ce25b715cb4797ffeb01bfa9b786b4f657d35bbb9fb577b0fa045 |

Each packet is <=200 lines. R3-R5 total 140 unique lines, and R1-R2 total 69 lines, leaving each targeted reviewer below 400 unique lines. The unchanged http_chain.rb hash remains as above. Full pre-repair baseline reviews and their defect densities remain in the three receipts and code-reviews.md, rather than being overwritten by repaired-source claims.


Attempt d: units/Steep/lint/database/protocol passed; repaired HTTP chain 1 run/88 assertions PASS. Dedicated fixture cleanup passed, but outer backstop attempted inspect of the already absent container and raised before generic finalization. Exact generic recovery under the common flock removed remaining resources and recorded cleanup=true; result remains FAILED. The correction uses an exact-name presence query before inspection and guards the backstop independently. Attempt e uses this final harness hash.

Supplemental R6: fixture_presence_test.py 1-42 (SHA256 6264d439f4b79f5d810fa19de173605144a62902aa1c7d3b364f2c628007832a), mocked absent/present/wrong-owner cleanup cases. Its retained remote source is outside the frozen build tree at /tmp/launch-http-approval-mailflow-20261023/fixture_presence_test.py so the active source manifest stays unchanged. R3-R6 remain below 200 unique lines combined.



## Final attempt e result

PASS on the final repaired helpers: units 80 runs/526 assertions; database integration 26/182; real isolated Mox protocol 4/424; authenticated HTTP review/approval, actual worker delivery and received MIME assertions 1/88. Zero failures/errors/skips. Steep and targeted lint exited 0. Two independent fleet Docker failure-injection suites each passed 3 tests (6 total). No host application tests ran. Final immutable disposable image `sha256:d28f317b972c2746bbc7a04cf662e548ec1bbe2e7d1b8bbff887670520647d65` is absent.

Final evidence directory: `/tmp/launch-http-approval-mailflow-20261023/source/ops/local/launch-http-approval-mailflow-20261023-e`. Before/after source manifests match. The supplemental presence test was separately mounted outside this source snapshot and binds to the same final fleet harness, with its own source hash in R6.

| Final e receipt | SHA-256 |
| --- | --- |
| result.json | a7267b8a044d90ad2fe84f4c4b03359a753473e433624d62593c0b38c0adb4f2 |
| cleanup.json | 01b433a151f1c5192f8cc9de21cf04b81a55105f5212a27abba694800a402c99 |
| immutable-image.json | 8b49ae36437cac564daf9767453f849adfa72b3db7ae8f4c0d3390dc28878d87 |
| independent-absence.json | 56c3fe1f50b1036edb0262d141b05d95036f4a9f3df419a2e1f617d29794c05d |
| source.sha256.json and source.after.sha256.json | 8a7d8dc6bc374851c20d87dcb37074c9e3ec00a85f932a2155d68be65851c2cf |
| 047-ruby-mox-app-chain.log | 9bf2563f362eb19b6f974b6eb5dd08e1da76854a14fa9d51494e57dc9344b304 |
| 038-ruby-mox-protocol.log | 459162daf3010e5627756e87e92209725b79398b44ae3e5d8228d4d7609ba691 |
| 015-targeted-units.log | 05a40fca3b1a96b5f9648dc02ca072ed9e5b30613cd67eaea1a92581f68d0f88 |
| ../fixture-finally-regression.log (task root) | 33060fd73862c5e1af97335504d5b45211fce6d229657f556d8deceeadc52ce4 |
| ../fixture-presence-regression.log (task root) | 199ba496f288116d36c62f29346d4fbf0bd75745a1c893abfcbdaa4c6d5b1033 |

Independent inspection under the common flock found every a-e project container, network, volume, builder container, builder cache volume and immutable server image absent. All five private fixture trees and both credential env files per attempt are absent. Attempt d's recovered image was `sha256:b1144af89f46e11eb0441d5e1be8df0ef9ecb5ef25d5db9716f15c8ab406187e`, also absent. Sources, reviews and evidence are retained. No global prune occurred. Final task Docker storage retained: zero; shared before/after totals unchanged (images 103.9GB, containers 4.886GB, volumes16.81GB, build cache4.62MB), so exact reclaimed bytes are not separable from rounded shared totals. Independent final host available space: 71,697,043,456 bytes. Shared prerequisite images and other owners' workloads remain intact.

The result closes HTTP approval coverage for this frozen isolated baseline. It does not certify concurrent OIDC changes, scheduler discovery, browser/UI/TLS acceptance, external deliverability, broader threading graphs or universal exactly-once delivery. Production activation, sends, warmup and release gates remain held.

## Cleanup-only final refinement after e

The dedicated final cleanup design receipt (`launch-http-approval-final-cleanup-design-review-20261023.md`) reviewed 365 authorized LOC and found one confirmed MEDIUM (2.74/KLOC): ignored nonzero removal could leave a fixture while deleting its private data. It also raised a conditional expired-budget risk. Inspection of `ops/tests/be02/docker_task.py` confirms Task.docker rejects an expired deadline even in cleanup mode, so that condition applies. Both are repaired: a fresh cleanup budget precedes the outer presence lookup, and exact fixture absence is required after removal before private data deletion. Ownership guards remain unchanged. The earlier interrupt/unlink bypass was accepted as repaired; this is additional failure-path coverage.

Final source is distinct from e's preserved manifest. Only the following harness/test overlay was placed at `/tmp/launch-http-approval-mailflow-20261023/final-harness/`; frozen build source and e receipts were not overwritten.

| Final delta packet | Inclusive lines / LOC | SHA-256 |
| --- | --- | --- |
| D1 fleet_protocol.py | 79-123 and 286-304 / 64 | 1d35e647cf69db9d2f88a24f6545268518af539e36c82df7fefb267c0b9afe06 |
| D2 fixture_presence_test.py | 1-64 / 64 | c9e6bee24568462a2e17914cc4c3d309c7ccc133f3ef0fb1b231fae1a522146f |

The coordinator's final reviewer uses wider context ranges 78-128 and 280-310 plus the 64-line presence test: 146 unique LOC, each packet below 200 and reviewer below 400. R3's 305-line hash above is the e harness, not this final 310-line harness; R6's 42-line hash is historical, superseded by D2.

Five final mocked Docker regressions PASS under the shared fleet flock: absent fixture, present fixture, wrong owner retained, non-raising unsuccessful removal retained/reported, and expired helper budget refreshed. The deadline regression directly exercises clean_fixture; outer-budget activation is source-reviewed, not a mocked full-main execution. Three independent-finalization regressions also passed: eight distinct focused tests overall (the earlier three presence cases are a subset of the final five). No full application rerun was requested for these cleanup-only changes; e remains runtime evidence for unchanged Ruby mailflow code and the prior harness. Final log `/tmp/launch-http-approval-mailflow-20261023/final-harness-regression.log`, SHA-256 `0f7e4b97443e54aca647179972594d13bb587afcbf151fab8228148587ea844a`. Final source manifest is retained beside it as `final-harness-sources.json`.

The focused container used --rm, no network, read-only source mounts and no disposable volume/image build. It retained no Docker resources. Exact a-e absence and task cleanup evidence above remain applicable; retained final source and logs contain no generated credential files. Whole-run exception preservation beyond the independently tested finish_fixture helper is not certified, and no Obsidian simulation is claimed.

Final delta receipt: `launch-http-approval-cleanup-delta-review-20261023.md`, task task_72baafbe5712 / dispatch ctx_1cf745d679c3. Static PASS, 146 unique LOC, zero new actionable defects (0/KLOC), exact final hashes matched before/after review. It accepts both targeted corrections and explicitly preserves the helper-runtime versus outer-static boundary. Combined with the exact-hash five-case Docker result, this completes the authorized narrow cleanup repair verification; coordinator retains final acceptance and central documentation ownership.
