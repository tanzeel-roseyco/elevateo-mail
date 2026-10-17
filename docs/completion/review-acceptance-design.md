**Acceptance repair: dedicated design review — 2026-10-14**

The recorded host UID/GID design is coherent for private seed/browser binds, and retaining files when cleanup cannot prove safety is appropriate. The inspected container validator has **two MEDIUM defects**: it does not enforce the approved sandbox policy or several declared resource ceilings. These are static findings, not observed runtime failures; runtime, application acceptance, and repair verification are **NOT_RUN** here.

Task `task_3767ddf637e3`; dispatch `ctx_248e6fed8164`; worker `term_048b7825-68a8-45cb-9371-f00241824aea`. Actual Orca-reported model/effort: **Codex / gpt-6-astra / max**. `orca orchestration worker-show` reported that effective launch selection and the live terminal preview agreed; separate provider-server attestation was not collected.

**Scope and source authentication**

Source root: `C:\Users\Tanzeel\Code and projects\Elevateo Mail - BE02 Codex`. Report/context root: `C:\Users\Tanzeel\Code and projects\Elevateo Mail - Local Completion`.

All SHA-256 expectations came from `docs/completion/acceptance-runner-handoff.md:101-105`. Full-file hashes and physical line counts matched before implementation inspection; the same hashes matched again after the review. Blank lines and comments count as physical LOC.

| File under source root | Full-file LOC | Inspected lines | Reviewed LOC | Verified SHA-256 |
| --- | ---: | --- | ---: | --- |
| `ops/tests/be02/acceptance_runtime.py` | 249 | 1-100 only | 100 | `17B5AD47118C586879A4EFDA9BB57C621DA193E023F1875C8112F86E79DC62C4` |
| `ops/tests/be02/acceptance_cleanup.py` | 99 | 1-99 | 99 | `E64811160C2F4950EABE149AB0FA2F0E4A115A194CA3E53C1EE81D3B1D5D867C` |
| `ops/compose.acceptance-test.yaml` | 143 | 1-143 | 143 | `215D985A3D9B6831DBBE2AC60A4DE7C615DD832769694BBB222EB25D7DF321E3` |

Pass 1 inspected runtime 1-100 plus cleanup 1-99: **199 LOC**. Pass 2 inspected Compose 1-143: **143 LOC**. Total: **342 unique implementation/configuration LOC; zero test-source LOC**. No implementation outside these ranges was inspected. Instruction/context documents are excluded from the denominator. Applicable parent/project AGENTS instructions, both project standards, the named handoff, and relevant planning/current-state context informed the review. Formatting is delegated to linters.

**Numbered defects**

1. **MEDIUM — the security-option predicate accepts a different sandbox policy.** Evidence: `acceptance_cleanup.py:34-40` accepts any option starting with `no-new-privileges` and any `seccomp=` value except the literal `seccomp=unconfined`. Runtime lines 66-75 authenticate a particular staged policy, but this validator never binds the inspected container's effective policy to that authenticated input. Keeping every other inspected field valid, an option containing a permissive seccomp policy passes the predicate. The prefix check also does not distinguish enabled no-new-privileges from a false or conflicting value. This defeats the promised rejection of isolation drift even though the authored Compose file requests the intended settings.

   Minimal repair: normalize the engine's supported inspection representation, require enabled no-new-privileges without conflicting values, and compare the effective seccomp policy with the approved policy content or its canonical digest. Do not merely reject one spelling of an unrestricted policy. Required regression cases: valid approved configuration, false/missing no-new-privileges, and a different permissive seccomp policy. Engine normalization and browser sandbox operation still need Docker evidence.

   Ownership: this overlaps the runtime review by dispatch `ctx_365d0d65bc83`; the coordinator confirmed an exact-policy repair is planned. Count it once in aggregate review accounting.

