# Acceptance proxy handoff

2026-10-14; task `task_0ff4c1b82cb1`, dispatch `ctx_30e5296d72c8`.
Authored test infrastructure only. Build, strict compilation, unit/socket tests,
Docker port binding, image inspection, real-service integration, and browser/visual
validation are all **NOT_RUN**. No host install/build/test, Docker, SSH, commit,
subagent or ultrareview was performed. Root owns integration, review, execution,
evidence and exact task-resource cleanup. No execution resources were created.

## Interface and limits

- Runtime: fixed nonroot `node` user, port **80**, browser origin `http://app.test`,
  exact Host `app.test`, fixed upstream `http://api:3000`, static root `/srv/web`.
  `app.test:8080` and even explicitly supplied `app.test:80` Host are rejected.
- Startup reads Linux `ip_unprivileged_port_start` and refuses root execution or
  a value above 80. This is a runtime assertion, **not observed verification** of
  the target host default. Root must verify it in the actual network namespace;
  if necessary explicitly set `net.ipv4.ip_unprivileged_port_start=0` in Compose.
  No privileged container or capability is required by this implementation.
- `/v1/*` and exact `/auth/accept` proxy without redirects/retries/SPA fallback.
  Browser Origin/Cookie, ordinary end-to-end request headers and multiple
  Set-Cookie response headers survive; hop-by-hop and client forwarding headers
  are removed. Host and X-Forwarded-Host/Proto/Port are set to the original trusted
  HTTP browser identity, not the internal upstream service identity.
- `/`, `/index.html`, `/auth/complete` and `/auth/complete/` serve the production
  index. HashRouter needs no broad path fallback. Missing assets/unknown routes
  return 404. Dot segments/dotfiles, double encoding, backslashes and malformed
  paths fail closed; fixture/source paths are blocked. Realpath containment also
  excludes outside-root and hidden-target symlinks. Runtime filesystem must be
  immutable to prevent check/open races.
- 8 KiB target, 16 KiB headers, 1 MiB buffered API request body, 32 MiB static file,
  64 connections, 100 requests/socket, 1s keepalive and 15s request/deadline limits.
  Streaming responses use backpressure; downstream disconnect cancels upstream.
  API connection errors produce 502, deadlines 504; errors after response headers
  close the connection because an alternate status can no longer be sent.
- No access logging, bodies, query strings, headers, exception details or secrets
  are emitted. Startup failures emit a fixed safe message. Synthetic data only.

## Root-owned build context

Stage a clean immutable context containing:

1. `apps/web/**` from sibling `Elevateo Mail - Fable FE01 R1/apps/web`, including
   its package lock and generated types; exclude node_modules, dist, credentials,
   reports and caches. Freeze source hashes/provenance before staging.
2. Matching `contracts/**` from that FE source freeze (its fixtures/imports and
   OpenAPI generation refer to this relative path); root reconciles canonical
   contract changes rather than this worker editing FE/BE.
3. Root's `tests/acceptance/package.json` and `package-lock.json`, proxy sources,
   and `ops/acceptance/web.Dockerfile` from this handoff.

Both build stages use `npm ci --no-audit --no-fund` with their own lock. FE uses
existing `npm run build` (TypeScript then production Vite), clears staged dist
first and refuses a fixture HTML artifact. No fixture launcher is used. Proxy
uses existing TypeScript 5.9.3 / @types/node 24.19.2; there is **no added runtime
dependency**. Its runtime imports only Node standard-library modules.

Every stage pins
`node:24.21.0-bookworm-slim@sha256:d6aa754f16b3197301076f047b5def2f02ea1dbbc2ca920407d46d7ec7f87b20`.
Root must verify actual platform/runtime identity and npm lock integrity. The
image recipe directly compiles strict proxy and regression sources; it does not
depend on changing T0 tsconfig's currently restricted include list. For T0's
normal build/test runner, root should include `proxy/**/*.ts` and explicitly run
`dist/proxy/proxy.spec.js`; this worker did not edit package/tsconfig.

## Exact commands for root execution

Run from the immutable context root, within root's existing approved resource
reservation. These commands are provided only; **none were executed**:

```sh
docker build --target proxy-build -f ops/acceptance/web.Dockerfile -t elevateo-acceptance-proxy-check:ctx30e5296d72c8 .
docker run --rm --network none --user node --read-only --tmpfs /tmp:rw,nosuid,nodev,noexec,size=16m --cap-drop ALL --security-opt no-new-privileges --memory 256m --cpus 1 --pids-limit 64 elevateo-acceptance-proxy-check:ctx30e5296d72c8 node --test dist/proxy.spec.js
docker build -f ops/acceptance/web.Dockerfile -t elevateo-acceptance-web:ctx30e5296d72c8 .
```

The four regression groups cover raw routing/host limits; real socket production
documents/assets/symlink escape/method denial; upstream status/cookies/origin/
spoofed forwarding/body limits; and failed/stalled upstream with no HTML fallback.
Loopback sockets are container-internal only. Socket deadlines bound failed tests.

Runtime Compose requirements (root-owned file): image above, internal network
alias `app.test`, API service alias `api` port 3000, **no published ports**, no
public egress, init enabled, user node, read-only rootfs, cap_drop ALL,
no-new-privileges, task labels, explicit CPU/PID/memory caps (initial proxy budget
128 MiB), and verified unprivileged port sysctl. **No runtime mounts or secrets
are required**; `/srv/web` and `/srv/proxy` are baked into the image. Do not mount
host source or a fixture dist over them. Root's build context is an input, not a
runtime mount. Test-only writable `/tmp` above is disposable.

Root must separately prove content type/routing, real Auth issuance and callback,
session/read/write/logout, original-origin CSRF, durable DB state, private-network
egress denial, and actual browser visuals. HTTP evidence cannot close TLS/Secure
cookie production gates. Bounded independent review and design review remain
pending; no defect-density or review-pass claim is made by the author.

## Source freeze

Physical line counts include blanks/comments. Hashes below cover exact file bytes
at handoff; root should rehash before execution and record any subsequent repair.

| File | LOC | SHA-256 |
| --- | ---: | --- |
| tests/acceptance/proxy/main.ts | 19 | 1153e64f5f98658da1f28253d91ed1d313c54c7f69f1ff6189f3682f9dd9585a |
| tests/acceptance/proxy/routing.ts | 22 | 5cab41383ae6ee4d91b6c8d71474a4abb9c6600cd522a84ad713d1c2a00facb6 |
| tests/acceptance/proxy/server.ts | 34 | 27e5f9b7f915c62b6596d9e9759cc5085a76650a06a13e9ebaa0dfcae1e2d265 |
| tests/acceptance/proxy/static.ts | 41 | bcd6e77b6314ad3b43174b7ba1b744d7d993b8f716a765dc6e3f114d646c766a |
| tests/acceptance/proxy/upstream.ts | 42 | 18c3f845a630e3d2fb1bdfa4a127cbea02525c83b6c6d65eb9cc6b0b5fbfeb9d |
| tests/acceptance/proxy/proxy.spec.ts | 131 | 36d398bbbe03fd60afa3f4868d41bb33dc32f68510fae27bd4e7ac0fcf2c744d |
| ops/acceptance/web.Dockerfile | 25 | 210476d9b267758cb573bf1a431804511d6ccc201e4a394553a3e9afef3effe0 |
