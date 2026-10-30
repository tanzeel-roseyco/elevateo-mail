# Final browser acceptance repair review

2026-10-14. Task `task_33206ee499b1`; dispatch `ctx_54217c475795`.

Verdict: **no confirmed defects in the bounded static review**. The prior Selenium parsed-markup false positive and screenshot failure-path coverage finding are statically addressed. Runtime is **NOT_RUN**; this verdict is neither a test pass nor application acceptance.

Actual reviewer identity: Codex, GPT-6 family as identified by this session. Exact serving model variant and configured reasoning effort are not exposed; no Astra/Fable/Opus or exact effort attestation is claimed.

## Integrity and coverage

All five raw SHA-256 hashes and physical line counts matched `acceptance-browser-final-repairs.md` before implementation inspection. Post-review hash reads reconfirmed no drift. Only these implementation/test ranges were inspected, in the prescribed three passes; documentation and metadata do not count toward the denominator.

| Pass | File under tests/acceptance/ | Exact range | Physical LOC | SHA-256 |
| --- | --- | --- | ---: | --- |
| 1 | selenium/ui.ts | 1-59 | 59 | 653c21555f9fac14502db88807cb4b11013d2cb03f1ef1ed56442c1ba299c8b7 |
| 1 | selenium/journeys.ts | 1-86 | 86 | d5d417e6e6e9bd5b6023f9e5e51dc7584d2749d8c5fa719a6a63f40f81c08572 |
| 2 | selenium/ui.browser-probe.ts | 1-60 | 60 | 0cd9b0d1908e6d337c3de03b57d6b8813518a74f9e93a2ca6c99a25184c49190 |
| 3 | playwright/screenshots.ts | 1-51 | 51 | 4805eeb95659579abf6c4ffa56e77b0794df329515467edd8a0fd9c870ebeb57 |
| 3 | playwright/screenshots.unit.spec.ts | 1-98 | 98 | b5dac72ab42c9c7e2ca6f9d7055e65193732ae561efd9f56726c64fa5339fe88 |

Pass totals: **145, 60, 149**; unique inspected implementation/test coverage: **354 physical LOC**. No pass exceeded 200 lines and total coverage stayed below 400. Root AGENTS.md and .planning/STANDARDS.md supplied policy; no additional nested AGENTS.md appeared in repository file discovery. The named handoff and prior browser/Playwright repair reports supplied historical findings. README/state/documentation context output was truncated; those aggregate documents are not certified here.

## Numbered defects and accounting

None established. Confirmed new/remaining defects: **0**; defect density: **0 / 354 * 1000 = 0 defects/KLOC**. Historical findings retain their original denominators in the prior reports; this is not a retroactive deletion of those findings.

## Checklist and evidence