2. **MEDIUM — declared PID and tmpfs limits are not verified before start.** Evidence: Compose lines 13-17 declare the browser/Grid limits, including 512 PIDs and a 512 MiB `/tmp`; web lines 65-67 declare 128 MiB, one CPU, and 64 PIDs. `acceptance_cleanup.py:26-30` checks only a shared memory/CPU upper bound, and lines 50-52 check tmpfs destination names only. It never reads `PidsLimit` or tmpfs size/options. Therefore an otherwise valid inspected browser with an unlimited PID setting and an enlarged `/tmp` passes; a web container above its declared per-service memory/CPU budget can also pass the shared bound. The global memory bound remains useful, but it does not establish the declared resource envelope.

   Minimal repair: validate the resolved per-service PID/memory/CPU policy and required tmpfs destinations/options/ceilings, using a small explicit policy table or existing resolved policy data. Keep inherited seed settings within their separately reviewed contract; no new resource-management framework is needed. Required regressions: valid settings, unlimited/excessive PID limit, missing/enlarged `/tmp`, and web limits exceeding its declaration. The coordinator confirmed these ceilings are included in the pending repair.

Defect count for this bounded review: **2 MEDIUM; 0 HIGH; 0 LOW**. Defect density: **2 / 342 × 1,000 = 5.85 defects/KLOC**. These are local review findings, not two necessarily new aggregate issues. The coordinator owns deduplication and the `code-reviews.md` ledger; this worker is authorized to write only this report. No repair is claimed closed.

**Checklist against the purpose and standards**

| Area | Static assessment and limit |
| --- | --- |
| Host identity versus fixed image identities | Consistent in scope: runtime 61-65 records effective IDs and checks source ownership; cleanup 10-15 rejects absent, boolean, zero, and negative IDs. Compose gives seed/browser those IDs, overrides seed temp ownership, and leaves web/Grid fixed. |
| Empty, invalid, and maximum inputs | Runtime 49-59 rejects empty/duplicate/unknown CLI selections and bounds dispatch identity to 80 characters; allowed sets bound the lane/engine count. The seccomp file is capped at 256 KiB before parsing. `None` private state and an absent directory cause no deletion. A malformed Docker/JSON object may raise rather than return a tailored diagnostic; failure reporting belongs to the uninspected caller. |
| Private fixture lifecycle | Cleanup 68-99 checks the exact canonical directory, recorded ownership, mode 0700, regular single-link files with allowed names and mode 0600, and absence of consumers before unlinking. It validates every entry before beginning file deletion. Publication and setup code are outside coverage. |
| Mount least privilege | Compose exposes only two read-only fixture files plus one writable output directory to browsers. Grid/web have no declared binds and runtime 97 registers empty bind sets for them. Cleanup requires allowed bind tuples and rejects volume mounts. Full seed/browser registration continues beyond runtime line 100 and was not inspected. |
| Sandbox and bounded resources | Findings 1 and 2 remain open. Nonroot users, read-only root filesystems, dropped capabilities, shared-memory bounds, and Compose settings are visible; effective browser sandbox startup is unproved. |
| Secrets and failure evidence | Cleanup 53-65 rejects designated privileged environment names and generated fixture-secret values; the Grid exemptions are exact public defaults. Compose disables service logs. Safe stage/result export and failure-finalization behavior are outside coverage; disabling raw logs trades diagnostic detail for secret containment. |
| Source immutability | Runtime 64-87 checks source ownership, the profile hash, required inputs, and build-context exclusions/override refusal. These checks do not themselves freeze all source. The handoff describes before/after source inventories, but their implementation was not inspected. |
| State coupling and maintainability | Recording identity once and using it for pre-start checks and deletion avoids a second ownership authority. Small helpers and explicit lane lists fit the bounded task; no speculative abstraction or broader redesign is recommended. AIDEV comments explain ownership and image-wrapper decisions. |
| Tests and documentation | The handoff explains staging, ownership, failure evidence, and limitations. Runtime 28-31 names eight unit entrypoints, which does not prove their contents, execution, or coverage of these predicates. No tests were inspected or run; current-state documents contain historical checkpoints, not evidence that this repair passed. |

**Design tradeoffs and concrete static failure schedules**

The schedules below are analytical traces of the inspected source plus explicitly identified coordinator contracts. They are **not executed simulations**. The Obsidian connection is unavailable for this assignment; no Obsidian-backed simulation is claimed.

