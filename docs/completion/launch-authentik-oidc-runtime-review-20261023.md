# Strict OIDC runtime harness: dedicated adversarial design review

Date: 2026-10-23. Task `task_eaa74eb95ee0`, dispatch `ctx_c99d9822dec1`.
Verdict: **not sufficient evidence of strict OIDC acceptance**. Two HIGH test-oracle defects remain for the implementation owner. This is static review, not a runtime failure or a finding that production GoTrue accepts invalid identities.

## Frozen coverage

| Packet | File | Inclusive lines | Physical LOC | SHA-256 |
| --- | --- | --- | ---: | --- |
| A | `ops/production/authentik/oidc_fixture.py` | 1–82 | 82 | `2895b9ca1c5045ee1a44502d441649227e044ca025f7fdc8e443623a57a0c989` |
| B | `ops/production/authentik/test_oidc_runtime.py` | 1–93 | 93 | `ce15ccf7b1eb4f743e7e6e6ceee2e67447da9a7b6cb683b563b7d98154997418` |

Each packet is below 200 lines; unique reviewed code is 175 physical lines, including comments/blanks. Repeated reasoning about the same lines is not additive coverage. Two confirmed evidence defects / 175 LOC = **11.43 defects/KLOC**. No implementation edits, nested reviewers, Docker queue submissions or execution were performed. README, state, documentation and project standards were consulted for current activation restrictions and review requirements; historical test totals do not verify these files.

Concurrency boundary: a closing hash check observed newer fixture hash `64954c4ef4efbbe30ffa8291df1fc24fba9e3f49efe4252ab8623cae5959d2ff` and test hash `65044e02a0f69bee2f3ed11b7130200047380136244c11a3be503b7d8a5c161f`. Those newer contents were not reviewed. All findings, line ranges and density above apply only to the initial frozen hashes; current repair status is unknown and requires a separate bounded review.

## Findings

### R1 — HIGH: arbitrary errors satisfy security rejection assertions

`test_oidc_runtime.py:76–88`: the wrong-PKCE check accepts every status >=400, including 500. Each callback negative accepts any such status, or any redirect containing `error=`/`error_code=`, without checking the expected failure reason. The signed positive control is useful but cannot exclude failures specific to an individual negative request: for example an issuer-mode parsing crash, JWKS fetch failure, or provider outage also passes the rejection oracle. The positive exchange after the wrong verifier constrains PKCE behavior, but does not prove the first response was a PKCE mismatch.

Require the exact pinned GoTrue status and structured error category for each scenario. Where the public callback intentionally collapses failure details, combine its expected safe redirect with private, secret-free provider request counters or scoped diagnostics proving the intended validation stage was reached. Assert no successful callback code/session token in query or fragment. Distinguish state rejection before token exchange from signature/issuer/audience rejection after exchange; assert the expected token/JWKS calls. Add regression counterexamples showing unrelated 4xx/5xx and unrelated error redirects fail the harness. Never relax the oracle to a generic error just because the expected version-specific category needs investigation.

### R2 — HIGH: unavailable userinfo cannot prove userinfo-only fallback is forbidden

`oidc_fixture.py:39,49–60,68–72` and `test_oidc_runtime.py:82–88`: discovery advertises no userinfo endpoint and the server returns 404 for every unknown GET. A GoTrue adapter that wrongly falls back to userinfo after a missing or invalid ID token can still fail because userinfo is unavailable. That implementation would pass these tests, even with a valid signed-token positive control.

Advertise and serve deterministic valid userinfo for the same fixture subject/email, with a disposable access token. In missing/invalid-ID-token cases prove this usable fallback cannot create a login; pair that with R1's specific failure assertions and endpoint counters. Cover both omitted ID token and present-but-invalid ID token, because implementations may treat them differently. An explicit `alg:none` token and empty/null ID-token variants would strengthen the boundary; the current method name says unsigned but only the omitted-token case is supplied. These are coverage recommendations within R2, not additional counted defects.

## Evidence checklist

