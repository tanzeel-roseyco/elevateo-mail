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

### Fleet receipts observed during continuation

Soren's `ruby-batch-next-20261014.txt` records exact bbed59c V2 contract 3 runs/10 assertions and route registry 3 runs/9 assertions, both PASS exit0 in the pinned Ruby image with task container absent. This proves those two structural checks on bbed59c only. The earlier 696549b JSON parse failure remains in history. Soren's integrated DB b071c93 receipt reports migration FAILED before business tests and cleanup PASS; exact migration error was requested. Dorian 21536e5 repository unit failed with missing ActiveRecord constant, and Celeste a460c5a lint failed two control-regex rules; owners received exact findings. No later integrated exact-candidate PASS has been reported.

Safety correction: Sabine added `app.authorize_outreach_draft_write`, but Dorian's current controller source had not invoked it. Cassian removed campaign/lead write registrations from the active isolated route list and marked their V2 operations disabled until the current-role helper and denied/stale tests are integrated. Read-only campaign/lead/analytics routes remain candidate-active. No prior runtime acceptance is inferred.

Sabine's later protected grant page and Theo controller now return a separately authenticated actor grant on every page. Canonical V2 `OrganizationGrantPage.actor` is required and strict. Lyra must verify actor ID/organization and stable role/revision across pages and use this server proof for UI hints; list position must not decide actor authority. The server remains final authority for every mutation.

### Later integrated candidate and fleet blockers

Dorian b3438e4 now invokes Sabine current-role proof for every Outreach read and draft write inside the guarded transaction. Cassian source-registered four inert draft write operations and marked their V2 OpenAPI statuses active in the isolated candidate. The earlier safety correction remains historically accurate for its SHA; these routes still require SQL/HTTP denied, stale-role, CSRF and replay checks before acceptance. No send route was added.

Soren exact f787bbc web lint failed on Fable Shell.test.tsx parser line 430 and six unused mock parameters in Cassian v2OutreachGateway.test.ts. Cassian repaired the six own lint errors at d9b94de; Fable repair is owner-pending. Exact f787bbc DB migration failed in Nadia AddSendCancellation#up because elevateo_send_owner lacked CREATE on schema app, before application tests. No integrated runtime PASS is claimed. Requested Soren rerun: pinned fleet Docker `ruby contracts/v2/contract_test.rb`, `ruby apps/server/test/v2_route_registry_test.rb`, full web lint/type/unit/build and backend DB migration/SQL/HTTP after owner repairs; generate V2 declarations from exact spec, then compare source hash. Executed here: no app tests/builds/Docker.

The V2 generator wrapper now delegates to the existing web package script from its actual package directory; a matching `check:api:v2` command is available after Soren generates the declaration. The declaration remains absent until fleet Docker emits and validates it. Nadia 08ee821 migration privilege repair and Dorian 2e0e87d digest-backed Outreach RLS are merged in the current candidate but untested here.

Fable 77dbd86 production Outreach binding merged as c966427. Static review still identifies Shell.test.tsx line 431 quote parse, six unused bridge-test mock parameters and likely TypeScript account-method arity mismatch; owner was notified through root. Binding is candidate source only, not a web PASS.

Soren exact ea92754 integrated DB receipt failed at Corin CreateIsolatedInbound#up line 45: PostgreSQL syntax error at end of SQL input after `CASE WHEN jsonb_typeof(p_attachments) = 'array' THEN`. Earlier Nadia migration was passed on that run, but overall migration/SQL/HTTP remain FAILED/NOT_REACHED. Soren cleanup passed; Corin owner repair requested with receipt path in the shared outbox.

Soren exact 93f7b14 fleet web run passed frozen V1 `check:api`, then lint FAILED with six Fable `outreachGatewayBridge.test.ts` unused mock parameters (lines 16/23/31); type/unit/build NOT_REACHED. Cleanup reported zero remaining task containers/image. Fable owner repair requested; no web PASS.

Cassian aligned the inert account adapter signatures to Celeste's campaign-scoped port while preserving zero dispatch. Fable may remove the now-unneeded bridge or forward all four arguments exactly; Fable owns production binding. A focused no-dispatch test covers both account methods, requested for Soren fleet Docker.

Corin e94631f repairs the PL/pgSQL attachment CASE parser issue from the ea92754 fleet failure; merged as 45be80b. Soren exact migration/SQL/HTTP rerun is requested, not yet executed or passed on this source.

Fable 40fe941 removes the temporary bridge, binds `createV2OutreachGateway()` directly under the typed Celeste `OutreachGateway` port and removes the bridge tests that failed lint on 93f7b14. Merged in a0d308e; fleet web rerun requested, not yet observed.

Latest owner-followup integration `1829ef4` includes Sabine/ Theo/ Dorian/ Lyra/ Celeste/ Rowan/ Nadia/ Elara/ Orion/ Astrid/ Tessa/ Felix/ Leonie latest source as itemized in `control/cassian-outbox.md`. Lyra now derives grant controls from protected actor projection; Celeste hides Outreach content after revoked writes. Orion fleet Cargo.lock/compile fixture is source only; no native release evidence. All exact-candidate web/backend checks remain pending Soren.

Corin f6a3a3c protected direct-message reader is merged. Cassian adds `getDirectMessage` to the V2 registry and canonical spec, returning the existing plaintext Message fields in a current session envelope. The isolated route is source-registered; absent and inaccessible collapse to the same 404, and malformed UUID/query to 400 in owner tests. Mira UI adoption and exact fleet HTTP/DB/Steep checks remain pending; V1 read contract is unchanged.

Soren exact 45be80b integrated DB run migrated through Corin `00011` with `027-migrate.log` exit0, then `028-ruby-suites.log` FAILED on test fixture dependencies: DraftBootstrapTest cannot drop `app.drafts` while send private intents references it; DraftSchemaContractTest cannot drop send private types while newer reconciliation checks depend on them. Later tests report closed connection and fixture already owned/not empty. Result marks tests FAILED and cleanup PASSED. SQL/HTTP and full backend acceptance NOT_REACHED; root/Soren received exact findings for isolated fixture repair.
