# QA816 bounded independent review request

Source candidate: `c151ecd` (ADV046/047 oracle repairs; source hashes below). Review the exact blobs below, not moving branch HEADs. Apply the full INT-401 rubric, report confirmed defects by severity and unique changed LOC/KLOC, and distinguish overlap and design context. Initial Felix, Vera and Ada findings are recorded in code-reviews.md; the repaired source below awaits exact re-review and fleet runtime.

| Functional packet | Exact source and inclusive lines | LOC | SHA-256 |
| --- | --- | ---: | --- |
| A | `tests/acceptance/playwright/qa816-matrix.e2e.ts` 1–154 | 154 | `f0b5c91f8c3a5ed96a96448ce658ff2586d1410034de1cf487e97edbc385338f` |
| B | `qa816-matrix.e2e.ts` 155–263; `screenshots.ts` 1–77 | 186 | matrix hash above; screenshots `6d6ec6aabe8f13b6beaf079653e8a7fc4b474fcda2f29d2d3c48fc7fb5b74120` |
| C | `qa816-send.e2e.ts` 1–75; `qa816-outreach.e2e.ts` 1–110 | 185 | send `0f88b09552f18374d147ed0b35e1fed6bf61c429cfb08bf95d5cda84fac22a2a`; outreach `61db23ef8f720b564791eaf7295f40edb93fa64f4b613475b3a59dffa9bf784a` |
| D | `qa816-visual.e2e.ts` 1–36 | 36 | `0c3fb47a54e1f578b74a7bab1d1578694d725bd1d5b9cf51c412d2351f1b7e22` |
| E | `qa816-message.e2e.ts` 1–59 | 59 | `9567464119cdbf4c1c60f14ee74f8792ca79b39dc011ca17861fcb697f84e502` |
| F (new; source only) | `tests/acceptance/qa816-later-page-seed.rb` 1–88; `playwright/qa816-later-page.e2e.ts` 1–43; `playwright/screenshots.ts` 76–78 | 134 | `561b2f0a94da32b1c4ebb91ef7bf23a1898bc9f14b5d9076f9d28d85e679d933`, `c9a881ef916dd5015023fa0706499cc1189d7bd6e6d892270f87079269d62ee5`, `2feb44dafe05fcee7031504498c89a031d6e9701a909374e35db1a4e666f0c72` |
| F2 (delta after REV875; source only) | `playwright/qa816-later-page.e2e.ts` 1–51 | 51 context; 8 added | `5dd7743844fa318d23d9f847438d8e0dfd56024342a71c9a5231f4e6141d287b` |
| G (APP901 candidate; source only) | `playwright/qa816-feature-wave.e2e.ts` 1–30; `playwright/screenshots.ts` 78 | 31 | `ac49e2cef115e364d73818c609383d524b621758878e02d6580625db5e428834`, `561a07bc7cc1c9f535f729f270230120fbbc3d7653a6f0108a2a598fa9213be4` |

Dedicated design reviewer: examine A+B as two divided packets totaling 340 LOC, then C+D+E as separate divided packets totaling 280 LOC. Focus on genuine API/Auth observations, task-owned data and cleanup, transport barriers, response race assertions, role/tenant assumptions, screenshot admission/privacy and difference between visual viewport and text zoom. The same lines are overlapping design context, not extra unique coverage. Each functional packet stays below 200 LOC; each design assignment stays below 400 LOC.

## Exact fleet execution request to Soren

Only after a coherent integrated source passes web lint/type/unit/build and disposable SQL migration/Auth/HTTP readiness, enter the existing acceptance browser container with the accepted real-auth `internal_http` config and case-owned seed. From `tests/acceptance`, run:

```sh
node node_modules/@playwright/test/cli.js test --config=playwright/playwright.config.ts qa816-matrix.e2e.ts qa816-send.e2e.ts qa816-outreach.e2e.ts qa816-visual.e2e.ts qa816-message.e2e.ts --workers=1
```

Soren may split with `--grep` admissions from `tessa.md`; record each split's exact integrated SHA, role seed, route flags, statuses, failures and cleanup. Inside the container, set `ACCEPTANCE_OUTPUT_DIR` to its own private absolute run directory with a precreated `native-private` directory. Export sanitized case records and the thirty-seven PNGs (only when actually created) to `/home/tanzeel/elevateo-mail-completion-20261015/control/qa816-private/<integrated-sha>/<run-id>/`, mode 0700, preserving `native-private/` under that path. Send Tessa and root exact artifact paths, image count, source SHA and API status receipts; never treat `--list`, compiled source, fixtures or failed migrations as visual PASS. Do not place private PNGs in Git or the shared docs tree.

### Optional later-page direct-message fixture

After the frozen BE02 base seed exits 0, Soren may run `ruby tests/acceptance/qa816-later-page-seed.rb` inside the same disposable privileged fleet fixture environment with `/acceptance/seed.json` and the existing safe environment variables. It requires a fresh one-message primary thread, inserts 20 task-owned synthetic messages in one transaction, then writes mode-0600 `/acceptance/qa816-later-page.json`; failure means discard the entire disposable fixture. Mount that sidecar read-only in the browser container at the same path, set `QA816_LATER_PAGE_PATH=/acceptance/qa816-later-page.json`, and run separately from the 21-case suite: `node node_modules/@playwright/test/cli.js test --config=playwright/playwright.config.ts qa816-later-page.e2e.ts --workers=1`. This adds one case and one candidate PNG requiring the integrated FE806 route, real Auth/API and Soren's fleet execution. No strict shared seed or canonical contract edit is requested.

### APP901 top reply candidate

After Mira's top reply prefill source, Cassian's coherent import and the disposable real Auth/API gate, Soren runs `node node_modules/@playwright/test/cli.js test --config=playwright/playwright.config.ts qa816-feature-wave.e2e.ts --workers=1` from `tests/acceptance`, with the same private output and no live transport. Current file has SCN-QA-825-P only: it opens the seeded thread's top `Reply as draft` entry, proves seeded sender and thread link, saves a case-owned draft through real V1 PUT200, then observes V1 GET200 on reload and the persisted values. The older per-message reply case remains separate. This source is expected to fail against the pre-APP901 top link; compile/browser/PNG and owner label confirmation remain pending. Assignee picker and attachment cases need active versioned routes, UI labels and a disposable per-verdict byte fixture; they are not represented by this case.
