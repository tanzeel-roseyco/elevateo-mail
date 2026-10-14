# FE-PREVIEW-01 ? private synthetic frontend checkpoint

2026-10-14. Root visually inspected the running application at http://localhost:18140/dev-fixtures.html through Windows SSH PID 14364. Fleet bind is 127.0.0.1:18140; no public listener. Source is 03ae770c56271cd8236726bfd8fe63248e81283d. This is a synthetic frontend demonstration, not production mail or BE02/BE03 acceptance.

The static Vite fixture build uses the existing React client and MailroomGateway fixture adapter. The permanent banner states synthetic data; no real mail is sent/received/saved. Gateway changes last only in browser memory and reset on reload. Existing security-oriented fixture data is sparse; a separate representative demo is proposed without changing frozen test oracles.

Docker lint, strict typecheck, fixture build and 629 unit/component/contract tests in 31 files passed. Root actual visual inspection occurred; broader visual acceptance remains outstanding. Container elevateo-preview-20261014 uses image elevateo-preview-20261014:fixtures, non-root, read-only, 512 MiB, one CPU, no capabilities. Vite requires a task-local 16 MiB writable .vite-temp tmpfs. One-off check containers used --rm; build containers removed automatically. No task-owned dangling images remained; zero measurable bytes reclaimed. Preview image/container retained for the user's active session; persistent and unrelated Docker resources untouched. Fleet free space was 238 GB.

## Fleet commands

Run from /home/tanzeel/elevateo-mail-wave-20261014/lyra-preview:

```sh
DOCKER_BUILDKIT=0 docker build -f ops/preview-20261014/Dockerfile -t elevateo-preview-20261014:fixtures .
docker start elevateo-preview-20261014
# Restart an existing preview after an application-independent interruption:
docker restart elevateo-preview-20261014
# Repeat isolated frontend lint and tests:
docker run --rm --user 0 --network none --memory 2g --cpus 2 --label task=elevateo-preview-20261014 elevateo-preview-20261014:fixtures sh -c 'npm run lint && npm run test'
```

Initial container creation (only if the exact name is absent):

```sh
docker run -d --name elevateo-preview-20261014 --label task=elevateo-preview-20261014 --memory 512m --cpus 1 --pids-limit 100 --read-only --tmpfs /tmp:rw,noexec,nosuid,size=16m --tmpfs /build/apps/web/node_modules/.vite-temp:rw,nosuid,size=16m,uid=1000,gid=1000 --cap-drop ALL --security-opt no-new-privileges -p 127.0.0.1:18140:8080 elevateo-preview-20261014:fixtures
```

Windows tunnel, leaving the terminal alive:

```powershell
ssh -N -T -p 2222 -o BatchMode=yes -o ExitOnForwardFailure=yes -L 18140:127.0.0.1:18140 tanzeel@188.40.237.70
```

Open http://localhost:18140/dev-fixtures.html. Do not start a duplicate tunnel while PID 14364 owns that local port. Remote build/test/cleanup logs are ops/preview-20261014/build.log, tests.log and cleanup.json; they are runtime evidence, not production release artifacts.

## Dedicated design review: bounded BE03 parallel work

Root explicitly permits isolated BE03 implementation alongside BE02 validation. Integration and release remain gated on accepted BE02; this authorization supersedes the older brief's instruction to wait before starting isolated implementation, without changing the frozen C/D contract.

Prioritize S1/S2: additive Send schemas, persistence/privilege boundary, canonical review, atomic human approval and one durable queued intent. No dispatch driver invocation is needed to demonstrate the first slice. Retain required permanent operation binding, immutable snapshot, current authorization, audit and policy checks; time pressure is not authority to weaken them. Status/cancellation/dispatch/reconciliation stay separately incomplete until their evidence passes.

Highest-risk couplings are the privileged draft bridge, stable content version on consume, old successful save replay, permanent send identity versus seven-day draft detail retention, current scope before replay, response validation before commit, migration-slot serialization and shared route/config/contract registration ownership. Keep one integration owner and no edits to applied migrations. Missing policy/sender, empty or invalid recipients and max limits fail readiness rather than guessing.

Design-only source coverage: drafts/database.rb 1?51 (51), draft_operations.rb 1?86 (86), drafts_controller.rb 1?54 (54), preview Dockerfile 1?11 (11), total 202 lines; each read/file <=200. Reviewed null/empty/max handling, protected transaction ownership, explicit propagation and bounded response serialization against the full user rubric. Zero confirmed defects in this inspected source; density 0/202*1000 = 0 per 1,000 lines. This narrow review does not establish database-function correctness or BE03 acceptance. Formatting belongs to lint. BE03 implementation tests and updated docs are still required; the existing 629 tests do not cover new send code. Three concrete tradeoff simulations are recorded in project obsidian.md; the actual Windows Obsidian vault has not been synchronized.


## Synthetic demo checkpoint ? FE-PREVIEW-01

A separate demo entry now opens the fictitious Elevateo Studio team inbox with eight conversations, four unread items and two editable drafts. Reader, compose, draft save, read state and literal search use the existing typed in-memory gateway. Permanent banner: synthetic people/mail; no network or mail sending; changes reset on reload. Canonical security fixtures and their entry remain unchanged. Production mode excludes both synthetic entries.

Private fleet URL: `http://127.0.0.1:18141/demo.html`; Windows tunnel URL: `http://localhost:18141/demo.html`. Container `elevateo-preview-20261014-demo`, image `elevateo-preview-20261014:demo`. Original fixture preview on 18140 is retained until the replacement is visually approved. Docker strict typecheck/build, lint and all 632 tests across 32 files passed. Actual UI validation and independent adversarial review are assigned to the coordinator; these remain release gates.

Build: `DOCKER_BUILDKIT=0 docker build -f ops/preview-20261014/Dockerfile.demo -t elevateo-preview-20261014:demo .`. Restart: `docker restart elevateo-preview-20261014-demo`. Exact run flags match the original preview, substituting container suffix `-demo`, image tag `:demo`, and `-p 127.0.0.1:18141:8080`. Test: `docker run --rm --user 0 --network none --label task=elevateo-preview-20261014 --memory 2g --cpus 2 elevateo-preview-20261014:demo sh -c 'npm run lint && npm run test'`. Windows tunnel: `ssh -N -T -p 2222 -o ExitOnForwardFailure=yes -L 127.0.0.1:18141:127.0.0.1:18141 tanzeel@188.40.237.70`.

Cleanup after the demo rebuild removed the superseded task-owned dangling image `787ffc16a9e6` and its unused cache ancestry after checking labels and container references. Both serving images/containers remain retained. Exact reclaimed bytes were not measured. No unrelated images, volumes or containers were selected.

Visual copy correction checkpoint: corrected image `4ce7aefe738e` now serves private18141 after Docker strict typecheck/build and three targeted regression tests. ASCII separators and explicit newline paragraph join fix two actual visual defects. Independent design review: zero remaining design defects/195LOC; adversarial/visual final acceptance remains coordinator-owned. Removed exact superseded task images `fe65462aec57` and `a17740149170` plus unused cache ancestry; retained corrected demo and original18140. Reclaimed bytes not measured.
