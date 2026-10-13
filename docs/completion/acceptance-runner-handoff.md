# Acceptance runner source handoff

Current integration repair: task `task_1933956ef293`, dispatch `ctx_a984041680cf`, worker `term_3ad56a7f-b80e-411b-a366-9041ada59c2a`. This updates task `task_fed3a38a768b` / dispatch `ctx_ec349c5130a4` for the coordinator's nonroot ownership and verified Chrome archive instructions.

Status of these changes: **AUTHORED ONLY**. This dispatch ran no Docker, SSH, dependency installation, compilation, lint, tests, builds, commits or review agents. The coordinator separately reports harness compilation and **29 boundary tests PASS on fleet** before these repairs; that is not validation of these changes. All real GUI/runtime lanes, failure injection, sandbox verification and actual UI validation remain **NOT_RUN**. The coordinator owns independent reviews, fleet execution and final evidence reconciliation; that agent role does not require Unix root. This worker's actual provider model/effort is not independently attested by a requested identity label.

The opt-in `--acceptance` branch runs after the existing complete BE02 database/Ruby/Auth/API/worker checks and before the same final cleanup. Without this flag the existing test sequence remains in place. No production backend files, seed implementation, proxy implementation, shared contract or browser specs were edited here.

## Concrete integration

`ops/tests/be02/run.py` imports the new `acceptance_runtime.py` and uses `ops/compose.acceptance-test.yaml` as a second Compose file only after the base HTTP checks. The acceptance phase builds the production web proxy and browser images, stops Rails and its worker, updates the existing Auth origin, and runs the supported-Auth seed fixture against the same isolated PostgreSQL/Auth stack. It starts Rails/worker only after seed publication succeeds, then starts the proxy at `http://app.test:80` and executes selected browser lanes sequentially.

The proxy routes `/v1/*` and `/auth/accept` to Rails; `/auth/complete` serves the production SPA. Rails/worker receive `ELEVATEO_BROWSER_ORIGIN=http://app.test`; Auth receives matching external/site origin and the exact callback allowlist. Readiness checks require production `/` and `/auth/complete`, a signed-out `/v1/session` response, and absent fixture/source routes. No host ports, host browser origin or mock webServer are introduced. Database/Auth internal health probes remain inherited from BE02.

The seed fixture alone receives fixture admin/signing material. The acceptance host must have a nonzero effective UID and GID, own the staged source directory, and have local Docker socket access; fleet UID 1001 needs no sudo. The runner records `task.acceptance_uid` / `task.acceptance_gid`, creates and verifies its private directory as mode 0700 with those owners, and runs seed/browser containers as that exact UID:GID. The acceptance overlay replaces the seed's inherited Rails tmpfs mounts with matching owner IDs. The seed validates its current effective UID; the runner additionally verifies both owner IDs on the two regular, single-link mode-0600 files at `/acceptance/seed.json` and `/acceptance/acceptance-credentials.json`. No chown to image UID 10001 occurs. Browsers receive only read-only binds of the seed and credentials, with the latter at `/run/secrets/acceptance-credentials.json`; they log in through the actual UI. Browser/Grid/proxy environments are checked before start for privileged credentials and generated fixture-secret values. Selenium's two exact public image defaults are exempted because the direct Java entrypoint does not use the upstream Supervisor/TLS startup scripts.

Each lane gets its own mode-0700 output directory and precreated `cases` child, verified against the same recorded host UID/GID. Grid remains `1200:1201` and web runs as `10001:10001`; neither receives private or output binds. Shared config variables use lane `playwright_real`, `puppeteer_cdp` or `selenium`, profile `internal_http`, `ACCEPTANCE_BASE_URL=http://app.test`, and immutable run/dispatch IDs. Paths and numeric limits match `tests/acceptance/shared/config.ts`. The runtime image compiles every included acceptance source with Node 24.21.0; no runtime install or browser download occurs.

Execution order is selected Playwright engines, Puppeteer Chromium, then Selenium W3C Grid. Eight compiled unit entrypoints run in the first browser container before its browser suite: contracts/report-validation, proxy/proxy, each lane's boundaries unit spec, and Playwright credential-origin, credential-fill and screenshots unit specs. This includes all six currently visible `*.unit.spec.ts` sources plus the two earlier spec entrypoints; `puppeteer/ui.browser-probe.ts` belongs to the real-browser lane. The coordinator requested this integration in `msg_bf379c8e75ee`; coordination to `ctx_ae3470dce540` was attempted but its dispatch had already completed, so the current source filenames were reconciled directly and the coordinator was notified. Playwright runs its explicit config with native output confined to `/tmp`; Puppeteer and Selenium run their compiled `dist/<lane>/run.js`. External Docker subprocess deadlines bound each suite to 600 seconds, unit suites to 180 seconds, and the entire acceptance-enabled run to 7200 seconds; cleanup has a separate 240-second budget. Shared 120-second framework limits remain configured independently.

