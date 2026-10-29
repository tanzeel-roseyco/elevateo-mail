# Bounded final contract-validator review — 2026-10-23

Disposition: no confirmed defects in the assigned packets; source review only, not whole-validator or application approval. Review performed 2026-10-24 against working-tree bytes at HEAD `177c4d26883437dd3f10074fc6323da653778da5`; HEAD alone does not bind uncommitted content.

## Scope and exact identity

- `contracts/v1/tests/send_contract_test.rb`: SHA-256 `89a0b17673615c30d04fa1cdbee0e98401c72d799a4786ad6a2507d4be54f589`; packets 94–106 (13 LOC), 128–142 (15 LOC), 158–168 (11 LOC): 39 LOC total.
- `contracts/v1/openapi.json`: SHA-256 `66ed9483d661271846b5dad75afd61bb521929ea8577ada3ec141cf146ea5a76`; inspected 7889–7928 (40 LOC), 8026–8075 (50 LOC), 8142–8148 (7 LOC), 8155–8157 (3 LOC): 100 LOC total. First range contains 29 LOC of SendRecipientCheck and 11 adjacent context LOC. Remaining ranges are excerpts of SendReview, not a claim of complete schema coverage.
- Total inspected source/context: 139 LOC, below 200. Confirmed defects: **0**; density **0 / 139 × 1,000 = 0 defects/KLOC**. Test-packet-only density: **0/39 = 0/KLOC**. This is bounded inspection accounting, not a statistical correctness guarantee.
- Context: `.planning/STANDARDS.md`, README/state/documentation current checkpoints, and `docs/completion/launch-unified-server-20261023.md`. No formatting review, source edits, tests, builds, frontend inspection, production changes, or additional reviewers.

## Functional and regression findings

1. Lines 98–106 split a type array by recursively validating `schema.merge("type" => part)`. The merge preserves every other schema entry and creates a new hash rather than mutating the original. Each candidate must pass the validator again; the early return therefore does not itself discard constraints after line 100. The conditional at 94–97 is evaluated before splitting and again in candidate validation. Scalar type guards reject mismatched null, boolean, integer, string, array and object inputs in the inspected code.
2. Lines 131–137 exercise an actual two-member `type` array, rather than an anyOf substitute: null and a two-character string succeed, while an oversized string and integer fail. In particular, the oversized string would expose a shortcut that checked only membership and skipped maxLength. Wrong-type rejection prevents accepting arbitrary values merely because null is allowed.
3. Lines 158–167 retain assertions rejecting inconsistent readiness/digest values, excessive recipients, unsupported attachments, missing outbound_mode and an invalid outbound_mode. These assertions remain present alongside the corrected boolean assertion; their actual evaluation was not independently executed here. The fixture and full conditional schema are outside this assignment.
4. SendReview explicitly requires simulated (8049), and its property is boolean (8155–8157), with no const restriction at that property. The validator's boolean guard accepts only true or false (102). Accordingly, accepting the existing review with simulated=false matches this inspected declaration; it does not authorize live sending. SendRecipientCheck similarly declares consent_evidence boolean and bounds index to 0–99; this review does not reinterpret consent or readiness policy.
5. No mutable application state, database queries, authorization checks or external-input ingestion were added in the assigned test-only packets. Existing object/additional-property declarations and required fields remain visible in the schema excerpts. Boundary enforcement beyond those excerpts is not independently established.

## Dedicated design-tradeoff analysis

Analytical comparison, not an executed simulation: a type-membership-only shortcut is smaller but loses sibling constraints; recursive validation of a shallow schema copy preserves the existing constraint path and avoids duplicating it. Repeated conditional evaluation costs extra work per candidate, but the demonstrated two-member nullable union is bounded and the helper is test-only. There is no evidence here warranting a general validator framework or new dependency.

For nil, only the null candidate should pass; for a valid short string, the string candidate should pass; for an oversized string or integer, neither should pass. The supplied regression directly represents all four cases. An empty type array would return false through Ruby any?, rather than accept everything. Very large or malformed schema type arrays are not exercised, and recursive schema complexity was not benchmarked; schemas are repository-owned, so no new production denial-of-service claim follows from this helper.

A false simulated flag belongs to response shape validation; coupling it to a production activation hold would make a boolean contract artificially narrower. Runtime transport authorization remains a separate concern and was not reviewed. Comments at 99 and 164 explain these compatibility decisions without adding speculative abstractions.

No Obsidian tool/connection was exposed in available tool discovery. No vault access, synchronization, or Obsidian simulation is claimed; the tradeoffs above are static reasoning only.

## Evidence limits and handoff

The supplied runtime receipt and context document report a fleet Docker contract rerun of **11 tests / 115 assertions, zero failures/errors/skips**. This reviewer did not run or independently verify that execution. Both file hashes match the hashes stated in that context document.

The body outside the three test packets, full referenced schemas, fixture contents, neighboring tests, and production send paths were intentionally not inspected. Consequently this review establishes that the type-array dispatch preserves schema entries and that the assigned regression targets nullable constraint retention; it cannot independently certify every downstream keyword implementation, all existing conditional behavior, empty-list semantics or all maximum boundaries. Relevant regression assertions are present; full pass evidence remains the reported fleet result. Central code-reviews.md/state/README accounting and final acceptance remain coordinator-owned; this worker writes only this report, as dispatched.
