# Files over 1,000 lines

Measured on 2026-10-18 with `git ls-files | xargs wc -l` at `712a3cbf`. Readiness item 131.

## Application, ops and docs (tracked outside `third_party/`)

| Lines | File | Kind | Action |
| --- | --- | --- | --- |
| 4,320 | `apps/native/src-tauri/icons/icon.icns` | Binary icon | None; binary counted by line breaks |
| 3,464 | `apps/web/src/data/generated/api.d.ts` | Generated from `contracts/v1/openapi.json` | Do not split by hand; regenerate with `npm run generate:api` |
| 1,652 | `code-reviews.md` | Review ledger | Archive packets older than the current milestone under `docs/completion/` |
| 1,403 | `apps/web/src/data/generated/api-v2.d.ts` | Generated from `contracts/v2/openapi.json` | Do not split by hand; regenerate with `npm run generate:api:v2` |
| 1,264 | `docs/research/devin-cli/cli__changelog__stable.md` | Captured research | Leave; research archive |

No hand-written source file in `apps/`, `ops/`, `contracts/`, `scripts/` or `tests/` exceeds 1,000 lines. `README.md` (760 lines) and `documentation.md` (775) are under the limit but front-load the state log; readiness item 133 moves the quick start to the top.

## Vendored reference snapshots (`third_party/upstream/`)

These are upstream repositories captured for study, not deployed code. The largest are `lightreach/lightreach-demo-official.gif` (123,837 lines as text), two Monaco editor bundles (67,731 and 51,328), `instantly-starter-kit/spec/openapi.yaml` (40,608) and several lockfiles. They make clones slow and trip line-count tools. Readiness item 130: either move binaries to Git LFS or replace the snapshots with the commit hashes recorded in `docs/reference-repositories` and delete the copies.
