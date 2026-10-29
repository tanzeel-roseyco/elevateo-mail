# Fleet-02 validation runner — repaired FE-01-R1 frontend (post-284aa71 working tree)

Authored only; nothing here was executed. The parent reviews these files, runs `make-snapshot.sh`
from the repository root on the source machine, transfers `context.tar.gz` (+ its `.sha256` and
`manifest.sha256`) and this directory to fleet-02, then runs `./run-fleet-02.sh context.tar.gz`.
Prior scripts under `/home/tanzeel/elevateo-mail-tests-20261012-ultra` are examples only.

| File | Purpose |
| --- | --- |
| `make-snapshot.sh` | Explicit build context: `contracts/v1` + `apps/web`, excluding `node_modules`, `dist`, `e2e/.results`, `.vite`; asserts the six repaired files are inside; emits per-file and archive sha256. |
| `validation.Dockerfile` | Two targets on pinned-by-digest images: `unit` mirrors `apps/web/docker/test.Dockerfile` (check:api → lint → typecheck → vitest+coverage → build → bundle-marker check); `browser` layers the pinned Playwright v1.64.0-noble image over the installed workspace, builds the real artifact, serves it on 4174 and runs the full e2e matrix with `--workers=2`. |
| `run-fleet-02.sh` | Verifies the snapshot archive hash and per-file manifest before any Docker action; fresh per-run nonce and preflight absence checks for every task-named resource; validated, non-pre-existing output directory; unique buildx docker-container builder capped at **create time** (`--driver-opt memory/cpu-quota`, 2 CPU/2 GiB) and verified after bootstrap, failing closed; unit container 2 CPU/2 GiB; browser container 2 CPU/3 GiB with `--shm-size 1g` and `CHOKIDAR_USEPOLLING=1`, detached with 15 s polling and a 40-minute ceiling; all build/test logs and `e2e/.results` copied out even on failure; EXIT/INT/TERM-trapped cleanup removes only label-verified (`elevateo.task=<task-id>`), mount-free task containers, the two task images and the named builder (its own cache volume) — no global prune — and **any cleanup or verification failure fails the run**. Exit code 0 only when both stages pass and cleanup succeeded. |

Notes for review:

- Both Dockerfile targets share the install layers, so the builder caches one `npm ci`
  (a docker-container builder cannot `FROM` a host-local image, hence one multi-stage file).
- `page.route` supplies every `/v1` response in `production.spec.ts`, so a static `vite preview`
  of the built artifact is the correct `ELEVATEO_PRODUCTION_URL` origin.
- Persistent volumes, pre-existing images (including the pinned bases) and unrelated containers
  are never touched; a label or mount mismatch keeps the resource and logs why.
