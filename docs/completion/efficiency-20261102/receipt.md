# Efficiency pass receipt — 2026-11-02

Branch `feature/efficiency`. Local Docker Desktop (`desktop-linux`) only.

| Gate | Result |
| --- | --- |
| Web (`apps/web/docker/test.Dockerfile`, 3 GB / 2 CPUs) | Contract checks, lint, typecheck, 106 test files passed, production build, entry 193.8 KB / 500 KB, initial JS 575.8 KB / 900 KB, fixture-marker grep clean. Summary in `web-gate-summary.txt` |
| Server image (`apps/server/Dockerfile`, two-stage) | Builds; `pg`, `nokogiri`, `psych` load; RuboCop 527 files no offenses; Steep no type errors. Image 960 MB (old single-stage) to 498 MB |
| Server tests | Not run: no server code changed. The server efficiency items are blocked on Codex re-authentication; prompt kept in `codex-server-prompt.txt` |
| Playwright | Not rerun: config change scopes viewport projects and screenshots; `src/test/viewport-specs.test.ts` guards the spec list in the unit gate |

Reviews: three adversarial packets plus a design-tradeoff review, 920 LOC, 21 defects, 0 residual (code-reviews.md).
