# Railway edge verification, 2026-10-23

Status: built and tested in isolated fleet-02 Docker; **not deployed**. No Cloudflare configuration, DNS, Workspace mail routing, live application database or provider send was changed.

The candidate combines the integrated Fable SSO frontend (`ec4d81b89a220be83757c0cbc71218dce7c1d594`) and `ops/railway/{Dockerfile,start.sh,nginx.conf.template,railway.json,edge-test.cjs}`. The edge serves the production web bundle, forwards API traffic through pinned SSH transport, exposes only the two OAuth navigation paths, suppresses OAuth request logging, and keeps provider ingestion held. Rails remains the session and authorization authority. An edge health response alone does not establish backend readiness.

The fleet build completed at approximately 18:23 UTC on 2026-10-22. Image `elevateo-railway-edge-20261023:check` had config digest `sha256:519cc69bb4e3b7c155ca3496caa36552b6eb22564b29276f886c320368989926` and manifest-list digest `sha256:8915fa2f6e24ce618b57048507f8ab6fa78a4715513986b894624418be7c77f9`. The application production build passed. The build reported the existing approximately 571 kB app-chunk warning.

`edge-test.cjs` passed **46 assertions** in a disposable Docker container: held provider endpoints, private Auth endpoint denial, API routing, fixed public Host/HTTPS metadata, spoofed forwarding-header removal, no-store/no-referrer headers, OAuth prefix rewriting, both fixed SSH destinations, private-key mode 0600, and process failure when the SSH child exits. All upstreams and SSH were test doubles; no live API call was made. Container removal used `--rm`.

Independent bounded source review covered 180 LOC with zero confirmed defects (0/KLOC). This does not prove real Google redirects/cookies, provider log secrecy under real traffic, actual Railway-to-fleet connectivity or live authorization. Missing-config and nginx-child failure cases were identified as additional test coverage opportunities rather than established runtime acceptance.

Root visually inspected all 14 Fable login screenshots at 1440px and 390px. Fable's original full web gate passed 85 files / 1,063 tests, lint, typecheck, both contract checks, production build and fixture exclusion; ten Playwright login cases passed. A later accessibility/focus-test repair is being verified separately and is not included in this image's evidence.

Deployment remains gated on real Google OAuth credentials, preservation-first database initialization, verified tenant membership provisioning and real mailbox credentials. No public login or live mail acceptance is claimed. Exact image/cache cleanup is recorded separately after the final Docker consumer releases it; shared builder cache must not be broadly pruned.