| Schedule | Expected behavior and minimal alternative |
| --- | --- |
| Host UID 1001, a different nonzero GID, private directory 0700, files 0600 | Seed/browser use the same recorded UID/GID, so private access does not require permission broadening. Grid 1200:1201 and web 10001:10001 need no private access. Reverting the browser to fixed UID 10001 would conflict with host-owned 0600 files; chown/sudo or world-readable fixtures would introduce unnecessary authority. Retain the recorded-ID design. |
| Seed aborts with no file, or after publishing only one valid final file | Once containers are removed, cleanup can remove an empty directory or the one valid file and directory. An unexpected temporary entry, wrong mode, symlink, or extra hard link causes retention before any file unlink. This favors preservation over automatic completion; the seed's partial-publication behavior is an unchecked dependency. |
| A seed/browser container exists but never starts, or another consumer remains | A nonempty project inventory or global private-path consumer query prevents deletion. The coordinator confirms failed/timed-out queries raise, so an unavailable Docker daemon does not become an empty-consumer result. Retrying exact cleanup after reconciliation is preferable to recursively deleting the private directory. |
| A process stops after deleting the first valid fixture file | Cleanup may leave the second file and directory. On a later call with the same recorded identity and no consumers, the remaining valid entry can be checked and removed. This is resumable partial progress within a surviving task object, not a proved restart/recovery facility. Missing identity must continue to retain data. |
| Container settings differ from the reviewed Compose policy | A permissive seccomp policy or unlimited PID limit can satisfy the current predicate, as described in findings 1 and 2. Exact semantic verification is a small repair; weakening the declared sandbox or increasing resource limits to obtain a pass is not justified. |
| Browser start, suite, or evidence publication fails | Logs remain disabled in the declared acceptance services. The handoff promises safe stage/exit metadata, later-lane attempts where safe, source rehashing, and final cleanup; the surrounding orchestration is uninspected. Preserve secret-safe stage/status evidence and verify failure finalization in the root run instead of enabling unrestricted browser logs. |

The underlying ownership assumption is an identity-preserving bind-mount mapping. Matching container UID/GID numerically to the host is not proof of compatibility with Docker user-namespace remapping or a rootless daemon. Nonroot container processes and a browser's namespace sandbox are also distinct from a rootless Docker daemon. Verify the fleet's actual mapping and user-namespace support; do not claim support for an untested daemon mode.

Cleanup is an exact, conservative operation, not a transaction with Docker or a lock against another process with the same host/Docker authority. A new consumer or path replacement between checks and deletion remains outside its guarantee. The documented frozen staging area and single lifecycle owner are appropriate prerequisites; defending against a hostile Docker administrator would require a different trust boundary, not extra pathname checks. Likewise, before/after hashes detect retained changes but cannot prove that no transient change occurred during execution.

**Coordinator-provided contracts and unchecked dependencies**

The response to this dispatch's orchestration question confirmed that no additional guaranteed validator closes findings 1 and 2. It also states that `Task.docker` defaults to `required=True` and raises on timeout/deadline/nonzero status; `project_containers`, inspect calls, and the private consumer query use that required behavior. Those are coordinator-provided contracts, not source independently inspected here. The coordinator identifies `docker_task.py` as separately reviewed by dispatch `ctx_04825b137441` and assigns cleanup-callback diagnostic-write failure to a separate finalization repair. Neither finding nor repair is re-reviewed here.

Unchecked implementation dependencies: runtime lines 101-249; `docker_task.py`; base Compose and its seed inheritance; the main runner/finalizer; seed creation/publication; browser and proxy image recipes; seccomp contents beyond the inspected loader's checks; shared acceptance schemas/reporters; browser launchers, tests, screenshot filtering, and result completeness gates. The duplicate-scenario gate mentioned by the coordinator belongs to the separate runtime review. A full before/after source inventory, case counts, actual UI behavior, and runtime cleanup cannot be certified from this slice.

Root-owned verification still needed: Docker lint/typecheck and targeted regression evidence for the repaired predicates; UID/GID and mount inspection; every selected browser's sandbox startup without fallback; seed/create/start/test/timeout failure schedules; query-failure retention; safe failure artifacts; source comparison on success and failure; and exact cleanup reconciliation. Tests, Docker, SSH, web servers, dependency installation, subagents, commits, and source edits were not performed by this worker. Disposable resources created/deleted: none; reclaimed space: **0 bytes**. Only this report was written.
