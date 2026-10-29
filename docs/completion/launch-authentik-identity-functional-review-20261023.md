# Authentik identity functional/security review — 2026-10-23

Read-only independent review for task `task_0e37794dfac5`, dispatch `ctx_3cdda95dc2d2`.
Only this report was written. No tests, builds, provider requests, email, or UI inspection were performed.
This is source evidence, not runtime acceptance. The orchestration skill was used for dispatch reporting.

## Coverage and source binding

| Packet | File | Inclusive lines | SHA256 (whole file at inspection) |
| --- | --- | --- | --- |
| A | apps/server/lib/elevateo/authentik_identity.rb | 1–86 | 6c227d6e70d916722c36eb7b9b12e3569ecbeb5631f3bedf0bd7c96497f2d140 |
| A | apps/server/test/be_02/authentik_identity_test.rb | 1–80 | 5c55df75238b89babdde19c698a2e9921b6aa036820d74e369cd7b604903bd4 |
| B | apps/server/lib/elevateo/authentik_discovery.rb | 1–21 | f9bcfbb671c2754e889e9e7aaa5353ec3e454b768539c113dab563425ff32e78 |
| B | apps/server/app/controllers/authentik_discovery_controller.rb | 1–13 | 12386bbf5e7546a2795a304b4775171b053bd00a19024d34f04ea9ae9d8fb1af |
| B | apps/server/sig/authentik.rbs | 1–19 | c8ae56c79aad6f4a47cc9d7f9a4b7aaa5ba2180ea0adbf2a42159fa9a74b1ebc |

Packet A: 166 LOC, one LOW defect, 6.02 defects/KLOC. Packet B: 53 LOC, zero defects, 0/KLOC.
Total: 219 unique assigned LOC, one LOW defect, **4.57 defects/KLOC**. Counts include tests/signatures/comments.
No other implementation files were inspected. Project instructions and required project state/standards documents were consulted.

## Finding F1 — LOW, repaired in source / runtime pending: TLS error normalization

Location: `apps/server/lib/elevateo/authentik_identity.rb:54–55`, originating at `:73–80`.

The network boundary normalizes IO, socket, timeout and HTTP protocol exceptions to `AuthError`,
but does not normalize `OpenSSL::SSL::SSLError`. Certificate validation and TLS handshake failures
from the real HTTPS connection can therefore escape this method as a raw transport exception.
Access is still denied: this is an error-contract/reliability defect, not an authentication bypass.
The resulting HTTP status/logging behavior cannot be established without reviewing the caller and error middleware.

Reproduction to add in fleet Docker: use the existing injected transport seam to raise
`OpenSSL::SSL::SSLError, "certificate verify failed"`, then assert `AuthError` from `check!`.
The current rescue list does not match that class. Also exercise a local disposable HTTPS fixture
with an untrusted certificate to cover the real `exchange` branch. Neither reproduction was executed here.

Fix guidance: include the specific TLS exception in the boundary's deliberate error mapping,
preserving certificate verification and denial; add the regression alongside timeout/socket tests.
Do not broadly rescue every exception or weaken TLS verification.

Repair checkpoint: the implementation worker reported a repair during this review. Reinspection
of the same allowed identity range 1–86 confirms explicit `require "openssl"` at line 4 and
`OpenSSL::SSL::SSLError` in the rescue list at lines 55–57. Current whole-file SHA256 is
`fec95aaea2562b89fbdf3bce914c864235a417954e80c496c8e2ceebe98be6a0`.
The test file now hashes to `bf0cb8c508c9a1896a166cef2dc59423e659c0485310500cc9f6d926ebe3ec15`;
only its assigned lines 1–80 were reinspected. The reported added regression is beyond that range
and requires a separate bounded review; it is not accepted here. No tests were executed.
Historical count remains one discovered defect / 219 assigned LOC (4.57/KLOC); zero confirmed
unrepaired findings remain in the reviewed ranges. Shifted closing lines beyond identity line 86
were not inspected in the repair snapshot.

## Checks satisfied by the inspected source

- Exactly one selected `custom:authentik` identity is required; malformed identity containers,
  missing fields, a non-UUID subject, unverified email, company-domain mismatch, and disagreement
  with the GoTrue user's email are rejected before lookup.
- Each successful check performs a fresh lookup: there is no positive cache in this class.
  Success requires exactly one result/count, matching UUID/email, strict active boolean,
  address-bound upstream verification, and required group membership.
- External response bodies are capped during streaming and passed to a bounded object parser.
  Non-success responses and incompatible content types cannot produce an allow decision.
- No redirect following is implemented; environment proxy use is explicitly disabled and retries
  are disabled. The API token is sent only to the constructed HTTPS host in this code.
- Discovery advertises RS256 and S256 and omits `userinfo_endpoint`; disabled or wrong-provider
  discovery is rejected. The controller declares no-store and maps `AuthError` to unavailable.
- Existing tests cover the allow path, group removal, disabled users, identity/address mismatch,
  duplicate/wrong-provider identities, strict verification boolean, error status codes,
  malformed/oversized JSON, content type, and discovery metadata. These are inspected tests,
  not executed results. No unnecessary abstraction, database loop, or duplication requiring
  extraction was identified in the assigned packet.

## Unverified integration and missing negative coverage

These are acceptance gaps, not additional confirmed defects:

- GoTrue remains the session authority by task requirement, but caller wiring, session validation,
  global error mapping, and revocation enforcement across all protected routes are outside scope.
- The discovery document alone cannot prove signed-token enforcement in the deployed GoTrue version.
  Fleet integration must reject missing ID tokens, bad signatures, wrong issuer/audience, expired
  tokens and unsigned tokens even when a userinfo endpoint would otherwise authenticate the user.
- Confirm the deployed Authentik API's `uuid` filter, pagination count and group UUID array with
  `include_groups=false`; the handcrafted fixture does not prove that provider response contract.
  The implementation worker subsequently reported inspecting the live UserSerializer and finding
  that groups remain UUIDs while this flag suppresses groups_obj, with a uuid filter present.
  This is attributed evidence, not independently verified by this reviewer.
- RequestDeadline implementation is outside scope: `within(2.0)` and per-operation timeouts are
  visible, but a wall-clock bound under slow streaming/DNS/handshake cannot be certified here.
- Configuration validation is outside scope. Both discovery and exchange rebuild endpoints without
  preserving an issuer's explicit port; verify configuration rejects unsupported origins and
  guarantees the trailing slash used by `issuer + "jwks/"`. No configuration defect is asserted.
- Add negatives for empty/missing identities, malformed/null identity data, non-company email,
  invalid subject, null/malformed result containers and groups, pagination mismatch, multiple
  results, exact/over body limits, network exceptions and repeated calls on the same checker
  instance. Existing revocation test constructs a new checker per call, so it alone would not
  detect a future per-instance cache.
- No dedicated system-design review, Obsidian tradeoff simulation, UI acceptance, full-project
  coverage, or runtime PASS is claimed by this bounded functional assignment.

The implementation worker and coordinator received direct Orca progress/finding messages.
Runtime verification and any fix remain owned by the implementation/coordinator dispatches.
