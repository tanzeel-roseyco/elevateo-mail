# ADV138 — core strict repairs

Source-only independent functional/design review. No tests, builds, Docker, live services, credentials, or implementation edits were performed.

## Provenance and coverage

- Cassian a853b7feff7b624f5d98a14a9df906b33cae5ec5: lib/elevateo/attachment_gateway_client.rb lines 20–53 (34 LOC), corresponding RBS lines 1–17 (17 LOC): 51 unique LOC.
- Corin 0526a508a320e9146605dd2b75f2dcc38d73aa16: fake_inbound_controller.rb lines 11–49 (39 LOC), focused HTTP test lines 1–108 (108 LOC), changed parent-version controller lines 29–38 and test lines 96–99 (14 LOC): 161 unique versioned LOC.
- Total: 212 unique versioned source LOC; largest read 108 LOC. Corin stays within its 170-LOC allocation. Inventory/diff preceded bounded source reads.
- Confirmed defects: **0**. Defect density: **0 / 212 LOC = 0 per KLOC**. This is scoped static evidence, not acceptance of the integrated application.

## Gateway Numeric conversion

The repair converts the already validated Numeric timeout to Float only at the Net::HTTP exchange boundary and makes the RBS exchange signature agree. The positive, at-most-five-second predicate, transaction-open rejection, exact configured gateway URL/key constraints, outer deadline, response status/header/length checks, and maximum byte count remain in the reviewed slice. No authority claims or storage credentials are added.

A valid integer timeout of 5 becomes 5.0 for the HTTP setter; the existing outer deadline remains intact. Zero, negative, over-limit and String values fail the preceding validation. Conversion errors propagate through the existing deliberate unavailable response. Keeping this conversion at the adapter boundary is simpler than broadening every HTTP-facing type or adding a timeout abstraction.

The exchange implementation, configuration producer, signed request implementation, actual call sites and focused transport runtime tests were not reviewed. In particular, this report does not prove real network deadline behavior or strict typecheck success. No new Float regression was present in the covered packet; Soren's existing focused/static gate must supply runtime/typecheck evidence.

## Fake inbound scalar boundary

The controller now narrows provider_account, provider_event and raw_mime to String before calling FakeIngress. Actor/session equality and authorized mailbox checks precede the new validation; the test-only environment guard remains. Consequently an authorized request carrying an Array cannot reach ingestion, while an unauthorized request does not gain an alternate path through this repair. The existing FakeIngress boundary still owns semantic validation of otherwise valid Strings; this change does not declare an empty String valid MIME or a valid provider identifier.

The new regression uses the controller dispatch harness and substitutes an Array for each of the three fields separately. It requires a 400 request_invalid response and no ingest operation. Reviewed surrounding tests retain created/duplicate behavior, cross-actor/mailbox denial, invalid HTML rejection and disabled-route denial. This is meaningful boundary coverage, but the harness is not actual PostgreSQL role/session or deployed HTTP proof. Other non-String types are rejected by the same explicit predicate; their individual fixtures were not added in this packet.

## Tradeoff simulations

1. Valid authenticated fake import: all three Strings pass narrowing, then the existing ingress validates content and determines created versus duplicate. No new state or retry mechanism is introduced.
2. Authorized scalar-shape attack: provider_event becomes an Array. Authorization still completes first, then request_invalid is returned without persistence. A revoked or foreign actor remains denied before this new branch.
3. Private byte request with integer timeout: the signed request and bounds are unchanged; only the HTTP adapter receives Float. A malformed response length or unsafe header continues to fail closed after the exchange.

These are static simulations for the root's Obsidian record, not observed executions.

## Completion decision and omitted scope

The two small repairs are consistent with strict boundary typing and preserve the reviewed authorization and validation seams. No additional framework or refactor is warranted. Proceed to the assigned Soren focused tests and integrated strict gate; do not infer runtime success from this review.

Excluded: full ingress parsing/storage behavior, underlying protected_write implementation and database policies, complete gateway transport/configuration/request validation, actual HTTP runtime, formatting/lint checks, and the rest of either repository. Documentation changes were identified in the inventory but were not substantively reviewed. Binding standards were evaluated only for the covered strict typing, explicit failure handling, authorization and scoped-change behavior; whole-project conformance is not claimed.
