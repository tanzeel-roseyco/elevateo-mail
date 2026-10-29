# Authentik identity independent design review — 2026-10-23

Scope: bounded read-only review, packet A 167 LOC and packet B 53 LOC; 220 unique lines total. Only this report was written. No tests, builds, provider calls, email, UI checks or deployment were performed. New source is NOT runtime accepted. Obsidian connection unavailable: all simulations below are analytical, not executed; no external evidence is claimed.

## Source receipt

SHA256 values cover complete files; inspection covered only the listed ranges, including comments/blank lines.

| File | Inspected lines | SHA256 |
| --- | --- | --- |
| apps/server/lib/elevateo/authentik_identity.rb | 1–87 | fec95aaea2562b89fbdf3bce914c864235a417954e80c496c8e2ceebe98be6a0 |
| apps/server/test/be_02/authentik_identity_test.rb | 1–80 | bf0cb8c508c9a1896a166cef2dc59423e659c0485310500cc9f6d926ebe3ec15 |
| apps/server/lib/elevateo/authentik_discovery.rb | 1–21 | f9bcfbb671c2754e889e9e7aaa5353ec3e454b768539c113dab563425ff32e78 |
| apps/server/app/controllers/authentik_discovery_controller.rb | 1–13 | 12386bbf5e7546a2795a304b4775171b053bd00a19024d34f04ea9ae9d8fb1af |
| apps/server/sig/authentik.rbs | 1–19 | c8ae56c79aad6f4a47cc9d7f9a4b7aaa5ba2180ea0adbf2a42159fa9a74b1ebc |

Project instruction context read: supplied AGENTS instructions, README.md, state.md, documentation.md and .planning/STANDARDS.md. Large historical state output was truncated; no claim of exhaustive historical document review. No implementation files outside the assigned ranges were inspected.

## Finding

LOW — Revocation regression does not exercise verifier reuse. authentik_identity_test.rb:22–29 creates a new AuthentikIdentity for each check; :36–42 therefore cannot establish the test name's every-request guarantee for a persistent verifier. Analytical reproduction: introduce a successful-result instance cache in check! and run the existing test; because every invocation creates a fresh instance, the test can still pass despite violating the no-positive-cache requirement in production reuse. Fix: retain one verifier and one mutable transport fixture across successive calls, assert the upstream call count increases on each check, then mutate membership, active status and verified address and assert each denial. This is a test-strength defect; no positive cache exists in the inspected implementation and no runtime bypass is alleged.

Counts: 1 LOW test defect, 0 confirmed production correctness/security defects in the inspected ranges. Density: 1 / 220 × 1000 = 4.55 defects/KLOC (test-only denominator: 1 / 80 × 1000 = 12.50/KLOC). These numbers describe bounded review coverage, not whole-application assurance.

## Analytical scenario simulations — NOT EXECUTED

| Scenario | Source path and predicted result | Remaining proof |
| --- | --- | --- |
| Successful login | Identity :16–26 requires exactly one selected custom:authentik identity, UUID subject, same company email and boolean verified claim; :28–38 requires exactly one current active address-bound verified member; returns true. | Prove real GoTrue supplies validated signed claims and current Authentik response shape matches the fixture. |
| Upstream deactivation | A subsequent call fetches again; is_active=false fails :36. Existing GoTrue session alone cannot satisfy this check. | Prove every protected request invokes this check and denies before domain access. |
| Verified-email change | Old session email versus new upstream email or verification address fails :37. Reauthentication with matching newly verified company address can pass only after all identity checks align. | Prove address-verification attribute update is trusted and bound to the verification workflow; arbitrary self-service attribute writes must be prohibited. |
| Group removal | Fresh groups array lacking configured identifier fails :38. | Verify actual API returns membership identifiers with include_groups=false and token can read required fields. |
| Upstream unavailable | HTTP non-200 rejects :52–54; listed network/TLS exceptions map to AuthError :55–57; no positive result is retained. | Prove absolute RequestDeadline behavior, HTTP/controller error mapping and slow-stream timeout in fleet Docker. |
| Missing signed token | Discovery omits userinfo_endpoint and advertises RS256; it does not itself validate a token. | Actual GoTrue version/config must reject token response lacking id_token; supplied discovery shape assertion alone cannot establish this. |
| Forged signed token | Discovery publishes JWKS URI and RS256 metadata; identity policy checks are not a signature verifier. | Prove GoTrue rejects wrong key/algorithm, wrong issuer/audience, expiration and nonce failures. Never pass caller-constructed identity objects as authenticated GoTrue output. |

