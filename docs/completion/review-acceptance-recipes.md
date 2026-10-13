# Acceptance recipes and cleanup bounded review

Task: task_17dcf7177032; dispatch: ctx_d74308158df6. Date: 2026-10-14.
Reviewer: Codex, GPT-6 family as exposed by session instructions; exact serving model variant and reasoning-effort setting are not independently exposed. No named-model identity is inferred.

## Scope and verdict

Static bounded review completed; no confirmed new defect in the assigned 343 physical lines. This is not runtime approval. Runtime, tests, Docker builds, sandbox verification, manual UI validation and cleanup execution: **NOT_RUN**. No source changes, installs, subagents, fleet commands or commits were performed. Only this report was written.

Hashes were verified before inspection against the supplied handoff/task, with one separate read/review pass per file (all under 200 lines):

| Root | File and exact range | LOC | SHA-256 |
| --- | --- | ---: | --- |
| BE02 | ops/compose.acceptance-test.yaml:1-143 | 143 | 215D985A3D9B6831DBBE2AC60A4DE7C615DD832769694BBB222EB25D7DF321E3 |
| BE02 | ops/tests/be02/cleanup.py:1-107 | 107 | 9D4610004BA76922D4E2BC05D47BFECC270E86D7B649C5E38B7B04A6AA0C8654 |
| Coord | ops/acceptance/browsers.Dockerfile:1-93 | 93 | DBC9D8AA333F2482F2AD3EF01B5F9C92A22D35EA0B797630E389DB71D4A14F5B |

BE02 root: C:/Users/Tanzeel/Code and projects/Elevateo Mail - BE02 Codex. Coord root: C:/Users/Tanzeel/Code and projects/Elevateo Mail - Local Completion. Unique implementation/test LOC: 343; tests inspected: 0. Confirmed defects: **0**; defect density: **0 / 0.343 = 0.00 defects/KLOC**. This denominator excludes contextual documentation. Both roots' AGENTS.md and STANDARDS.md and the named acceptance-runner handoff were read as context; general status documentation was consulted with truncated output and is not claimed as fully reviewed.

## Checklist and evidence

- Sandbox/resource configuration: Compose 2-18 establishes nonroot host IDs, read-only filesystem, capability drop, no-new-privileges, explicit seccomp, 2 CPUs, 3 GiB RAM, 1 GiB shared memory, PID cap and bounded tmpfs. Grid overrides only user and executable/environment while retaining these controls. Web has its own smaller CPU/memory/PID limits, nonroot user and no published port. Actual kernel/user-namespace and browser compatibility are unproven.
- Seed ownership: Compose 34-52 explicitly replaces inherited tmpfs owner IDs and grants the private directory only to the seed. Browser receives two individual read-only files and its output bind; Grid/web receive none of those binds. Base fixture controls and inherited mounts are outside this assignment.
- Secret separation: no literal application credential appears in these recipes. Seed receives the session key through required interpolation; browser environment contains configuration rather than privileged material. Dockerfile 7-9 copies only acceptance paths, but COPY of the whole acceptance tree requires the handoff's external dotenv/source checks. Root build-context exclusion cannot be certified from these files alone.
- Download failure handling: Dockerfile 19-50 fixes URL/length/hash; refuses redirects, non-200/missing body/incorrect content length, overflow, truncation and hash mismatch. A separate hard timer covers a stalled stream/write. Extraction is in a dependent build stage, so failed verification cannot produce its input layer.
- Complete extraction: Dockerfile 62-77 iterates every archive member, rejects absolute/traversal/duplicate/out-of-root names and nonregular/nondirectory file types, restores execution without setuid/setgid bits, and keeps the whole extracted tree. Final stage copies the whole tree and checks the browser executable. Archive metadata/source pins were supplied as independently verified; no independent archive/API inspection is claimed here.
- Cleanup failure handling: cleanup.py 16-20 records each ordinary exception and 103-105 continues independent cleanup categories. Container mounts are all validated before removals; unknown services, ports, bind permissions, volume names/owners and mount types refuse removal. Acceptance-specific validation is delegated outside this slice.
- Cleanup scope: builder identity and cache destination are checked; only exact named/labeled volumes and the exact empty network are candidates; volumes with consumers refuse removal. Images with foreign tags refuse removal and image removal is non-force. No broad prune or recursive filesystem delete appears here. Docker/helper inspection correctness and authoritative ownership registration remain dependencies.
- Empty/malformed inputs: empty discovered resource sets naturally produce no removals; missing dictionary fields and malformed registry JSON become captured errors rather than deletion fallbacks. The container count is bounded locally; subprocess/output/time bounds depend on Task helpers. Required Compose variables reject absence/empty values, but numeric UID/GID validity depends on external guards.
- Maintainability/design: three files each retain a bounded purpose. Cross-file ownership and browser-pin couplings have explanatory AIDEV notes. No speculative abstraction or hot-path query concern was identified in this one-shot harness. Formatting is left to linters.
- Tests/documentation: the handoff documents ownership, fixed archive tuple, staging exclusions, failure behavior and incomplete runtime evidence. No test source was assigned; happy-path, two-failure-path, regression coverage and test outcomes are **UNVERIFIED**, not passes.

## Numbered defects

None confirmed in this scope. No speculative issue is counted as a defect.

## Design limits and unchecked dependencies

1. cleanup.py:106 can raise while writing cleanup.json. The task explicitly assigns missing-finalizer handling to the separate run.py reviewer; this report neither duplicates that finding nor certifies the caller's finalization. A full disk/evidence-write failure must be included in root lifecycle validation.
2. docker_task.Task, SERVICES, project_containers/inspect/docker/write, acceptance_cleanup.validate_container/private_files, acceptance registration and allowed-image provenance were not inspected. This report cannot certify complete cleanup safety without those reviews. In particular, external helpers own timeout bounds, empty-ID inspection behavior, image identity, label provenance, private-file ownership, and consumer rechecks.
3. Base Compose fixture/network/image configuration, seccomp file, Dockerignore/override guards, build invocation arguments, seed code and browser launchers were not inspected. No claim is made that the configured limits or sandbox actually work on fleet. Seed tmpfs size/inherited service limits require root integration evidence.
4. The fixed archive digest constrains extraction to one independently verified input. This is not a general-purpose hostile ZIP extractor: no generic expanded-byte/member-count quota is implemented. Adding generic archive machinery is not justified by the immutable input contract; changing that contract requires renewed review.
5. Best-effort independent cleanup trades immediate total deletion for fail-closed preservation on mismatched resources; retained-resource reporting and host-space reconciliation remain root responsibilities. No Obsidian connection or deep-design simulation was invoked under this read-only worker assignment.
6. No Docker resources were created or deleted; attributable reclaimed space is 0 bytes. Runtime cleanup, shared-image retention and host-space recovery remain NOT_RUN.

Root follow-through: combine bounded dependency reviews with the frozen fleet execution evidence, including negative download/archive cases, nonroot seed access, all selected browser sandboxes, malformed ownership/mount retention, and failure during cleanup evidence writing. Do not publish on this static report alone.
