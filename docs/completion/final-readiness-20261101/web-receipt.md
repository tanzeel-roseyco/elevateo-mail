# Web verification receipt — 2026-11-01

Docker context: `desktop-linux`. No deployment or external backend was used.

## Automated gate

Built `apps/web/docker/test.Dockerfile` from this checkout. After repairs, copied the changed sources into the task container and captured `elevateo-client-web-verified-source:20261101`.

```sh
docker run --name elevateo-client-web-final-20261101 --memory=1500m --cpus=1 elevateo-client-web-verified-source:20261101 bash -ceu 'npm run lint && npm run typecheck && npm run test -- --coverage --maxWorkers=1 && npm run build && npm run check:bundle'
```

PASS: lint, typecheck, 99 test files / 1,195 tests (zero failures or skips), production build, 500 KB entry bundle budget. Coverage: statements 84.28%, branches 79.10%, functions 79.94%, lines 89.11%. Both `npm run check:api` and `npm run check:api:v2` passed in the initial gate. Production fixture-marker scan passed separately on the resulting build.

Evidence: `web-gate-final.log`, `web-gate.log`, `web-production-markers.log`. Initial attempts remain in the evidence: lint caught an unused mock parameter; two new mailbox-limit tests exceeded the five-second timeout due to repeated dialog layout. Typed mock and batched event-driven fixture selection fixed those test defects; the complete suite was rerun. Existing jsdom `window.scrollTo` warnings do not represent browser verification.

## Confirmed product repairs

- Reject obsolete connection-list responses after mutations.
- Validate the contract's 50-mailbox grant limit, including 50/51 regression cases.
- Mark unpublished connector setup as planned and fixture grants as simulated.
- Synchronize suppression search input with URL navigation.
- Replace invalid paragraph wrappers around block loading/error notices; regression checks valid nesting.

Bounded adversarial review coverage is in `reviews.md`. Browser coverage and screenshot inspection are separate pending gates at this checkpoint.

Follow-up outside this scope: npm installation reported 18 dependency advisories (16 moderate, two high); no dependency upgrade was attempted without investigating compatibility.