| Property | What source establishes | Remaining limit |
| --- | --- | --- |
| Signed positive control | Fresh RSA-2048 key, RS256 JWT, matching JWKS; callback code then correct PKCE exchange requires HTTP 200 and an access-token field | Actual GoTrue image, configuration, runtime and resulting identity not inspected/executed; checking expected subject/email would strengthen identity binding |
| Signature | Signature mode flips one signature byte without changing claims | R1 prevents attributing rejection to signature verification |
| Issuer and audience | Independently changed claims signed with the same key | R1 prevents attributing rejection to each claim |
| Missing ID token | Token endpoint omits `id_token` | R1 and R2 prevent the intended strict-only conclusion |
| State | Issued state is obtained from authorize, then modified for one callback | Generic errors pass; no assertion token endpoint was never reached; no replay/expiry case |
| PKCE | S256 challenge derived from 64-character verifier; wrong exchange precedes usable correct exchange | Wrong exchange has generic error oracle; absent challenge/verifier and replay not covered |
| Empty/null/limits | HTTP requests have 10-second client timeout, response read capped at 65,536 bytes, fixture request read capped at 8,192 | Negative/invalid Content-Length, invalid UTF-8 and slow bodies are not handled deliberately; fixture-only limits, not production parser assurance |
| Authorization and isolation | Explicit disposable opt-in; fixed `auth`/`idp` origins; fixed disposable admin JWT secret; no real-provider credential or mail operation | Environment flag and DNS labels are intent guards, not proof of network/container isolation |
| Cleanup | Fixture key is under `/tmp`; no source mail sends | No teardown/provider deletion in these files; external task-owned database/network/container/key cleanup remains unverified |

## Design tradeoffs and concrete scenarios

Strict identity requires a signed token whose issuer is the configured authority and whose audience is this application. A signed token from the same provider intended for another client must fail, even if its email is identical. A compromised or misconfigured userinfo endpoint returning a matching verified email must not substitute for this binding. This rejects some OAuth-only providers by design; enabling userinfo fallback for convenience would weaken the stated contract and should require an explicit separate product/security decision rather than a silent compatibility path.

An otherwise legitimate provider that uses an issuer URL with a different trailing slash, omits ID tokens because `openid` was not requested, or signs with an unsupported algorithm will fail strict validation. The practical remedy is to correct discovery/client/scope configuration and supported-key handling, then add a narrowly specified positive case. Do not normalize arbitrary issuers or bypass signature verification to restore availability. A JWT audience array containing the configured client and valid authorized-party semantics is a legitimate compatibility scenario worth testing separately from the single wrong-audience case.

During legitimate signing-key rotation, a fresh unknown `kid` may require bounded JWKS refresh; a stale-key failure must not masquerade as successful signature-rejection coverage. Fresh keys per fixture boot improve independence but make readiness, cache behavior and exact request evidence important. The current tiny single-provider fixture is a maintainable choice; a general identity-provider framework is unnecessary. Small explicit modes, a request ledger and shared response classification are enough to strengthen the proof without speculative abstractions.

State binds the browser authorization transaction; PKCE binds code redemption to the initiator. Neither replaces issuer/audience/signature verification, and signed identity does not establish application tenant membership. This harness targets GoTrue directly, so it does not verify Rails cookie/state/session handling, invite-only membership, upstream revocation or browser acceptance. Those remain separate evidence requirements.

The fixture's permissive token endpoint (arbitrary code modes and no client-auth/code-consumption checks) is acceptable for focused GoTrue token-validation adversaries if this narrow role is explicit. It must not be presented as proof of a realistic upstream authorization-code exchange or provider-side PKCE enforcement. No duplicated domain implementation, database query hot path or overengineered abstraction was found in these 175 lines. Formatting is left to lint; standards still require owner-run typed/lint/runtime checks.

## Execution, Obsidian and routing limits

No tests/builds were run, no production service or database was contacted, and no real sends occurred in this review. Only the auth owner may run the fleet-02 Docker evidence and exact cleanup. Container recipes, pinned GoTrue source/image, external mounts/networks and lifecycle runners are outside this review's code coverage; this report cannot certify their isolation or cleanup.

Tool discovery found no available Obsidian connection. The scenarios above are static counterexample analysis, **not an Obsidian simulation**, vault write or measured runtime experiment. No vault synchronization is claimed.

Both HIGH findings were durably routed to auth dispatch `ctx_0c4f8e19305e` in message `msg_870040a62955` and to the coordinator in `msg_9ec88c208193`. Durable enqueue does not prove acknowledgement or repair. Owner fixes, bounded re-review and exact fleet execution remain necessary before strict OIDC acceptance; production activation remains coordinator-owned. This dedicated report is the only file changed, per dispatch scope; central review-ledger integration belongs to the coordinator.
