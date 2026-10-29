# Email finder module — 2026-10-29

Branch: `feature/email-finder`, based on `c1ac27bd`. Worktree: `Elevateo Mail - Email Finder`.

## Delivered scope

Four authenticated tools (person finder, verifier, company emails, decision makers), CSV jobs and export,
suppression management, and limits/health UI. Rails owns durable PostgreSQL jobs, cache, learned patterns,
tenant isolation and a globally serialized worker. Discovery uses public websites/PDFs and keyless search;
SMTP uses port 25 with STARTTLS when offered and never DATA. Hard limits and reputation pauses are
persisted before probing. Migration 44 is reversible. The worker joins the existing Hetzner Compose stack.

Implementation: `apps/server/lib/elevateo/email_finder`, its v2 controller, migration and tests;
`apps/web/src/features/email-finder`, gateway and browser tests; `contracts/v2/openapi.json`.
Operational instructions: [email-finder.md](../email-finder.md). Review coverage: [code-reviews.md](../../code-reviews.md).

## Verification

Local Docker Desktop only. No host tests, live sends, public SMTP/discovery probes, deployments or DNS changes.
Primary command: `powershell -File ops/tests/email-finder/check.ps1`.
Ignored evidence: `.local-jobs/email-finder-check-1e6da5c7e2` and focused rerun logs alongside it.

The initial standard backend pass ran 1,301 tests / 14,410 assertions. Its three test failures were corrected:
a write RLS policy incorrectly applied during SELECT, an unqualified test constant, and an outdated route
mapper/count. The final focused rerun passed all 53 finder tests / 327 assertions and
12 route tests / 31 assertions. Following the typed socket refactor, its nine SMTP tests
and five input tests also passed again (63 assertions). `bundle exec steep check -j 2`
reports no type errors; `bundle exec rubocop --lint --format simple --cache false`
reports 515 files inspected with no offenses. These final gates used the source-mounted
server image in Docker, with no external network.

Eight supplemental suites ran 27 tests / 160 assertions; six suites passed. Two existing suites failed
(two assertions and one error): organization-access rollback conflicts with migration 39 foreign keys;
gateway ACL function counts predate migration 37. Those tests/migrations are unchanged from the base.

Existing contract checks also fail independently of this module: v1 preservation hashes (11 tests,
111 assertions, two failures), and v2's active-operation/no-send assumptions conflict with its existing
`ingestResendProviderEvent` entry (four tests, 22 assertions, two failures). These were preserved as follow-ups.

Four historical R1 suites require the old migrations 1–2 schema/roles. The Mox application-chain suite
requires its private TLS/DNS/control fixture. These five suites were not run against an incompatible fixture.
The existing repository therefore cannot be described as having a fully passing test suite.

## Assumptions and activation

- No new secrets, keys, accounts or services. New nonsecret environment variable: `ELEVATEO_FINDER_PUBLIC_IP`.
- Empty public IP leaves SMTP unavailable with a visible reason; discovery remains usable.
- Existing Authentik/Outreach permissions authorize access. Jobs are creator-scoped within the organization;
  opt-outs apply organization-wide. Global pattern fallback is organization-wide to preserve tenant privacy.
- PTR and outbound-port availability must be verified by the worker after an authorized future deployment.
- No Obsidian connection was available; design tradeoffs were modeled analytically and reviewed in code.

## Final gates and cleanup

Browser verification used the pinned Playwright image on local Docker Desktop with
`--network none`. `npm run lint`, `npm run typecheck`, `npm test` (91 files, 1,131 tests)
and `npm run build` pass. API types and the downloadable Postman collection were regenerated
from the updated v2 contract. Build retains the existing large-chunk/dependency-comment warnings.

The full `npm run test:e2e` invocation ran 508 cases: 131 passed, 33 failed, 344 skipped.
Three failures were a hardcoded keyboard traversal budget affected by the extra navigation
link; the bound now derives from visible tab stops. A focused rerun of finder and reader
tests passed 47 and failed 13: all 12 finder cases and all four keyboard-navigation cases
pass. The remaining reader failures concern existing ambiguous Unread locators, a missing
animation probe and a narrow-screen pointer interception. Other full-run failures concern
existing draft/assignment locators and pre-shell sign-in/workspace interactions. These are
classified by failure location and unchanged source, not by executing a separate pristine
baseline. They remain follow-ups; the whole browser suite is not green.

Finder forms/results/suppression screenshots were captured at desktop, 1440px, 390px and
reduced-motion settings. Actual rendered form and result screenshots were manually inspected
at desktop and 390px: readable wrapped controls/results, no horizontal overflow, visible
unavailable-SMTP reason, risky status, progress and CSV controls. Browser tests exercise
successful lookup/export, blocked sources and API error states. Evidence remains under
ignored `.local-jobs/email-finder-visual` and `apps/web/e2e/.results`.

`sh /production/deploy.sh config --quiet` passed in Docker using disposable environment
values. It parsed configuration only; nothing was deployed. Windows runner quoting was
corrected by mounting `web-gates.sh`; cleanup/context guards received a final adversarial
review. Tests did not use live external discovery or SMTP servers.

Final disposable containers and web image were removed after inspecting mounts. The
requested `docker builder prune -a -f` and `docker image prune -a -f` both ran and reported
0 B additional reclamation. Final logical image usage dropped from 4.467 GB to 328.8 MB;
container usage from 496.9 MB to 427.2 MB. Retained: unrelated `pp-claude-resume-tests`
and its image, nine persistent volumes (4.294 GB), and 675.9 MB of BuildKit records marked
non-reclaimable by Docker. No volumes were pruned. Host C: free space was 21,051,133,952
bytes after cleanup; no physical VHD compaction gain is claimed. Docker Desktop remains
running; shutdown/offline compaction was not attempted because it could disrupt shared work.

Useful exact rerun commands (inside the harness containers):

- Backend: `bundle exec ruby test/email_finder/<suite>_test.rb`,
  `bundle exec steep check -j 2`, `bundle exec rubocop --lint --format simple --cache false`.
- Web: `npm run generate:api:v2`, `npm run lint`, `npm run typecheck`, `npm test`,
  `npx playwright test e2e/email-finder.spec.ts e2e/read.spec.ts`, `npm run build`.
- Postman regeneration: `node --experimental-strip-types /generate-postman.mjs` with
  `ops/tests/email-finder/generate-postman.mjs` mounted at that path in the web image.

The module is implemented and verified within these limits. Repository-wide failing gates
and future production PTR/port-25 activation prevent claiming deployment acceptance.