## Design tradeoffs and practical limits

A fresh upstream read per authorization favors revocation security over availability. Any Authentik outage, API-token loss or rate limiting blocks otherwise valid sessions. The 65,536-byte response cap, one-result check, no retries and bounded deadline constrain resource use; they do not establish fleet capacity. Expected extra request rate is approximately the protected-request rate, so load/rate-limit acceptance should measure that actual workload. Do not add a positive cache to improve availability without explicit policy change: it creates a revocation window contrary to the stated requirement. Existing session authority remains GoTrue; this helper should remain an additional current-membership gate, not another session issuer.

The check is a point-in-time authorization observation. A revocation immediately after lookup can race the protected operation; this design does not promise atomic authorization across two systems. Keep sensitive downstream operations within the existing authorization model rather than claiming zero-latency global revocation.

Responsibilities are proportionate: policy, bounded HTTP fetch, metadata and controller adapter are small and distinct. No speculative abstraction or duplicated domain backend is justified. Comments explain the no-cache and no-userinfo decisions; strict RBS signatures are present, but typechecking was not executed.

## Conditional concerns, not counted as established defects

Identity :63–69 and discovery :14–16 reconstruct endpoints from hostname and therefore discard a nondefault issuer port. Discovery also concatenates issuer + jwks/. These are correct only if validated configuration requires port 443 and a trailing slash with the expected provider path. Configuration is outside this packet; request a separate bounded configuration review rather than assuming that contract fails. If custom ports are supported, preserve the validated origin/port consistently; otherwise reject them explicitly.

Discovery :12 can raise URI::InvalidURIError and the controller rescues only AuthError. This becomes an error-mapping defect only if malformed issuer configuration can reach it; the comment asserts validation outside scope. Confirm the upstream configuration boundary rather than adding broad exception swallowing.

The supplied group fixture assumes a UUID array even with include_groups=false. The inspected code does not prove actual API serialization semantics, group ownership, least-privilege API-token scope or email-verification attribute permissions. Coordinator/implementation owner was asked for these boundary contracts; do not interpret their absence here as a proven defect.

## Tests and acceptance still required

Inspected tests cover valid identity, removed membership, deactivation, changed UUID/email/verification address, string rather than boolean verification, duplicate/wrong provider, HTTP failure status, malformed/oversized JSON, wrong content type and discovery disabling. They do not directly cover same-verifier repeated lookup, missing/empty identities, invalid UUID/company domain, empty or multiple results, missing pagination, network exceptions, streamed body overflow, real HTTP origin/headers, controller response, slow-stream deadline or missing/forged signed-token integration. Some may exist beyond the assigned ranges; no absence claim is made for uninspected tests.

Run scoped regression/type/lint and real GoTrue/fake Authentik integration in authorized fleet Docker, with all token failure cases and authenticated protected-route revocation checks. Validate the custom verification attribute and actual upstream group response before activation. No runtime, UI, deployment or production acceptance is granted by this review.

Revision checkpoint: coordinator authorized identity lines 1–87 before settlement. Reread those lines; the local complete-file SHA256 remained fec95aaea2562b89fbdf3bce914c864235a417954e80c496c8e2ceebe98be6a0, rather than the different coordinator-reported candidate hash 6c227d6e70d916722c36eb7b9b12e3569ecbeb5631f3bedf0bd7c96497f2d140. This report covers the observed local file, not that unobserved candidate; line 87 closes exchange. Final reviewed count is 220 LOC and density 4.55/KLOC.

