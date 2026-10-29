# Lane P gem activation repair — frozen for parent review

Runtime failed before assertions: SSH exit=1, test_exit=1, cleanup_failed=0. The exact 9 tests / 48 assertions / zero skips oracle was not reached. The image built and reported Ruby 3.4.11 and PowerShell 7.4.20. The explicit gem-activation prerequisite passed, but the separate Ruby process loading egress_test.rb failed at line 4 with LoadError for minitest/mock. Process-local gem activation is not inherited by child Ruby; the precise implicit RubyGems resolution mechanism was not separately reproduced.

Remote evidence: fleet-02:/home/tanzeel/elevateo-mail-tests-20261012-ultra/be01pwsh-cf80692c-6f47-4837-8cdc-4ac743eaf0da.kMAkUI. Staging evidence: lane-p-stage.OYbuFj under the same parent. Full console: lane-p-console.log. Local copies: [checks](lane-p-runtime/checks.log), [console](lane-p-runtime/console.log), [space](lane-p-runtime/final-space.txt).

## Exact cleanup and reservation

Independent read-only inventory completed exit=0. Exact names, nonce labels, runtime/syntax containers, cache volume, image tag and immutable image ID were absent; Buildx registration was absent. Parent independently confirmed only the default builder remains and shared bases are retained. No uncertain task resources remain. Backend reservation is released to frontend r8; no further Docker execution until parent returns it and reviews this repair.

Removed image: sha256:87addaecf2c591470654808bacd3363154c116764fd2b2b5621e5076678adc9e. Removed builder container: 3f08440394ba31926074fbfd006fabb5e8e890fcaa34c5c744bea36856160407. Exact cache: buildx_buildkit_be01pwsh-cf80692c-6f47-4837-8cdc-4ac743eaf0da-build0_state. Independent inventory files in the evidence directory include final-containers, final-volumes, final-networks, final-images, final-builders, label-* and shared-images-retained.json.

Available host bytes: 272903950336 before, 272911241216 after (+7290880). This is a shared-host observation, not an attributable reclaimed-storage claim. Persistent data and shared images were retained; no broad prune.

## Narrow repair and regression prerequisite

The tools image now sets RUBYOPT to load a read-only image-local gems.rb that activates the three exact pinned versions in every fresh Ruby process. Frozen product/test/harness bytes and the canonical 52-file source manifest are unchanged. No extra gem, version upgrade or test-source workaround is introduced. The authenticated build context includes this one new file.

checks.sh now starts a fresh Ruby process with the same require sequence as the frozen test (minitest/autorun followed by minitest/mock), without inline gem activation. It checks all three activated versions and Mock availability before invoking the unchanged harness. This prerequisite is separate from the required nine-test oracle. Missing bootstrap, missing gem or wrong version fails before acceptance. Docker execution and compatibility remain pending; no host tests were run.

## Frozen LF files

| File | LOC | SHA256 |
| --- | ---: | --- |
| ops/tools/lane-p-protocol/Dockerfile | 30 | 815122c2b11123910e890218c6344bd7250eb34d322891a29cb50bd9f7e97ad0 |
| ops/tools/lane-p-protocol/checks.sh | 22 | 1d67265211561f1e490db657acbf1bc294876157cb292b134428314ee3078f27 |
| ops/tools/lane-p-protocol/gems.rb | 5 | 47cb5b490e706b30d962b85c961f2b72875a4df4ecf16c35449a8fca8b025b55 |
| ops/tools/lane-p-dispatch/parent-run.sh | 83 | 091abb67db93b235655520115f51f7dd245f4479ae76e99c4239c3e7b7c6d114 |
| ops/tools/lane-p-protocol/package.sha256 | 4 | a86ec51727ac71f3984ef7d5f13649afe2b95c8e1dc719468d357799a34abb1b |
| ops/tools/lane-p-dispatch/dispatch.sha256 | 11 | 4509ce8417eb93167847a67093b435eb000e11b1e82755e8ddcd0803402cdb25 |

Bounded review packet: 140 executable-file LOC, 155 including manifests. Against the previous freeze: 22 inserted / 5 removed executable lines and 8 inserted / 6 removed manifest lines. Independent bounded code and dedicated design reviews both PASS: zero confirmed defects, 0/KLOC; overlapping coverage counted once. All six hashes match. See be-01-r1-lane-p-rerun.md for the prepared archive and commands. Earlier zero-defect reviews apply only to their recorded hashes.

## Proposed next sequence — not authorized to execute yet

Parent has reviewed these six files; after frontend returns reservation, stage only these authenticated LF bytes into the existing canonical source tree. Verify the new dispatch manifest against the external hash above, all its entries, package manifest and unchanged source manifest 03d590ddaa39b22c6b1851c9911405473c0b01b0a50fff08001144e66a14638b. Preserve existing source files and provenance. Repeat UID readability and Docker-only syntax gates using the existing capped workflow. The staging archive allowlist must include gems.rb; do not reuse the old archive/hash.

Run the same parent dispatcher with TOOLS_CONTEXT=default, TOOLS_HOST=Ubuntu-noble-latest-amd64-base and the documented source/evidence paths, only after daemon and pinned base/BuildKit checks. Capture fresh prerequisite output, exact nine-test oracle, exit/cleanup status and independent inventories/host bytes. No rerun has occurred. Linux pwsh evidence remains distinct from native Windows and actual PowerShell Docker orchestration; this does not complete BE01. No ultrareviews.
