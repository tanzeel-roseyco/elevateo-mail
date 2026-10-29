# Acceptance Playwright repair review

2026-10-14. Task `task_071fd3b9f97e`; dispatch `ctx_08c6db7d62b6`.

Verdict: the inspected origin and durable-budget repairs are statically sound within their stated private-directory and point-in-time guard limits. One MED regression-coverage defect remains; no executable correctness defect was established. Runtime: **NOT_RUN**. Root owns all execution and acceptance evidence.

Reviewer identity: Codex, GPT-6 family as identified by the session instructions. The exact serving model variant and reasoning-effort setting are not exposed to this worker; no named-model or effort attestation is claimed.

## Scope and integrity

Read root AGENTS.md, .planning/STANDARDS.md and docs/completion/acceptance-browser-repairs.md. No nested AGENTS.md was found under tests. README/state/documentation context read returned truncated historical output; this review does not certify those aggregate documents. All six raw SHA-256 hashes matched the supplied handoff inventory before source inspection. Only the following implementation/test ranges were inspected, in two passes of 146 and 99 physical lines (245 unique LOC total).

| File under tests/acceptance/playwright/ | Exact range | SHA-256 |
| --- | --- | --- |
| support.ts | 1-53 | 57e6cbdd67e479f3003b926e089d605118b3e88189a35c8a349599b579a96beb |
| credential-origin.ts | 1-16 | 2f8ec06f36282f794f8a19bdc2e0f3302af4f796c041439a97b0e3f75ee0ec6e |
| credential-origin.unit.spec.ts | 1-26 | e1682b27ee075f52441bba5063ea6d329d05aac1bb2d04789d0f5d47ebb08dc6 |
| credential-fill.unit.spec.ts | 1-51 | 27cc1e1ebe64ed7c2f313bac3faedd8dcad483f0db8f51e15ef75f9e7649e787 |
| screenshots.ts | 1-47 | ba90f3ab89fd6e15a32feea690e5f2ee59f2e6d78320bc49ee51711b7270be55 |
| screenshots.unit.spec.ts | 1-52 | a7e7d16dc7486eb191617229f291727421b25e61ce66fa831f645cba0c4aaf6c |

## Checklist

- Per-fill origin enforcement: PASS, static. support.ts:23 calls the real sequence; credential-origin.ts:14-15 independently checks immediately before each fill. Exact origin and userinfo checks reject peer hosts, alternate schemes and credentials in URLs. Parse/read failures use a fixed sanitized error; operation failures propagate deliberately.
- Credential regressions: PASS for inspected scope, static only. The actual Playwright sequence covers allowed, foreign, malformed and between-fill navigation cases. Pure guard cases also exercise unavailable URLs and userinfo. The three command labels in the pure tests repeat the same helper tests; they are not three browser executions. Puppeteer/Selenium actual-method assertions are present, but their implementations are outside this review.
- Durable aggregate limit: PASS, static. Three fixed file paths form the ledger; every persistence call sums existing sizes under exclusive lock. Existing files survive module/worker replacement, aggregate overflow rejects before target creation, and exact-budget acceptance is asserted. Constant three-file work avoids unbounded scans.
- File boundaries: PASS within documented trust assumptions. IDs and positive safe-integer budgets are checked; lstat/realpath reject linked directories, regular-file and link-count checks reject linked artifacts, and exclusive target creation prevents overwrite. Typed internal byte input is assumed; empty bytes are not rejected or tested as invalid PNG content.
- Failure cleanup: source path present, regression coverage deficient (finding 1). Budget rejection, existing-target exclusion and stale-lock exclusion have source tests. No test reaches the owned-target cleanup branch.
- State/coupling: no in-memory accounting remains to reset on worker replacement. Existing artifacts are preserved on duplicate-ID rejection. The tests use a fresh module import rather than a real process restart, which is appropriate unit evidence but not runtime restart proof.
- Maintainability/design: helper responsibilities are narrow; centralized credential policy avoids divergent origin rules. AIDEV notes explain intent. No unnecessary framework, dependency or domain-state change is present in the assigned code. Formatting is delegated to linters, not reviewed here.
- Documentation: handoff accurately discloses unexecuted probes, race limits, fixed allowlist and stale-lock reconciliation. No application or publication acceptance is inferred.

## Numbered defects

1. **MED — Partial-write cleanup has no regression that reaches it.** Evidence: screenshots.ts:33-40 creates the exclusive target, writes/syncs/closes it, and removes it on failure; screenshots.unit.spec.ts:18-51 tests successful writes and rejections before this branch, but never injects a write, sync or close failure. Deleting lines 37-40 would leave the authored tests unable to detect a partial artifact left on disk. Such an artifact can consume durable budget and prevent a replacement worker from creating the same fixed ID. This falls short of the STANDARDS.md regression/failure-path requirement for this specific repair, even though the handoff transparently admits the runtime gap. Minimal repair: add a focused deterministic I/O failure regression using a narrow filesystem fault seam or supported module mocking; make the actual writer create the target, fail after a partial write, and assert rejection, target absence, lock absence and successful subsequent retry. Also cover a sync or close rejection to exercise the nested finally behavior. Keep this seam local to the screenshot helper and avoid a general storage abstraction. Run it in root's Docker gate; do not count authored assertions as a pass.

Defect count: **1 MED coverage defect**, **0 established executable defects**. Density: **1 / 245 × 1000 = 4.08 defects/KLOC** (all unique inspected implementation/test physical lines). Executable-defect-only density is 0/KLOC; this is not a claim of complete correctness.

## Design limits and unchecked dependencies

The fixed-file ledger is a simple bounded solution for three immutable screenshot IDs; a new caller/ID requires extending the allowlist. Failing on an existing/stale lock favors integrity over automatic recovery. These are analytical observations, not a dedicated architecture consultation or Obsidian simulation; neither was performed in this restricted assignment.

URL checks cannot make asynchronous browser operations atomic against navigation; network isolation remains essential. Screenshot capture in support.ts:51 occurs before persistence/budget validation, so the bound governs persisted artifacts, not transient screenshot allocation. Partial cleanup failure can leave an artifact and surface the cleanup error; crash recovery and disk durability across machine failure are not established by module-replacement tests. The private output directory must remain under trusted ownership throughout filesystem operations.

Unchecked implementations/contracts: shared config and seed validation, credential loading, Playwright runner/package settings and dependency versions, screenshot call sites and ID completeness, output-directory provisioning/permissions, actual Puppeteer and Selenium UI methods, application authentication and rendering behavior, network isolation, artifact publication/redaction and full-lane runtime integration. No additional implementation was read to settle these dependencies. No host tests, Docker, SSH, web server, installs, subagents, commits or source changes were performed. Only this report was written; aggregate code-reviews.md accounting belongs to the coordinator under the named-report-only constraint.
