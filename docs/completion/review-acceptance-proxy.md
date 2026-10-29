# Acceptance proxy bounded adversarial review

Date: 2026-10-14. Task task_ad21e80c445b / dispatch ctx_bbcbe8300ff7.
Actual execution identity: gpt-6-astra, low effort (root launch metadata supplied in dispatch).
Scope: read-only source review; only this report written. Runtime: **NOT_RUN**.

## Verdict and accounting

No confirmed defects identified within the assigned slice. Defect count **0**; density **0 / 336 × 1000 = 0 defects/KLOC**. This is a bounded static result, not application acceptance, a security proof, or a test-pass claim. Numbered defects: none; no source repair proposed.

All supplied SHA256 values were verified before source inspection and rechecked unchanged immediately before report preparation. Pass 1 inspected 183 physical lines (five production TypeScript files and Dockerfile); pass 2 inspected 153 physical lines (131-line socket suite and 22-line unavailable mapping). Total 336 unique implementation/test/build lines, including blanks/comments; each pass below 200 and assignment below 400. No backend source or other implementation was inspected. Root AGENTS.md and .planning/STANDARDS.md were read for review policy; broad project status documentation output was truncated, so no comprehensive documentation-currentness claim is made.

## Exact coverage

All paths relative to coordinator workspace `C:/Users/Tanzeel/Code and projects/Elevateo Mail - Local Completion`.

| File | Inspected range / LOC | SHA256 |
| --- | --- | --- |
| tests/acceptance/proxy/main.ts | 1–19 / 19 | 1153e64f5f98658da1f28253d91ed1d313c54c7f69f1ff6189f3682f9dd9585a |
| tests/acceptance/proxy/routing.ts | 1–22 / 22 | 5cab41383ae6ee4d91b6c8d71474a4abb9c6600cd522a84ad713d1c2a00facb6 |
| tests/acceptance/proxy/server.ts | 1–34 / 34 | 27e5f9b7f915c62b6596d9e9759cc5085a76650a06a13e9ebaa0dfcae1e2d265 |
| tests/acceptance/proxy/static.ts | 1–41 / 41 | bcd6e77b6314ad3b43174b7ba1b744d7d993b8f716a765dc6e3f114d646c766a |
| tests/acceptance/proxy/upstream.ts | 1–42 / 42 | 18c3f845a630e3d2fb1bdfa4a127cbea02525c83b6c6d65eb9cc6b0b5fbfeb9d |
| tests/acceptance/proxy/proxy.spec.ts | 1–131 / 131 | 36d398bbbe03fd60afa3f4868d41bb33dc32f68510fae27bd4e7ac0fcf2c744d |
| ops/acceptance/web.Dockerfile | 1–25 / 25 | 210476d9b267758cb573bf1a431804511d6ccc201e4a394553a3e9afef3effe0 |
| tests/acceptance/playwright/unavailable.e2e.ts | 1–22 / 22 | 7a9e882e53d03e4c24b951ae615a6809aaab6b0b119670d7de21609ccd7c8852 |

## Review checklist and evidence

- Production asset routing: Dockerfile 7–8 rebuilds dist and rejects a fixture entry; 19–20 copies generated assets and runtime modules. Routing 14–20 denies source/fixture routes and limits document fallback to explicit paths. Static 19–28 restricts extensions/HTML, resolves symlinks, checks containment and caps file size. The socket test uses synthetic HTML/JS, so it does not establish the contents or usability of the real production bundle.
- Null/empty/boundary handling: missing Host rejected; missing URL becomes empty and is rejected; malformed percent escapes, traversal, controls and oversized target rejected. Static requests accept only GET/HEAD without a body. API buffers at most 1 MiB before forwarding; advertised oversize bodies reject early. Header cap 16 KiB, 64 connections, 100 requests/socket and explicit deadlines are present. Actual parser behavior and exact-boundary races were not executed.
- Origin, cookies and host: upstream 25–31 preserves ordinary Origin/Cookie, strips forwarding spoof inputs and supplies fixed app.test/http/80 forwarding identity. Response filtering retains ordinary Set-Cookie arrays without flattening; test 80–113 asserts two cookies, status/body and ordinary origin/host behavior. Connection-nominated fields are intentionally removed by the hop-by-hop filter; this review does not establish Rails behavior for absent Origin or malicious Connection nominations. Actual cookie Domain/Secure/SameSite suitability and backend CSRF decisions remain outside coverage.
- Failures/deadlines/cleanup: safeError avoids a second completed response and destroys an already-started response. Overall deadline, upstream timer, upstream error handler and downstream-close cancellation exist. Static streams are destroyed on response close; process signals close server connections. Tests cover failed and stalled upstream status, but not shutdown, slow upload, client abort, partial response or active resource disappearance.
- State and authorization: no domain state or database mutations are implemented here; bounded requests are forwarded to one fixed API. Mailbox permission enforcement remains the backend's responsibility and is unchecked. This proxy is not independently authenticated and depends on the explicitly private network contract.
- Maintainability/design: routing, static serving, upstream forwarding and process bootstrap have separate concerns. Shared safeError and header filtering avoid obvious duplication; no unnecessary domain abstraction observed. AIDEV notes explain containment immutability, raw-target validation and deployment assumptions. Formatting is delegated to linters, not reviewed manually.
- Tests: four actual node:test cases cover happy paths and multiple rejection/upstream failure paths. Missing regression partitions include streamed oversize bodies, exactly-at-limit bodies/targets, hostile Connection tokens, partial-response abort, disconnect cancellation, signal cleanup and real output asset verification. These are coverage limits, not inferred failing tests.
- Honest evidence mapping: unavailable.e2e.ts declares 16 scenario IDs with missing-control reasons and calls imported unavailable. It implements none of those scenarios. The imported helper and reporting consumer were not inspected, so final NOT_RUN mapping remains unchecked. The coordinator-supplied statement that four proxy tests were included in a 29-boundary Docker PASS is external context only; no logs were inspected and no GUI result follows from it.

## Design limits and unchecked dependencies

The fixed host/default port policy is deliberately narrower than a general HTTP reverse proxy: even app.test:80 and uppercase host are rejected, as explicitly tested. Bounded prebuffering prevents oversized writes from partially reaching the API, trading memory and upload latency for that invariant. A 64-connection cap bounds concurrent buffering but does not prove a total memory budget. Streaming static/API responses relies on backpressure and deadlines; no response byte cap exists for API output. These are analytical observations, not a deep architecture approval or an Obsidian simulation; no Obsidian connection was used in this bounded assignment.

Unchecked: Vite/build configuration, production asset inventory, package manifests/locks and image availability, Docker network/published-port/read-only filesystem/resource constraints, Node parser and timeout runtime behavior, Rails route normalization and trusted-proxy/CSRF/auth/cookie configuration, real API contracts, cases.ts unavailable implementation, scenario reporter, browser rendering and screenshots. The supplied pinned image and strict tsc invocation were inspected as text only. No host tests, Docker, SSH, web server, installs, subagents, commits or source modifications were performed. Root retains fleet execution, integration acceptance and aggregate code-reviews.md updates.
