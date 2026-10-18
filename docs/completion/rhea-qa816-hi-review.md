# QA816 independent source review: packets H and I

Reviewer: Rhea, actual runtime `gpt-6-sol` low (billing tier unverified). Review date 2026-10-14. Source-only; no application tests or Docker were run here. Tessa's reporter fix packet J is excluded.

## Exact scope

| Packet | Commit | Exact file and lines | SHA-256 | LOC |
| --- | --- | --- | --- | ---: |
| H | `ef3cf2cf07e60f81ddddcb9d1e9a2c4cbf07eabd` | `tests/acceptance/playwright/qa816-assignee-options.e2e.ts` 1–69 | `7919456a0791abb178a17e1a3433e219351a154475f9aab2b200ce70d9c1fa82` | 69 |
| I | `e5c9eeced5051cb3e948a5b7a35a8be210601f28` | `tests/acceptance/playwright/qa816-attachment-api.e2e.ts` 1–106 | `acdff7a7e0d9c002a42bc3ea631fe3a6f395e0149b2eac6b149b86d93a874d78` | 106 |

Each source read was <=180 lines. Unique changed source coverage is 175 LOC. Additional matching context from `e5c9eec`: `support.ts` 1–38, `cases.ts` 1–22, `shared/seed-contract.json` 1–25 (85 LOC); total unique inspected code/fixture context 260 LOC. SHA-256 of all three context files matched the review checkout. Other fixture producer, controller, SQL, UI, reporter and runtime behavior were not inspected; no whole-system acceptance claim follows.

## Findings: 3 MEDIUM, 17.14 defects per 1,000 changed LOC

1. **H lines 44–49, MEDIUM — scoped list can leak a foreign actor and still pass.** The schema proves each item is a UUID, and the case proves the seeded composer appears and IDs are unique. A response that also includes `seed.actors.other_org.user_id` satisfies every assertion, despite the recorded “scoped” claim. Add explicit exclusion of the known other-org actor (and, if the product contract promises only eligible members, compare the expected eligible set in this dedicated fixture). The existing foreign-mailbox 404 case checks a different request and does not close this leak oracle.
2. **I lines 84–95, MEDIUM — rejected byte access is never exercised.** The case checks `rejected` metadata has `byte_size: 0` and that held content returns 423, then records that held and rejected attachments never yield bytes. A backend could serve rejected content and this case would still pass. Request the rejected content endpoint and assert its expected denial code/status and zero private bytes, using a response boundary that does not require the denial body to masquerade as a successful download.
3. **I lines 98–105, MEDIUM — foreign 404 can arise from mismatched path ownership.** The request substitutes `foreign_mailbox_id` while retaining the primary thread/message and clean attachment IDs. A handler that permits cross-organization access but correctly rejects mismatched mailbox/thread ancestry can return the expected 404. A trustworthy authorization oracle needs an existing foreign mailbox/thread/message/attachment tuple from the private disposable fixture, authenticated as the primary reader. Keep the mismatch case separately if useful, but do not label it a cross-org authorization proof.

## Other rubric observations and evidence limits

- H's three cases cover a nonempty happy page, foreign mailbox 404 and malformed cursor 400 through same-origin authenticated fetch. The page schema caps 50 items and token/cursor lengths; malformed JSON, wrong content type and >64 KiB responses fail. Empty list, a valid next cursor/page, and max-limit behavior are not proven by these cases. The existing case names and helpers are concise; no new class or duplicated domain logic is introduced.
- I loads a strict mode-0600 sidecar at an exact private path and fails setup if it is absent; no skip can masquerade as PASS. It checks clean list/content exact SHA-256 and length plus safe headers, held 423, rejected zero metadata, and a 404 response. The content bytes are fetched through a real browser request; no credential or private bytes are written to the recorded assertion strings. The fixture producer is not implemented, so these three cases are source-only and **NOT_RUN**. The sidecar records a clean attachment and held/rejected IDs but no valid foreign attachment tuple, which explains finding 3.
- The tests do not exercise UI picker/download controls, assignment writes, revocation, provider credentials, private Storage outage or production routing. These are explicit scope limits, not additional counted defects. No performance concern is evident in these small one-page cases; each bounded response is parsed once. The response-body size check occurs after buffering, so it is a test guard rather than a server resource limit.
- Design tradeoff: keep the private fixture strict and fail closed, but extend it only with an existing foreign tuple and assert known cross-org exclusions. This adds a small amount of fixture coupling in exchange for an authorization test whose 404 cannot be explained by an invalid ancestry path. For rejected bytes, use a direct denied-content assertion without weakening the current clean exact-hash proof.

Repair ownership is Tessa; Rhea made no implementation edits. Root and Tessa need to review the three findings, then Soren may run the revised cases only in fleet-02 Docker after the coherent route/Auth/SQL and fixture producer gates. Source acceptance and runtime acceptance remain open.