Each browser and Grid container is nonroot, read-only, capability-dropped, with no-new-privileges, 2 CPUs, 3 GiB memory, 1 GiB shared memory, a bounded `/tmp`, and the approved seccomp profile. Playwright Chromium explicitly requires its sandbox; Puppeteer retains its sandbox. Grid starts Java directly and Chrome's ELF at `/opt/google/chrome/chrome`, bypassing the image wrapper that injects `--no-sandbox`. There is no SYS_ADMIN or sandbox-disable fallback. The runner checks the Grid Chrome/driver versions and Playwright engine versions before entering the corresponding suite; startup failure is failure, not a substituted browser.

## Coordinator staging prerequisites

Create one fresh canonical Linux source directory owned by the invoking nonroot user, then freeze its source before invoking the runner; that user must still be able to create runtime evidence under `ops/local`. Overlay current BE `apps/server`, `contracts`, `ops` and tests; current FE `apps/web`; and Coord `tests/acceptance`, `ops/acceptance/web.Dockerfile` and this dispatch's `ops/acceptance/browsers.Dockerfile`. Include the seed worker's two files under BE `ops/tests/be02`, the coordinator's reviewed acceptance lock/compiler/spec sources, and the staged official Playwright v1.64.0 seccomp profile at `ops/acceptance/seccomp.json`. The acceptance overlay uses Compose `!override` for seed tmpfs ownership; fleet Compose must support that tag (2.24.4 or newer). Do not include local secrets, dependency trees or previously built assets.

The staged root `.dockerignore` MUST include these unconditional exclusions, without any negation rules or recipe-specific `web.Dockerfile.dockerignore` / `browsers.Dockerfile.dockerignore` overrides:

```text
ops/local
**/node_modules
**/dist
**/.env*
```

This prevents the generated BE02 environment and acceptance credentials under `ops/local` from entering the root build context. The runner rejects missing exclusions/overrides and local dotenv files in mounted or copied source trees. Runtime writes are confined to `ops/local`; the source inventory, including `.dockerignore`, acceptance sources, FE and both image recipes, is hashed before and after execution and compared even after failure.

Preload/review all immutable BE02 base pins and BuildKit/Ruby pins already specified in `docker_task.py` and `ops/compose.be02-test.yaml`, plus these Linux amd64 acceptance inputs. Runtime image inspection rejects anonymous image volumes and unexpected platform metadata.

| Input | Fixed tuple |
| --- | --- |
| Node | `node:24.21.0-bookworm-slim@sha256:d6aa754f16b3197301076f047b5def2f02ea1dbbc2ca920407d46d7ec7f87b20` |
| Playwright | `mcr.microsoft.com/playwright:v1.64.0-noble@sha256:06a9939e57531807f8d5fd76ce44b53165ffb7d7501d87ab10e285c20b1e971f` |
| Playwright engines | Chromium `156.0.8078.4`, Firefox `157.0`, WebKit `27.2`; all three are checked when selected |
| Puppeteer browser | Official Chrome for Testing ZIP `155.0.8059.39`; URL `https://storage.googleapis.com/chrome-for-testing-public/155.0.8059.39/linux64/chrome-linux64.zip`; exactly `198195769` bytes; SHA-256 `55672d1f392fd3e7b7a08621b6e804e6bcb39d40cf155504abb74b3a021ea8ea` |
| Selenium | Default `selenium/standalone-chrome:4.49.0-20260909@sha256:88dacdd42d93ab738bed045129376b2f965117c5f2e4710693e54695d531380d`; Chrome and ChromeDriver must both be `153.0.8010.47` |
| Seccomp | Official Playwright v1.64.0 profile, default SHA-256 `cc3e61cabda6bbc1e53e54d27ba4d55a9d3be829b6dd1a596f4a7b31b1cc7849`; default denial plus allowed clone/setns/unshare is checked; fleet user-namespace support remains to be proven |

The coordinator supplied the verified archive URL/length/hash and resolved Grid/profile digests. `--acceptance-puppeteer-image` and its image validation/build argument are removed. The archive is a fixed build input recorded separately from Docker image pins; it is never passed to Docker image inspection. Grid and seccomp now have the defaults above, while their existing explicit override options remain. Do not silently change tuple, platform, engine or sandbox settings to obtain a pass.

