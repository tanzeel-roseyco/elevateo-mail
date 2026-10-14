# QA816 bounded independent review request

Source candidate: `e91eac6` (empty-search oracle repair; source hashes below). Review the exact blobs below, not moving branch HEADs. Apply the full INT-401 rubric, report confirmed defects by severity and unique changed LOC/KLOC, and distinguish overlap and design context. No independent review has run yet.

| Functional packet | Exact source and inclusive lines | LOC | SHA-256 |
| --- | --- | ---: | --- |
| A | `tests/acceptance/playwright/qa816-matrix.e2e.ts` 1–154 | 154 | `6cdc4f410aa41e777e67617acd226b37cb9f247163a5aa2d86b0c2b1fea2d7c9` |
| B | `qa816-matrix.e2e.ts` 155–262; `screenshots.ts` 1–73 | 181 | matrix hash above; screenshots `75fb5b844bc8325d44308da7534e44b5bdf3ccfa1224e5b26796c4923b706ca3` |
| C | `qa816-send.e2e.ts` 1–71; `qa816-outreach.e2e.ts` 1–98 | 169 | send `cdb63c944c2cb422ba8ec96646c4f64bf45a722886aa0caa160e437a5bf1282d`; outreach `8c3f9f8c1f62b001f95d3613a54c6e1608ba5d6ae39fc3cd660839d41016961f` |

Dedicated design reviewer: examine A+B as two divided packets totaling 335 LOC, then C as a separate 169 LOC assignment. Focus on genuine API/Auth observations, task-owned data and cleanup, transport barriers, response race assertions, role/tenant assumptions, screenshot admission/privacy and difference between visual viewport and text zoom. The same lines are overlapping design context, not extra unique coverage. Each functional packet stays below 200 LOC; each design assignment stays below 400 LOC.

## Exact fleet execution request to Soren

Only after a coherent integrated source passes web lint/type/unit/build and disposable SQL migration/Auth/HTTP readiness, enter the existing acceptance browser container with the accepted real-auth `internal_http` config and case-owned seed. From `tests/acceptance`, run:

```sh
node node_modules/@playwright/test/cli.js test --config=playwright/playwright.config.ts qa816-matrix.e2e.ts qa816-send.e2e.ts qa816-outreach.e2e.ts --workers=1
```

Soren may split with `--grep` admissions from `tessa.md`; record each split's exact integrated SHA, role seed, route flags, statuses, failures and cleanup. Inside the container, set `ACCEPTANCE_OUTPUT_DIR` to its own private absolute run directory with a precreated `native-private` directory. Export sanitized case records and the twenty-eight PNGs (only when actually created) to `/home/tanzeel/elevateo-mail-completion-20261015/control/qa816-private/<integrated-sha>/<run-id>/`, mode 0700, preserving `native-private/` under that path. Send Tessa and root exact artifact paths, image count, source SHA and API status receipts; never treat `--list`, compiled source, fixtures or failed migrations as visual PASS. Do not place private PNGs in Git or the shared docs tree.
