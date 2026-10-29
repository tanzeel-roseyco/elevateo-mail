# Acceptance seed bounded adversarial review

Reviewer: Codex; actual launch model/effort reported by coordinator: `gpt-6-astra`, `low`. Task `task_6d662e2c1b63`; dispatch `ctx_d711c73ce660`.

## Scope and evidence

Read-only source review; only this report was written. Applicable root AGENTS.md and .planning/STANDARDS.md in both workspaces were read. No nested AGENTS.md was found in the assigned source/report ancestor directories checked. The supplied full adversarial rubric was applied; formatting belongs to linters.

Hashes were verified before inspection. BE root is `C:/Users/Tanzeel/Code and projects/Elevateo Mail - BE02 Codex`; Coord root is `C:/Users/Tanzeel/Code and projects/Elevateo Mail - Local Completion`.

| Pass | File and exact inspected range | Physical LOC | SHA-256 |
| --- | --- | ---: | --- |
| 1 | BE `ops/tests/be02/acceptance_seed.rb:1-181` | 181 | `d11cc2e713ad7f3bdc60722198606645139419a22d7a2c88ec574bed59a774a3` |
| 2 | BE `ops/tests/be02/acceptance_seed_support.rb:1-131` | 131 | `1766348f4a8217d721ded4d92a6164a6d6dfc471f4849514107043580c018851` |
| 2 | Coord `tests/acceptance/shared/seed-contract.json:1-22` | 22 | `221d49259f52f2dcc9944a3af7744327cc2cbc1a3030fa4d13ae85b292e6a952` |

Total: 334 unique implementation/contract lines; largest pass 181 lines. No implementation dependencies outside these ranges were inspected.

## Verdict and numbered defects

No confirmed source defects within the assigned ranges under the supplied isolated-fixture assumptions. Defect count: **0**; defect density: **0 / 334 × 1000 = 0.00 defects/KLOC**. This is a bounded static result, not application acceptance or a runtime pass. No numbered defects or repair recommendations are asserted without supporting evidence.

## Checklist

- **Actor roles and session eligibility — static checks present.** All nine aliases are explicit and hash-pinned. Creation replaces example IDs with validated, unique Auth UUIDs. Verification checks confirmed email, nonempty encrypted password, authenticated role/audience, email identity, absence of Auth/application sessions, disabled-user ban, exact organization membership and exact mailbox capability set (`acceptance_seed.rb:120-151`). Disabled and no-membership actors publish null authorization versions; revoked retains organization eligibility but no mailbox capabilities. Actual login behavior and RLS enforcement are not demonstrated here.
- **Tenant variation — static fixture present.** Separate fixed organization/mailbox/thread/draft IDs and separate owners are used for primary/other scope. Historical other-tenant draft creation temporarily enables compose and restores it, asserting two generation increments (`acceptance_seed.rb:76-109`). This exercises fixture setup, not an actual authenticated cross-tenant read.
- **Authorization generation — real signer called.** Revocation does two insert/delete cycles and asserts four increments; generation must exist and be positive. Presentation receives actual user UUID, organization and current generation (`acceptance_seed.rb:62-69,149-160`). Signer implementation and migration trigger behavior are unchecked dependencies.
- **Atomicity and failure handling — deliberately limited.** Application inserts share one database transaction, followed by committed-row verification and then publication (`acceptance_seed.rb:13-30`). Auth API creation precedes that transaction; failed creation or verification can leave Auth users and/or committed application rows. The script explicitly requires discarding the disposable fixture on failure; it is not a rollback across Auth, PostgreSQL and the filesystem. Files are written directly, exclusively and with fsync; consumers must be gated on successful process exit, not file existence. A failed second write/fsync can leave partial output.
- **Null, empty and missing values — fail-closed paths present.** Fixed pinned contract prevents arbitrary actor schemas; fetch guards missing entries. No-membership null scope is handled explicitly, empty capabilities are compared against empty memberships, and row verification uses `IS NOT DISTINCT FROM` for nullable fields. Malformed JSON/API shapes and missing environment values terminate through sanitized exception handling. Tests of those paths were not in scope.
- **Boundary limits and secrets — static controls present.** Local endpoint/environment checks, bounded database/HTTP timeouts, 64 KiB contract/response limits, no redirect/retry/proxy use for Auth, UUID validation, private owner-checked 0700 directory, exclusive/no-follow 0600 files, and sanitized diagnostics are present. Passwords are generated separately and not placed in seed.json. Admin/signing isolation and browser credential routing are coordinator-supplied facts, not verified deployment configuration.
- **SQL and external input — scoped use.** Values are parameterized; interpolated table names are private constant call sites and columns are identifier-quoted. Exact contract hashing precedes parsing. The SQL types and schema constraints required by the verification predicates were not inspected.
- **Determinism — semantic, not byte-identical.** Nine aliases, scopes, fixture content, dates and contract IDs are fixed. Auth user IDs, passwords, message/note IDs and resulting authorization versions intentionally vary per run. No unprovided requirement for byte-identical output is assumed. The entrypoint guard exists at `acceptance_seed.rb:167`; runner behavior for a missing executable/file is outside scope.
- **Complexity and performance — bounded.** Small fixed actor/scope loops and per-row verification are reasonable for disposable acceptance setup; no unbounded hot-path workload was identified. Runtime owns configuration/Auth/publication and Fixture owns application rows/verification. Existing AIDEV comments explain important coupling and failure assumptions.
- **Tests and documentation — limited evidence.** These files contain fixture assertions, not standalone unit/integration tests of seed failures. Happy-path, malformed response, API partial failure, database rollback, missing-entry and publication failure regression coverage cannot be confirmed from the assigned files. Whole-project documentation synchronization and typing/lint compliance were not audited.

## Design limits and unchecked dependencies

The isolation-and-discard design avoids distributed compensation and is appropriate only for a fresh task-owned fixture with consumers stopped until successful completion. Turning this into a reusable/shared database seeder would require a different recovery contract. No deep architecture change is recommended; no Obsidian simulation was performed or claimed in this bounded review.

Unchecked dependencies: actual Auth v2.196.0 admin response semantics; PostgreSQL table types, constraints, grants, triggers and RLS; SessionCrypto/SessionPresentation implementation and key agreement; runner UID provisioning, missing-entry checks, failure disposal and startup gating; browser/API contract consumption; fixture failure regression tests; full application documentation and runtime configuration. Coordinator clarification of the external contract is recorded below when available.

Runtime: **NOT_RUN**. No host application tests, Docker commands, SSH, web server, dependency installation, commits, ultrareviews or subagents were used. The coordinator owns runtime and fleet evidence.

## Coordinator contract clarification

The coordinator replied through the blocking Orca question that sender/recipients and draft recipients are `jsonb`; the runner requires seed exit code zero and validates both output files' regular-file, owner, mode and link contracts before starting API/web/browser consumers; any seed failure aborts acceptance and whole-task cleanup disposes of the DB/Auth fixture. Missing-file checking belongs to the runner, and no runtime missing-entry fault-injection pass has yet been established. These are supplied contract facts, not additional source inspection or test results. They support the bounded static verdict while leaving runtime **NOT_RUN**.
