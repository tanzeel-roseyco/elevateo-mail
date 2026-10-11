# Elevateo Mail web client - FE-01 read checkpoint

Strict TypeScript React client for the frozen `contracts/v1/openapi.json` read contract: session, mailboxes, thread summaries and a paginated plaintext reader. Composer, sending, attachments and collaboration mutations are not implemented. This checkpoint is not accepted for publication.

## Current state

FE-01-R1 stage A repairs transport cancellation/MIME handling, operation-specific fixture typing, contract tests and shared DOM cleanup. Coordinator Docker checks on Node 24.21.0/npm 11.19.0 pass strict typechecking, API regeneration, all 123 unit tests and production build. The production output contains none of the three tested fixture markers; this is not runtime isolation proof. Lint still fails on an unused session-test import assigned to Fable's next repair stage. Session lifecycle, pagination, modal accessibility, contrast, browser QA and real Rails integration remain open.

## Setup and verification

All package versions and the resolved tree are committed in `package.json` and `package-lock.json`. Run application checks inside Docker, from the repository root:

```sh
docker build -f apps/web/docker/test.Dockerfile -t elevateo-web-test .
docker run --rm elevateo-web-test
```

The target runs API regeneration, lint, strict typecheck, unit tests with coverage, production build and the fixture-marker check. Its accepted image is pinned by digest. Remove only task-owned disposable containers/images/cache after verification, preserving persistent data.

The coordinator used equivalent read-only source mounts and disposable tmpfs workspaces for stage A to limit local disk use. The full gate still includes lint and browser tests. No host tests are accepted.

## Architecture and entry points

- `index.html` and `src/main.tsx` use the HTTP gateway exclusively; API failures must never select fixtures.
- `dev-fixtures.html` and `src/dev/fixtureMain.tsx` provide a separately labelled development graph. Vite production configuration excludes that entry.
- `src/data/gateway.ts` defines the boundary; HTTP and fixture implementations validate the frozen DTOs. Fixture behavior does not establish backend authorization or pagination fidelity.
- Message content is escaped plaintext. No HTML, remote images or attachment execution is supported.

## Dependencies

Core pins include React 19.3.0, React Router 7.18.4, Zod 4.6.5, TypeScript 5.9.3, Vite 7.3.6, Vitest 4.1.11, Playwright 1.64.0 and openapi-typescript 7.13.0. See the package manifest for exact supporting versions. Node declarations support tooling typechecks; ESLint and its TypeScript/hooks integrations enforce the required lint gate. Radix Dialog 1.2.0 is pinned for the approved upcoming accessible drawer repair; it is not yet used. Tailwind/Vite plugins, DOM testing tools and React declarations support the existing client. The resolved 325-package audit reported zero vulnerabilities during stage A; that is a point-in-time result.

## Outstanding acceptance

Fable owns the accepted FE-01-R1 session/UI repair. Required evidence includes actual 409 retry-budget behavior, stale identity exclusion at first commit, cursor-reset replacement, preserved URL filters, real keyboard modal behavior, both-theme visual inspection, computed contrast, production-artifact API-failure isolation, hostile plaintext resource checks and real Rails conformance. Passing current tests does not close these missing behaviors. Hash routing remains the current hosting convention.
