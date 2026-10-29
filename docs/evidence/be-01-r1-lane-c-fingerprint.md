Latest parent checkpoint (2026-10-12): frozen 9-file repair uploaded and verified; hash-only orchestration comparison passed. Parent fleet-02 synthetic Docker run PASS: test_exit=0, cleanup_failed=0. Evidence: `/home/tanzeel/elevateo-mail-tests-20261012-ultra/be01tools-224ed9b8-dda2-4b0a-8d86-f8dd8159d443.Iq4dbB`. Independent exact task container inventory empty. Both bounded and design reviews complete: 173 unique LOC, zero defects, 0/KLOC (coverage is not doubled across reviews). Actual full app runner is active; its result, actual Compose acceptance and final cleanup remain pending. Frozen source, scripts and manifests unchanged; this update records parent evidence only. Earlier pending-review/synthetic statements below are historical.

# Lane C OOM fingerprint repair — frozen review packet

Parent actual app build succeeded as sha256:7b4c78a17d14583226d95a20b499ff262f786717ad61b8dc08fe0589eb36346a; baked source test passed exit 0. Child be01r1-466ce081-b90e-4570-96fc-7a61076877c3 (evidence suffix .tjKRwX) failed fingerprint verification and retained tool bc96a77c016929dbbdb1a7b4c7683ee1e9cfc4aab98d4ce3434e57d9d4c36817. Parent builder/cache cleanup succeeded. Parent subsequently recovered the exact child container and referenced app image; inventories empty, only default builder remains. No reclaimed-byte claim.

Parent Docker reproduction confirmed ONLY HostConfig.OomKillDisable false -> null after create/start-ai. Evidence: fleet-02:/home/tanzeel/elevateo-mail-tests-20261012-ultra/attach-diagnostic-20261012/{before,after}.json. Diagnostic SSH exit 0; exact stopped/no-mount/label-verified container removed. This supersedes the attachment/StdinOnce hypothesis.

The inspector requires OomKillDisable false or null, normalizes only that property to false, and rejects true or malformed values. Full Config and HostConfig fingerprint coverage and all previous profile gates remain. The broader draft was discarded. Regression covers both equivalence directions, exact-ID removal, 13 drift cases including true/string OomKillDisable and attachment/security changes, plus the existing 13 invalid-profile cases and replaced-ID refusal. No cleanup bypass.

Parent independent jq/regression review: 136 LOC, zero defects, 0/KLOC; helper/design review pending. Revised Docker tests pending. One confirmed runtime defect repaired in source; no actual Compose acceptance claimed.

## Exact changed execution files

| File | LOC | SHA256 |
| --- | ---: | --- |
| ops/tests/fleet02-egress-inspect.jq | 34 | 0e863475a3fa1d4dfc0edd557f947b5945ab750b1b12607b1adb53fcaa18acb2 |
| ops/tests/fleet02-egress-regression.sh | 102 | c1b2491574bf8d5bb5dc4a12818c65e4746fe3a3e4726afc2ed41843ca93e25e |
| ops/tests/fleet02-egress-package.sha256 | 10 | 0f053e266d389e4a97f359be74b2b4b9ad1251c07178a6e6bbbca32b461bc616 |
| docs/evidence/scripts/be-01-r1-fleet02-compose-egress.sh | 83 | 2be555fec4cceec27165195ad32d55db52bb0d3bce5f2ffeb6ab14ae71041bec |
| ops/tools/lane-c-synthetic/parent-run.sh | 78 | 384ee6e91fdb789a3f85d856b0565e1f73dd69b99f6649f94f7356561549479b |
| ops/tools/lane-c-synthetic/tools.sha256 | 8 | fc5c5659b7e3562a66bc99af482cbbbae4f55827a5cb1dbbcec664d8aad92dcf |
| ops/tools/lane-c-app/parent-run.sh | 84 | 220b8b3eb78ea952d6208a549b320914ade26fb3af63da33ee117d3a105b154d |
| ops/tools/lane-c-app/app.sha256 | 3 | 2ae9ce0fe7f92885617dae82b295c52b0dca736844ce5b02a8e1af9d41c712c8 |

Relative to previous freeze: inspector +3/-1; regression +44/-2; driver +1/-1; tools parent +2/-2; app parent +3/-3; package manifest +2/-2; tools manifest +1/-1; app manifest +1/-1. Code total +53/-9; manifests +4/-4. Documentation separate. Entrypoints change pins only. Resources helper unchanged at c4ce5cf3ada3c2bebe92d3557c82d7de92bdef27738603a182e32f5272e8a363.

Static hash inspection confirms all three revised manifests match their package bytes. Source manifest remains 03d590ddaa39b22c6b1851c9911405473c0b01b0a50fff08001144e66a14638b: 33 exact local matches, 19 CRLF-only differences, zero other differences. Do not repin or replace canonical staged source. Stage only the eight files above with exact bytes; no product, Compose override, adapter or tools cleanup implementation changes.

## Parent checks after review

Authenticate the eight files above and verify all manifest entries. Keep canonical source immutable/readable, three app entrypoints executable, strict TOOLS_HOST=Ubuntu-noble-latest-amd64-base and independently verified local Docker context. Keep all five Compose images, pinned Ruby and pinned BuildKit present; no Lane C pulls.

Use the socket-free capped Docker command in be-01-r1-lane-c-app.md with a reviewed immutable tools image and its /tmp rw,exec,nosuid,nodev fixture mount. Replace its inner bash payload with:

```bash
bash -euc 'bash /src/ops/tools/lane-c-synthetic/checks.sh; for f in /src/ops/tools/lane-c-app/*.sh; do bash -n "$f"; done; bash /src/ops/tools/lane-c-app/regression.sh'
```

This includes all five synthetic groups and existing syntax checks, plus app syntax/synthetic checks. If a tools image needs rebuilding, use the revised authenticated tools parent lifecycle. Parent independently checks exact cleanup on success/failure/timeout.

After review and Docker checks, use the app handoff environment and `bash ops/tools/lane-c-app/parent-run.sh` to rebuild the disposed app and rerun actual Compose. Record exit status, child evidence and resource inventories. Actual Compose and PowerShell acceptance remain pending. No host tests, local Docker, remote execution, ultrareviews, commits or pushes performed by this author.

