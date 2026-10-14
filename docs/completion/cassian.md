# INT-801 Cassian implementation packet

Baseline: `bbf2353b254a05d48c2da7a508c143e6fba78691`; branch `completion-cassian-int801`. Scope: additive draft in `contracts/v2/openapi.json`, fail-closed `apps/server/config/v2_route_registry.rb`, generator command, strict TypeScript V2 boundary DTOs, a bounded browser gateway port, shared transport path admission, and structural tests. Candidate commit SHA is recorded in the control outbox after commit. No V1 schema, generated V1 DTO, active production Rails route or other owner's feature module changed. The Rails route file calls the disabled registry explicitly.

The organization grant interface uses an expected revision and cannot assign owner, so owner transfer needs a separately verified workflow. This follows the Vera access advisor's recommendation for distinct redacted admin metadata and a narrow grant mutation. Outreach permits only `mode: simulation`, and the worker endpoint declares a distinct principal. The worker identity mechanism, backend policy, persistence, and UI gateway remain owner dependencies. No upstream code was copied; this packet adapts only first-party interface patterns. Generated V2 OpenAPI declaration DTOs are requested via `contracts/tooling/generate-v2.sh` in a pinned fleet container; none are represented as generated yet.

Requested Docker checks through Soren: `ruby contracts/v2/contract_test.rb`; `ruby apps/server/test/v2_route_registry_test.rb`; generate V2 DTO in the pinned contract tooling container, then run affected TypeScript checks after owner adoption. Executed here: no application tests, builds, Docker or runtime. Source tests cover registration success, disabled and unready failures, V1 path noncollision, simulation-only mode, and worker/browser authority separation. Integrated authorization, real SQL, worker mTLS, client UI and end-to-end behavior are unverified.

Design tradeoff for root: a separate V2 document keeps frozen V1 hashes intact and lets owners agree operation IDs before route activation. The cost is another generator artifact and explicit gateway version selection. A monolithic V1 extension would reuse the existing generator but would disturb the frozen contract lock and risk accidental publication of unimplemented operations.

## Integrated continuation

All named owner candidate branches were merged into this isolated worktree through `696549b`; central document conflicts retained prior text and this note summarizes integration state. Theo V2 grant PUT exists but remains disabled pending Sabine's legacy-mutation ceiling and consent patch; GET needs Sabine's protected read and an effective-role page. Dorian's inert repository supports a bounded campaign list; Cassian added a tenant-protected V2 GET list route. V2 OpenAPI was corrected after Soren's exact intermediate fleet probe failed with JSON::ParserError (3 runs, 0 assertions). That failure is preserved, not treated as a test pass. Contract generated declarations, affected web/backend type and lint, SQL authorization and browser evidence remain pending Soren.

The next independent review packets are the V2 spec, Rails outreach controller/route/tests, and browser V2 runtime boundary/gateway. Simulated design case: a revoked organization actor whose campaign list request waits on the tenant snapshot must receive current authorization denial rather than a stale campaign page. This is analysis only; no race test has executed.

### Dorian controller merge and route candidate

Merged Dorian `d0b7a9a` and Celeste/Fable feature candidates. V2 route registry now points campaign list/detail/create/update, lead list/detail/add/email-update and per-campaign analytics to Dorian's guarded controllers. Account routes remain excluded while campaign-scoped path checks are resolved. The original interim campaign list controller was removed. These are active routes in an isolated source candidate, not tested or accepted behavior; no send operation exists in the V2 spec. The V2 schema includes server-owned status, per-row optimistic versions and bounded cursor pages. Grant and worker routes remain disabled pending Sabine authority and worker identity.

### Sabine authority merge

Merged Sabine `fc0b542`: protected redacted grant page, verified enrollment/provisioning hooks that do not seed real people, and a legacy mailbox-membership ceiling/consent patch. Theo GET grants, GET unbound roster and PUT subordinate role controller paths are now source-registered as isolated candidates. Effective roles are seven closed values; owner transfer is excluded. No real identities were enrolled and no SQL/HTTP fleet pass is claimed. Sabine's branch requires migration/protected-function and bypass-path adversarial tests before root acceptance.

Native broker and synthetic inbound interface proposals are documented in `contracts/v2/proposals.md`; neither is a released or active route.

### Browser Outreach adapter candidate

`apps/web/src/data/v2OutreachGateway.ts` now binds campaign, lead and analytics operations to Dorian's versioned endpoints through the existing bounded, same-origin JSON transport. It validates UUID paths, page bounds, CSRF-protected writes and strict server responses. Account methods deliberately return `temporarily_unavailable` without network dispatch while campaign scope and mailbox metadata policy are unresolved. Consent attestation is not exposed by this adapter; the server action remains unregistered. Celeste's UI supplies operation IDs and optimistic versions. Fable owns production `main.tsx` wiring after fleet type/lint/HTTP validation.