- **Literal child-free PRE on the same visible node: statically supported.** ui.ts:40-53 searches only conversation PRE elements, compares the marker to literal textContent, rejects element children, and checks layout and the element's own ancestor chain before accepting that same element. Empty result sets, null textContent, hidden/zero-size elements and the specified hidden ancestor styles reject. journeys.ts:34-36 invokes the actual helper both before and after reload. Marker interpolation into XPath is removed from this journey.
- **Specific negative oracle: statically supported.** ui.browser-probe.ts:55-56 requires both Selenium TimeoutError identity and the helper's readiness-deadline message. A script, transport, assertion or generic WebDriver rejection cannot satisfy this predicate merely by rejecting. Lines 22-54 supply two positive controls and nine negative variants, including nested markup, hidden matching elements beside a visible wrong sibling, wrong text, empty and missing elements. These are fixture checks, not additional application scenarios. The literal positive uses the same literal escape sequence in fixture and expectation; it does not prove rendered newline fidelity.
- **Actual cleanup helper, not mirrored implementation: statically supported.** screenshots.unit.spec.ts:19-63 calls imported persistScreenshot and injects only target opening. Real open receives the helper's path, flags and mode. Write failure first persists and reads back a partial byte at lines 31-36; sync and close failures occur at their named phases. The helper still owns lock acquisition, budget accounting, write/sync/close sequencing, unlink and lock cleanup (screenshots.ts:19-49). Exact injected error identity, reached phase, real descriptor close completion, target/lock ENOENT, preservation of prior bytes and exact-budget successful retry are asserted. Removing target cleanup would violate the new absence/retry assertions.
- **Happy path and failure regressions present, not passed.** Existing tests cover durable aggregate overflow, exact-budget success, duplicate target, existing lock, path escape and symlink rejection. Three new failure tests reach the owned-target cleanup path. Some older rejection assertions remain broad; the newly requested failure assertions are specific. No compilation, runtime or mutation-test evidence was inferred from source.
- **State and limits: statically supported within trust assumptions.** Screenshot IDs form a fixed three-file ledger; safe positive integer budget validation and exclusive file creation are retained. No module counter resets durable accounting. Old artifacts survive the injected failures. Seed/marker validation is external: empty markers weaken substring matching, and malformed seed IDs could affect selectors; those boundary contracts were not inspected or assumed valid. Typed internal byte input is not a PNG validator, and zero bytes are permitted.
- **Security and coupling: bounded static check only.** Login still passes the credential flag for both email and password (journeys.ts:14-15), with the real typing operation routed through the imported origin guard (ui.ts:27-32). Screenshot allowlisting, private directory checks, regular-file/link checks and restrictive creation mode are retained. No backend authorization, exact-origin implementation, filesystem ownership or network isolation guarantee is established here.
- **Errors and cleanup: deliberate within documented limits.** Selenium fixture quit is attempted in finally after successful build. Build failure can precede that finally, and Node test timeout does not establish remote session termination; root's watchdog and Grid teardown remain required. Screenshot unlink/close errors can replace an earlier I/O error; the new tests prove only the authored single-failure paths. The close injection releases the real descriptor before throwing and does not model an OS close failure leaving it open.
- **Maintainability/performance: no new confirmed issue.** The narrow opener seam avoids a general storage abstraction. Helpers retain bounded responsibilities and useful intent comments; no dependency, database query or domain-state change is added. Screenshot ledger work is constant over three files. PRE polling scans matching nodes and ancestors, with no measured large-DOM performance claim. Styling and formatting are delegated to linters.
- **Documentation/standards: scope accurately disclosed.** The handoff records frozen hashes, fixture/application distinction, close-failure limitation and pending root runtime commands. Static regression requirements for the two historical findings are met; typecheck, lint, integration and actual visual QA remain unverified. Only this report was written; root owns aggregate code-reviews.md and state updates.

## Design limits and unchecked dependencies

This is not the separately required dedicated design review. No Obsidian simulation or architecture consultation was performed. The bounded design observation is that a target-only fault seam keeps actual cleanup under test without changing normal callers; the fixed ledger and fail-closed lock retain their existing simplicity and stale-lock operational requirement.

Render-presence is weaker than human-visible appearance: occlusion, clipping, viewport placement, contrast, whitespace fidelity and exact full-body equality are not proven. Visibility rules can conservatively reject CSS arrangements with an explicitly visible descendant under a hidden ancestor; that is outside the stated fixture contract and is not asserted as an application defect. Point-in-time origin reads cannot make asynchronous typing atomic against navigation. Private-directory ownership must remain trusted throughout filesystem operations; crash durability and hostile filesystem races are not established by these tests.

Unchecked dependencies: shared seed/config schema and nonempty marker guarantees; credential-origin helper; Selenium gridConfig, verifyCapabilities and draftIdFromURL implementations; dependency versions and TypeScript configuration; lane runner and scenario registry; output provisioning/permissions and screenshot call sites; frontend/backend/auth/storage behavior; Docker networking, watchdog, cleanup and fleet evidence; native clients; root's full visual acceptance. No out-of-scope source was opened to settle these contracts.

Runtime **NOT_RUN**: no host tests, Docker, SSH, web server, dependency installs, ultrareviews, subagents or commits. Root must run the frozen-source Docker typecheck/build/unit/browser probes, real application lanes and visual validation before runtime acceptance.