The browser recipe downloads the exact ZIP in a pinned Node 24 build stage, rejects redirects/non-200 responses or a mismatched content length, streams at most the expected byte count, enforces a 180-second hard deadline, and verifies final byte count and SHA-256 before extraction. Python stdlib in the pinned Playwright stage extracts the complete archive, rejects unsafe paths/symlinks/duplicate members, restores executable bits without setuid/setgid bits, and copies the full tree into the final image. No extra download script or unzip dependency was added. Puppeteer receives `PUPPETEER_EXECUTABLE_PATH=/opt/cft/chrome-linux64/chrome` and `PUPPETEER_EXPECTED_BROWSER_VERSION=155.0.8059.39` in both image defaults and Compose.

All 309 archive members, including their notices, are preserved. The coordinator's bounded central-directory inspection in `msg_bf379c8e75ee` records `chrome-linux64/ABOUT` (248 bytes) and `chrome-linux64/WidevineCdm/LICENSE` (473 bytes), with no `THIRD_PARTY_NOTICES` filename. Evidence: Coord `ops/local/acceptance-lock-20261014/output/chrome-archive-members.json` (98,595 bytes of HTTP ranges read). The worker read that metadata only; no archive download, extraction or browser/library compatibility execution occurred here. Do not infer the binary license from the GoogleChromeLabs repository license; the coordinator's instruction limits this binary to disposable private testing. Grid's direct Java flags, raw Chrome ELF path, fixed UID/GID, read-only filesystem and sandbox also require fleet verification. Existing reference links for that work: [Playwright Docker sandbox guidance](https://playwright.dev/docs/docker) and [pinned Grid Chrome wrapper](https://raw.githubusercontent.com/SeleniumHQ/docker-selenium/4.49.0-20260909/NodeChrome/wrap_chrome_binary).

## Nonroot fleet invocation

Run this from the frozen source root as the fleet's current nonroot user (UID 1001; its actual nonzero effective GID is recorded dynamically), with local Docker socket access. No sudo is needed or requested. The runner permits only a local Docker context endpoint of `unix:///var/run/docker.sock`; SSH/remote orchestration remains coordinator-owned outside this command. Supply the three guarded values for the selected context, exact host and current dispatch; Grid and seccomp use the resolved defaults in the preceding table.

```sh
test "$(id -u)" -ne 0 && test "$(id -g)" -ne 0 && \
python3 ops/tests/be02/run.py \
  --context "${BE02_DOCKER_CONTEXT:?select the reviewed local Docker context}" \
  --expect-host "${BE02_EXPECT_HOST:?set the exact reviewed short hostname}" \
  --acceptance \
  --acceptance-dispatch-id "${ACCEPTANCE_DISPATCH_ID:?set the current accepted dispatch ID}" \
  --acceptance-lanes playwright,puppeteer,selenium \
  --acceptance-browsers chromium,firefox,webkit
```

`--acceptance-lanes` accepts a nonempty unique comma-separated subset of `playwright,puppeteer,selenium`. `--acceptance-browsers` accepts a nonempty unique subset of `chromium,firefox,webkit`, used only for the Playwright lane. A selected unsupported engine fails; root can explicitly select supported engines in a separately identified run. `--server-image sha256:...` retains BE02's optional reviewed immutable server-image reuse. Reusing a shared image does not authorize deleting it.

## Results, incompleteness and cleanup

Evidence is under the printed `ops/local/be02-<uuid>/` directory. Safe case records and allowed screenshots are inside `playwright_real-<engine>/`, `puppeteer_cdp-chromium/` or `selenium-chrome/`; each contains `cases/`. `acceptance-owner.json` records the host UID/GID. `acceptance-inputs.json` records Docker image inputs and the fixed Chrome archive tuple before the build; `acceptance-images.json` records those inputs and resulting service image IDs after successful builds. The archive tuple is input evidence, not a claim that download/build succeeded. `acceptance-seed.sha256.json` records only the public runtime manifest's hash; `acceptance-results.json` records selected-lane status. `source.sha256.json` and `source.after.sha256.json`, `result.json`, `cleanup.json`, and host/Docker space records retain the normal lifecycle evidence.

Native browser/test stdout and stderr are discarded before disk capture. Command logs retain fixed exit/deadline metadata; API, Auth, proxy, seed, browser and Grid acceptance logging drivers are disabled. Grid HTTP/tracing/driver logs are disabled. No raw request, cookie, credential JSON or private manifest content is intentionally exported. Native Playwright failure attachments live only in container `/tmp` and disappear with the container. Root still reviews safe report/screenshot exports and enforces a host filesystem quota for total artifacts; the shared reporter limits are not an OS disk quota.

