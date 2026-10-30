# Acceptance runtime bounded repair

Status: AUTHORED / NOT_RUN. Task `task_510a4d677c0a`, dispatch `ctx_4509eef36c90`.
Requested execution identity: Astra LOW; model identity was not independently attested by this worker.

## Scope and changes

Read `review-acceptance-runtime.md` and `review-acceptance-design.md` and the applicable project instructions and source anchors. This repair addresses their overlapping security-policy finding and the duplicate/missing scenario finding. Root owns deduplication and the review ledger; no new independent review or defect-density measurement was performed here.

- `acceptance_cleanup.py`: service-specific frozen memory, CPU and PID limits; exact tmpfs options and destinations; enabled no-new-privileges; browser shared memory and parsed seccomp equality against the authenticated approved policy.
- `acceptance_runtime.py`: retains the hash-checked policy for both validation call sites, parses every case through the existing strict case schema, then validates the selected run against explicit unique scenario identities.
- `acceptance_evidence.mjs`: 26 Playwright and four Puppeteer/Selenium identities, plus run/dispatch/lane/profile/implementation/attempt checks. Unknown identities, repeated identities, missing identities and nonpassing records fail closed.
- Two small regression files exercise valid policies and evidence, absent/disabled/permissive security, changed resource limits and tmpfs options, duplicate substitutions at unchanged counts, unexpected identities, missing records and profile/run mismatches.

The identity lists came from coordinator `tests/acceptance` producers and schema. Browser choice is validated against the lane; the case schema has no browser field. Browser executable/version checks and separate per-browser run IDs remain the existing runtime evidence. Sixteen unavailable Playwright cases remain unable to pass: this repair does not manufacture their implementation or acceptance evidence.

Frozen seed Rails tmp/log tmpfs entries have UID/GID/mode but no size option. This repair preserves that policy, without inventing new sizes. Limits must equal frozen Compose values, including inherited seed limits.

Coordinator-provided Docker 29.7.2 inspect evidence: `ops/local/acceptance-preflight-20261014/inspect-policy.json`, SHA-256 `482060F8DDBCC7C7EBAF20C0C600457E0942CEC3910AA4550819384527E060A0`. Its actual enabled option is `no-new-privileges:true`; inline seccomp is `seccomp=` followed by JSON. Its tmpfs value is `rw,nosuid,nodev,size=512m,mode=1777`. The validator uses these observed representations with parsed JSON content equality, without inventing option normalization. The coordinator supplied this evidence; this worker did not run the probe.

## Verification and remaining work

All tests, lint/typechecks, builds, Docker checks and application acceptance: **NOT_RUN**. Only source inspection, authoring and file hash/line-count reads occurred. No host tests, installs, SSH, Docker commands, subagents, commits or fleet mutations were performed. No Docker resources were created or removed; space reclaimed: zero.

The coordinator must run the regressions in its Docker allocation and perform actual-inspect integration validation and independent review. The finalizer is owned by another worker; `run.py`, frontend and other project state files were not edited. The root coordinator must synchronize shared state and review documentation when integrating.

## Coordinator-only regression commands

These are authored commands, not executed evidence. Run from the staged BE source root on the coordinator's Docker host, using already approved pinned images. Both runs are socket-free, network-free and disposable; preserve shared approved images and remove only task-created resources if interrupted. The Python run uses the already-approved Grid image's Python interpreter, without starting Grid.

```sh
docker run --rm --pull never --network none --read-only --cap-drop ALL --security-opt no-new-privileges=true --memory 256m --cpus 1 --pids-limit 64 --user 1200:1201 --mount "type=bind,src=$PWD/ops/tests/be02,dst=/work,readonly" --workdir /work --entrypoint python3 selenium/standalone-chrome:4.49.0-20260909@sha256:88dacdd42d93ab738bed045129376b2f965117c5f2e4710693e54695d531380d -B -m unittest -v test_acceptance_policy
docker run --rm --pull never --network none --read-only --cap-drop ALL --security-opt no-new-privileges=true --memory 256m --cpus 1 --pids-limit 64 --user 10001:10001 --mount "type=bind,src=$PWD/ops/tests/be02,dst=/work,readonly" --workdir /work --entrypoint node node:24.21.0-bookworm-slim@sha256:d6aa754f16b3197301076f047b5def2f02ea1dbbc2ca920407d46d7ec7f87b20 --test test_acceptance_evidence.mjs
```

Expected authored coverage: four Python unittest methods with mutation subcases and twelve Node test cases. These exercise the policy and parsed-record semantic gates; the full strict-schema integration remains an additional coordinator check.

## File manifest

Paths below are relative to the BE root. LOC means physical lines including blanks and comments; all five files total 528 lines. These are handoff identities, not a claim of independent review coverage. Original runtime review reported two defects across 348 lines (5.75/KLOC); post-repair independent defect count/density is NOT_ASSESSED.

| File | LOC | SHA-256 |
| --- | ---: | --- |
| `ops/tests/be02/acceptance_runtime.py` | 254 | `A7610F2387D643A961B5856A2F7B8F93BEFF2544F8ABE3A4F54EB08F26F0B77A` |
| `ops/tests/be02/acceptance_cleanup.py` | 123 | `9A5996CCD0224FA412B803D033BE4660AB1830CC684D9D06D6D3F243EEDE29DA` |
| `ops/tests/be02/acceptance_evidence.mjs` | 40 | `5EE48EFE830CB5841ABAC2F5E7562661CBCAD634E74F43056CB2B551343E01FF` |
| `ops/tests/be02/test_acceptance_policy.py` | 72 | `EAB59F7AE46ED466B2580042F3AF8FA4D18968B84C9823254B12689586127410` |
| `ops/tests/be02/test_acceptance_evidence.mjs` | 39 | `FE60B560D9A68E047387126FCA2623B3AD79C031C6D65E16A911DDDB2BE5A078` |
