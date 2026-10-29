# r8 fleet-02 validation proposal (NOT RUN — awaiting parent inspection)

Date: 2026-10-12. Purpose: execute the frozen visual-states capture spec and re-confirm the r7
suite on the identical workflow. **No Docker has been run for this proposal**; the fleet-02
reservation is noted as released, but execution waits for parent approval. No product source,
runner or contract bytes changed since r7 — the only snapshot delta is the two reviewed test-only
e2e additions and the one e2e repair already Docker-verified in r6/r7 form.

## Workflow: byte-identical r7 runner set (frozen, zero changes proposed)

| File | SHA-256 |
| --- | --- |
| `scripts/fleet-02-validation-20261012/run-fleet-02.sh` (rev 5, 200 LOC) | `dcaa2bc92d76c26a896f9737ba7c099a65da2c077b2ec018e488b60effbcc597` |
| `scripts/fleet-02-validation-20261012/make-snapshot.sh` | `3337873ba662be88c00fc0c7db1de6c8cd943b7878ef3aad255869c876c54c64` |
| `scripts/fleet-02-validation-20261012/validation.Dockerfile` | `73861610a354eb5a9198f3ecb89f9978935ba0d5312ad74879bafeec5b80193b` |
| `scripts/fleet-02-validation-20261012/probes.sh` (rev 3) | `21f672750b078e1cf950d637cc3dea159b0fbcc164ce79294eea3f5e175d2952` |
| `scripts/fleet-02-validation-20261012/README.md` | `2b79f2c82e6ff13ee22232cc986c29c889e60e1669c5bf4183a599550f7ca052` |

No runner modification is required for the visual captures: `run-fleet-02.sh:192-194` already
preserves `docker logs` and copies `apps/web/e2e/.results` (including the new
`e2e/.results/visual/*.png`) into `$OUT/e2e-results` even on failure, before verified cleanup.

## Snapshot delta vs the r7 snapshot (everything else byte-identical)

`make-snapshot.sh` tars `contracts/v1` + `apps/web` excluding only
node_modules/dist/`e2e/.results`/.vite, so the new files enter automatically; its six
repaired-file assertions still hold. Files newly entering or changed:

| File | SHA-256 | Status |
| --- | --- | --- |
| `apps/web/e2e/visual-states.spec.ts` (NEW, 267 LOC) | `2b0fedfbfdfd5a9a5b4ab93ba2916ff4a1ac164419d68b9c896da76e4f606eb5` | FROZEN; both re-reviews passed, zero defects |
| `apps/web/e2e/support.ts` | `802e11b8eb803fae1b4bb6d3f12ed42bac56c9e6d967a7dfe9bba4f5f32ddb3f` | unchanged since r7 |
| `apps/web/e2e/read.spec.ts` | `c97ad650788d727d83d6392cf428d4024f78e339848e37e94c3fade6ff27f89c` | unchanged since r6/r7 |
| `apps/web/e2e/production.spec.ts` | `ac941add3700cc304e03995b6f9ed6bf622bc1b42f93f6647f09737cada2330f` | unchanged since r7 |

All `apps/web/src/**` and `contracts/v1/**` bytes are unchanged from the r7-verified tree
(r7 freeze preserved); the parent can confirm via the regenerated `manifest.sha256`.

## Snapshot evidence — PREPARED 2026-10-12 (step 2 executed on acceptance; Docker NOT run)

The parent accepted this proposal for snapshot preparation. `make-snapshot.sh` (frozen hash
verified above) was run from the repository root into the new sibling directory
`Elevateo Mail - FE Validation 20261012-r8`:

- `context.tar.gz` SHA-256: `736bf53140072552f34e1716f8f1189f4d2dfb30db433fc85ae29b538ae5e2d0`
  (verified with `sha256sum -c context.tar.gz.sha256`: OK).
- `manifest.sha256`: 58 files (r7 had 57). Normalized (sorted) per-file delta vs the r7
  manifest: EXACTLY one added line —
  `2b0fedfbfdfd5a9a5b4ab93ba2916ff4a1ac164419d68b9c896da76e4f606eb5 apps/web/e2e/visual-states.spec.ts`
  (the frozen, twice-reviewed spec). Zero modified or removed files; the raw diff's other lines
  are locale sort-order shuffling only.
- All five runner-set hashes and the spec hash re-verified byte-identical to the table above.
- Probes (step 1) and the run itself (step 3) are NOT executed: no host tests, and the backend
  holds the exclusive fleet-02 reservation — the run waits for its release.

## Exact proposed invocation (parent-owned, fleet-02 only)

1. `bash scripts/fleet-02-validation-20261012/probes.sh` — P1–P15 guard probes (no Docker).
2. `bash scripts/fleet-02-validation-20261012/make-snapshot.sh` — fresh `context.tar.gz` +
   `context.tar.gz.sha256` + `manifest.sha256`; record the new archive hash as the r8 snapshot id.
3. `bash scripts/fleet-02-validation-20261012/run-fleet-02.sh <snapshot-dir> results-<task>` —
   unchanged rev 5 flow: verify snapshot hashes → nonce task id → absence preflight → capped
   builder → unit stage (check:api, lint, typecheck, vitest coverage, build, marker scan) →
   browser stage (artifact preview + `test:e2e --workers=2`) → log/e2e-results preservation →
   verified exact cleanup.

## Expected results (deltas from r7's 209 unit / 48 browser)

- Unit stage: identical to r7 (209 tests) — no unit-test bytes changed.
- Browser stage: the prior 48 checks plus `visual-states.spec.ts`: desktop 52 executed + 2
  mobile-only skips; narrow-390 54 executed; reduced-motion 6 executed + 48 representative-filter
  skips (skips are expected and visible, not failures). All visual tests skip loudly if
  `ELEVATEO_PRODUCTION_URL` were unset; the browser stage sets it, so they must run.
- Deliverable for the matrix: `$OUT/e2e-results/visual/<project>-<theme>-<scenario>.png`
  (~112 PNGs) for the parent's human inspection against `docs/visual-qa-matrix.md`.
- Runtime note: ~108 additional browser tests at `--workers=2` will extend the browser stage well
  past r7's 22.4 s; the runner's 40-minute ceiling and 15 s polling need no change.

Pass criteria, cleanup verification and failure preservation are exactly the frozen rev 5
semantics. If the parent wants fewer captures per run, the only knob is Playwright's
`--grep`/`--project` CLI filters at invocation time — no file changes.
