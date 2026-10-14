# QA816 bounded independent review request

Source candidate: `b327238` (ADV046/047 oracle repairs; source hashes below). Review the exact blobs below, not moving branch HEADs. Apply the full INT-401 rubric, report confirmed defects by severity and unique changed LOC/KLOC, and distinguish overlap and design context. Initial Felix, Vera and Ada findings are recorded in code-reviews.md; the repaired source below awaits exact re-review and fleet runtime.

| Functional packet | Exact source and inclusive lines | LOC | SHA-256 |
| --- | --- | ---: | --- |
| A | `tests/acceptance/playwright/qa816-matrix.e2e.ts` 1–154 | 154 | `f0b5c91f8c3a5ed96a96448ce658ff2586d1410034de1cf487e97edbc385338f` |
| B | `qa816-matrix.e2e.ts` 155–263; `screenshots.ts` 1–73 | 182 | matrix hash above; screenshots `75fb5b844bc8325d44308da7534e44b5bdf3ccfa1224e5b26796c4923b706ca3` |
| C | `qa816-send.e2e.ts` 1–75; `qa816-outreach.e2e.ts` 1–101 | 176 | send `0f88b09552f18374d147ed0b35e1fed6bf61c429cfb08bf95d5cda84fac22a2a`; outreach `ebd1619bfbe3f0344a827e7784d7d235bec2e9fb4b5370978535e6edb31e900b` |

Dedicated design reviewer: examine A+B as two divided packets totaling 336 LOC, then C as a separate 176 LOC assignment. Focus on genuine API/Auth observations, task-owned data and cleanup, transport barriers, response race assertions, role/tenant assumptions, screenshot admission/privacy and difference between visual viewport and text zoom. The same lines are overlapping design context, not extra unique coverage. Each functional packet stays below 200 LOC; each design assignment stays below 400 LOC.

## Exact fleet execution request to Soren

Only after a coherent integrated source passes web lint/type/unit/build and disposable SQL migration/Auth/HTTP readiness, enter the existing acceptance browser container with the accepted real-auth `internal_http` config and case-owned seed. From `tests/acceptance`, run:

```sh
node node_modules/@playwright/test/cli.js test --config=playwright/playwright.config.ts qa816-matrix.e2e.ts qa816-send.e2e.ts qa816-outreach.e2e.ts --workers=1
```

Soren may split with `--grep` admissions from `tessa.md`; record each split's exact integrated SHA, role seed, route flags, statuses, failures and cleanup. Inside the container, set `ACCEPTANCE_OUTPUT_DIR` to its own private absolute run directory with a precreated `native-private` directory. Export sanitized case records and the twenty-eight PNGs (only when actually created) to `/home/tanzeel/elevateo-mail-completion-20261015/control/qa816-private/<integrated-sha>/<run-id>/`, mode 0700, preserving `native-private/` under that path. Send Tessa and root exact artifact paths, image count, source SHA and API status receipts; never treat `--list`, compiled source, fixtures or failed migrations as visual PASS. Do not place private PNGs in Git or the shared docs tree.
