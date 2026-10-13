# Acceptance shared boundary adversarial review

Date: 2026-10-14. Task: task_46e3cc2c9ab1; dispatch: ctx_f72b5115f875.
Actual execution identity: gpt-6-astra, low effort (coordinator launch metadata supplied with assignment).

## Verdict and scope

No confirmed defects found in the assigned static boundary. This is not application acceptance, proof of trustworthy runtime observations, or approval to publish. Runtime: **NOT_RUN**. No application tests, Docker, SSH, servers, dependency installation, commits or subagents were run. The supplied latest 29 PASS fleet boundary result is coordinator-reported context, not independently verified execution and not browser/runtime acceptance.

All paths below are relative to the Local Completion workspace. SHA256 values were verified before source inspection; physical lines include blanks and comments.

| File | Inspected lines | LOC | Verified SHA256 |
| --- | --- | ---: | --- |
| tests/acceptance/shared/config.ts | 1-63 | 63 | 6f0b56b5f8241e7ae229960389a0365d3ed5df99ddedded9eab4d375822e7776 |
| tests/acceptance/shared/schema.ts | 1-101 | 101 | 78599d8a46244720d6302583b9c26a07e198a684121fa3d6e4a998bbdbfc32ee |
| tests/acceptance/shared/report.ts | 1-55 | 55 | ae9d5fee3b15c686dbea5a498d17503c4ccf0dc019b33ae31b77861e5af63e3f |
| tests/acceptance/contracts/report-validation.spec.ts | 1-158 | 158 | 7d1451a35eeb8eac25f1be467edb2c4d6fc04f27cfd41d6d85713a9cae66ddf8 |

Read/review passes: config + schema 164 lines; report 55 lines; contracts 158 lines. Unique implementation/test total: 377 lines (219 implementation, 158 test). No other implementation inspected. Root AGENTS.md and .planning/STANDARDS.md read; no nested AGENTS.md found under tests/docs. Broad project-state reads were output-truncated and are not represented as complete documentation verification.

## Checklist and evidence

- Strict boundary shapes / unexpected inputs: strict objects, finite bounded numbers, explicit enums, identity patterns, nullability, and cross-field validation reject malformed cases. Contract tests include null, arrays, unknown fields, NaN, Infinity and inconsistent durations (schema 20-54; tests 108-118).
- Origins/configuration: exact origin allowlist rejects credentials, normalization, queries and arbitrary hosts. TLS/native/fixture combinations are checked; failures do not echo rejected environment values (config 12-50; tests 51-69).
- Paths/privacy: output and cases paths require existing canonical non-symlink directories; portable artifact paths reject traversal and Windows device names. Temporary files use exclusive creation and mode 0600 (config 49-50; schema 11-17; report 23-25, 44-54). Directory ownership and permissions are root-provisioning assumptions, not proven here.
- Seeds: bounded regular-file JSON, runtime kind, unique identities, test-domain addresses, exact actor scopes/states/capabilities and nullable session versions are checked (config 53-62; schema 56-100). Shape validity is not proof the database was seeded or that the input originated from that database.
- Empty arrays and limits: passing records need an assertion; empty evidence/artifact arrays remain allowed. Arrays, field lengths, attempt numbers, record bytes and record count are bounded. Artifact aggregate bytes, timeout, CPU and memory values are only configuration in this boundary; enforcement is outside coverage.
- Attempt lineage: deterministic IDs bind scenario/lane/attempt; retries require immediate matching failed predecessor, stable run/dispatch/profile/mode/test identity/authority and non-overlapping timestamps (schema 31-38; report 27-40).
- Publication/state: the in-process queue retains operation failures for callers while allowing later work; hard-link publication cannot overwrite the first target. Temporary cleanup is attempted on success/failure. This is atomic visibility, not a full power-loss durability claim (report 9-16, 42-54).
- Tests: supplied tests cover valid config/seed, rejection paths, duplicate publication, retry continuity, orphan/config mismatches, record caps, byte caps and output symlinks. No pass is inferred from source. This file does not itself cover every actor mutation, every numeric cap edge, a symlinked cases directory, or cross-process writer behavior.
- Maintainability: small focused modules, deliberate errors, strict inferred types and useful AIDEV notes; no confirmed unnecessary abstraction, cross-state breakage or hot-path database query. Directory enumeration is linear per publication, hence quadratic over a full run, but bounded to at most 10,000 entries by configured count under the one-writer contract; no measured performance defect established.
- Standards/documentation: scoped boundary matches strict validation and credential-free metadata intent. Broader README/state synchronization and real application authorization remain outside this review. Formatting is delegated to linters.

## Numbered defects

None confirmed. Defect count: **0**. Defect density: **0 / 0.377 KLOC = 0 defects/KLOC**. Implementation-only denominator is 0.219 KLOC, also 0 defects/KLOC. No repair recommended without evidence of a violated external contract.

## Design limits and unchecked dependencies

The publication queue is process-local, not a multi-process lock. Count checks, canonical-path checks and predecessor reads assume the root-provisioned directory remains private and stable; this code does not protect against another privileged writer replacing paths or records. Hard links prevent accidental overwrite, not malicious later modification. The writer establishes local predecessor continuity rather than recursively auditing a supplied ancestry chain. Root aggregation must independently establish authoritative attempts and evidence provenance.

The source does not implement host disk quota. Record byte/count limits are distinct from total artifact or host storage enforcement. Canonical path checks do not verify directory ACLs/modes, seed freshness, DNS/network isolation, trusted TLS setup, or database correspondence. These are explicitly unverified dependencies, not newly asserted defects in this limited assignment.

Unchecked: root provisioning/sealing/aggregation, framework adapters and runners, seed-contract.json and actual BE02 runtime export, database/auth behavior, artifact existence/content/redaction, process exit/timeout enforcement, resource limits, cross-platform hard-link support and filesystem permissions, browser/native runtime behavior, Docker reports and cleanup. No deep runner inspection was performed. No deep design change or Obsidian simulation was performed; the bounded analytical assessment above does not substitute for the separate design reviewer.