Passing a framework exit code is insufficient: the runner parses shared-schema case records, requires the correct run/dispatch/lane/profile, exact authored count (26 Playwright or 4 Puppeteer/Selenium), and every result to be `passed`. T1 currently includes 16 explicit `not_run` paths alongside 10 runnable sampled paths, so an otherwise successful default Playwright execution correctly makes the acceptance-enabled run **FAILED_OR_INCOMPLETE**. Later selected lanes are still attempted after an ordinary lane failure. Setup failure or unsafe cleanup stops progress. Root's T4 reconciliation owns authoritative scenario inventory and full matrix completeness; this count/status gate does not certify the full matrix, TLS, invitations, native clients or manual visual QA.

All service/image/bind allowlists are registered before creating acceptance resources. Containers are inspected before start and before removal for the exact image, recorded host UID:GID for seed/browser, fixed web/Grid users, memory/CPU, ports, network, logging, security and bind boundaries. Cleanup removes only this task's inspected containers, its exact builder/cache/database volumes/network, and its three labeled image tags. Shared pinned images and other workloads are retained. Private seed/credential files are deleted only after all potential consumers are gone, with exact path, recorded UID and GID, file-type, mode and link checks; missing/invalid recorded ownership, symlinks, unexpected entries or consumers are retained and cleanup fails. There is no broad prune or recursive private-directory deletion. The generated environment file is removed by the existing finalizer. The non-acceptance lifecycle remains unchanged.

No Docker resources were created or removed during this source-only dispatch; reclaimed space is **0 bytes**. Runtime cleanup, disk usage changes and any retained resources remain NOT_RUN and must be reported from the actual execution's cleanup/space records. Windows disk compaction is not applicable to this unexecuted Linux fleet task.

## Static self-review and root review checklist

Static reading covered the ownership flow through runner/Compose/seed/cleanup and the archive flow through build/launcher/evidence. This repair removes the two reported integration blockers and also replaces inherited UID-10001 seed tmpfs mounts so the nonroot seed can write its own Rails temp/log paths. These are author corrections, not independent defect accounting. Independent review defect count/density: **NOT_ASSESSED**, not zero; the coordinator records actual review findings in `code-reviews.md`. No Obsidian simulation or adversarial agent review was run under this dispatch's prohibition.

- Review the default non-acceptance path and opt-in ordering; verify source hashes on success, lane failure and interrupted execution.
- Review private build-context exclusion, seed ownership/mode checks, runtime credential separation and safe logs/exports.
- Verify UID-1001 execution with the actual host GID, Compose tmpfs replacement, strict mode/owner/symlink refusal, and cleanup against recorded ownership. Verify Grid/web keep their fixed users and have no private binds.
- Build the fixed archive stages and prove byte/hash/deadline failures stop the build; inspect retained archive notices, executable modes, and the exact Puppeteer launch path/version. No SYS_ADMIN or disabled-sandbox repair is authorized.
- Review exact cleanup on build/create/start/test/timeout failures, shared pin preservation and mismatched-resource retention.
- Review every selected engine and Grid tuple/sandbox, production routing, supported Auth seed, UI login and shared report completeness.
- Run formatting/lint/typecheck and meaningful failure-path tests in Docker; manually inspect the actual UI before publishing. Root must supply tests for runner lifecycle regressions rather than treat author reading as execution evidence.
- Use review slices at most 200 lines: runtime lines 1-125 and 126-249; each remaining source file separately. Assign a dedicated design reviewer the 99-line acceptance cleanup module plus runtime lines 1-100 (199 lines) for recorded ownership/registration versus cleanup tradeoffs, then a separate bounded review of remaining orchestration. The 93-line browser recipe needs its own download/extraction failure review.

## Exact source inventory

Physical LOC includes blank lines and comments. This repair modifies exactly the four code files below, totaling **584 lines**, plus this handoff document. It does not edit the earlier worker's `run.py`, `docker_task.py`, `cleanup.py`, seed code, frontend, harness, or other source. The BE02 files were already untracked, so these are final-file inventories, not a fabricated tracked diff size. Report self-hash is supplied separately to avoid recursive hashing; rehash after any coordinator edits or line-ending normalization.

| Root | File | LOC | SHA-256 |
| --- | --- | ---: | --- |
| BE02 | `ops/tests/be02/acceptance_runtime.py` | 249 | `17B5AD47118C586879A4EFDA9BB57C621DA193E023F1875C8112F86E79DC62C4` |
| BE02 | `ops/tests/be02/acceptance_cleanup.py` | 99 | `E64811160C2F4950EABE149AB0FA2F0E4A115A194CA3E53C1EE81D3B1D5D867C` |
| BE02 | `ops/compose.acceptance-test.yaml` | 143 | `215D985A3D9B6831DBBE2AC60A4DE7C615DD832769694BBB222EB25D7DF321E3` |
| Coord | `ops/acceptance/browsers.Dockerfile` | 93 | `DBC9D8AA333F2482F2AD3EF01B5F9C92A22D35EA0B797630E389DB71D4A14F5B` |
