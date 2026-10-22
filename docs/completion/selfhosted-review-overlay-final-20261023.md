# Bounded final overlay / initializer review Ã¢â‚¬â€ 2026-10-23

Task `task_70f796850232`; dispatch `ctx_710b7fae9a42`. Static read-only review; source unchanged.

## Exact coverage

| File | Physical range | SHA-256 |
| --- | --- | --- |
| ops/production/compose.mox.yaml | 1Ã¢â‚¬â€œ77 | 332835f35cb740c00e4a52e3411e2fbf726bcfd8f563cff8bb4364d84456855d |
| ops/production/README-mox.md | 1Ã¢â‚¬â€œ82 | 1a55ebca9248f6ed0149425ed707733557f3a15b89957da0fede2cab35414dab |
| ops/production/initialize/stage-final.sh | 1Ã¢â‚¬â€œ11 | c264cffa1fcde3558b00aba02bf0df1bbd2e1cbd10951158cd645ae4f6ebe2a0 |
| ops/production/initialize/quality.sh | 1Ã¢â‚¬â€œ5 | 995fbacde933db2020b625f91ff6b47b888d2e323f4aed63bdcafee7df601231 |

Total: 175 physical lines including 82 operational-documentation lines; 93 implementation lines. Each file is a packet below 200 lines. Guidance read: AGENTS.md, .planning/STANDARDS.md and current README/state/documentation context. No imported implementation or tests were read.

## Actionable findings

1. **MEDIUM Ã¢â‚¬â€ staging copy can escape the owned snapshot.** `stage-final.sh:4,7Ã¢â‚¬â€œ9` enters a fixed `/tmp` tree and hashes the source migration, but does not reject symlinked parent directories or an existing symlink at the migration destination. Ordinary `cp` follows a destination symlink to an existing writable file: a stale or contaminated snapshot can overwrite a file outside the staged tree even though the reviewed source hash passes. The fleet lock serializes cooperating runners; it does not constrain filesystem targets. Validate the canonical, owned stage and directory chain and replace the destination entry safely, rejecting symlinks; retain the pinned migration check. Regression cases should include a destination symlink and a symlinked migration parent, asserting no external mutation. This is conditional on an unsafe stage; no such stage was inspected or claimed present.

2. **MEDIUM Ã¢â‚¬â€ quality gate omits the named tenant test module.** `quality.sh:5` includes `test_tenant.py` in mypy/ruff inputs, but its explicit unittest invocation selects only `test_source test_admission`. Static typing, lint and compileall do not execute tenant regressions. Coordinator clarified that tenant tests require a database and the offline quality gate deliberately excludes them; full rehearsal and historical fleet tenant tests provide separate coverage. Do not add DB-dependent tests to the offline runner. Separate DB-gate evidence was not independently reviewed in this packet; this observation is not counted as a defect.

Defects: **1 MEDIUM**, **5.71 defects/KLOC** over all 175 assigned physical lines; **10.75 defects/KLOC** over 93 implementation lines. Overlay/configuration plus operational documentation: 159 lines, zero confirmed defects. Initializer scripts: 16 lines, one defect (62.50/KLOC); small denominator makes this unsuitable for project-wide inference.

## Mandatory rubric checklist and bounded conclusions

- Purpose, defaults and state coupling: outbound hold true, production activation false and send API false are explicit in the environment mapping. These mapping values take precedence over env_file; documented per-run `-e` overrides release only the one-off send worker. Inbound remains outbound-held. Base Compose merge cannot be independently verified without reading the excluded base.
- Null/empty/max inputs: required interpolation rejects unset/empty path and admitted-image variables; domain bounds and Bundle bindings are documented. Actual runtime validation of them is outside scope.
- Authorization and sanitization: profiles are correctly described as convenience rather than authority; every send requires separate approval and control release. No new published ports. Runtime control parsing, database authority and TLS behavior were not inspected.
- Protected mounts: read-only bind directories with `create_host_path: false`; uid 10001, read-only root, dropped capabilities, private network and no restart. Ownership/mode/no-symlink checks are operator instructions, not independently proven runtime preflight here. Stage filesystem validation is finding 1.
- Simplicity, module responsibility, naming, duplication and nesting: anchors share runtime/environment wiring without new services or nested orchestration; no actionable issue found. Long quality command formatting is left to tooling as required.
- Comments and documentation: non-obvious fixture metadata and activation semantics are explained. README describes bounded drain, unknown outcomes, rotation and preservation-first rollback; source enforcement is not established by documentation alone.
- Tests, happy/failure paths and regressions: no tests read or run by assignment. Named quality command has contingent observation 2; test contents/coverage and separate gate results remain unverified.
- Performance and resource use: no query/loop hot path in scope. Bounded logs and one-pass worker prevent obvious unbounded service repetition; actual drain limits and inbound polling are outside scope.
- Standards/design: held-by-default overlay favors explicit operator intervention over unattended recovery; consistent with no live activation authority. This is a bounded configuration review, not independent deep design approval or full-project acceptance.

## Runtime and reporting limits

No tests, Docker commands, builds, secrets, cloud/DNS access or nested workers were used. No actual deployment, UI, environment resolution, permissions or source execution was validated. No Obsidian connection was used: no deep architectural recommendation or simulation was performed. Findings were immediately enqueued to coordinator, implementation owner `ctx_6594097677c5` and initializer owner `ctx_f5eab65ab665`; delivery enqueue does not establish acceptance. Coordinator owns fixes and central code-reviews/state integration.

## Coordinator triage checkpoint

Coordinator message msg_b6122bd40e1d supplied the offline/DB gate distinction; finding 2 was downgraded accordingly. Re-read stage-final.sh after this message: the original 11 lines and SHA-256 remain unchanged, so finding 1 remains open in the locally available source. No repaired-script acceptance is claimed. Unique assigned coverage remains 175 physical lines; re-reading the same lines is nonadditive.
