# ADV135 — smallest safe feature activation

Prose-only review of shared control/theo-app899-directory-inventory.md and control/mira-app900-inbox-inventory.md. Their respective source snapshots7a16adf9 and215080a4 are supplied inventory evidence, not independently audited here. Source LOC0; no code defect count/density applicable. No implementation/tests/agents/live operations. Root alone mirrors simulations to Obsidian.

## A. Directory purpose and authority

The product gap is a selectable eligible Auth UUID list, not a broad organization directory or twelve real-person enrollment. Choose a mailbox-scoped additive assignee-options route. Require current session, selected organization and the existing ability to change assignment in that mailbox. An ordinary member with that capability should not need owner/admin grant-directory access; ordinary mailbox read alone should not expose a picker they cannot use.

Candidate eligibility must reuse the exact existing assignment-write target predicate. Inventory says it validates current organization membership: do not silently require additional target mailbox grants unless the actual assignment contract already does so. Conversely, do not infer eligibility from roster titles, organization grant roles, names or unbound configuration IDs. Self/unassign remain existing assignment behavior; options are not authorization tokens.

Sabine owns narrow SQL authority/projection, Theo controller, Cassian route/DTO/gateway, Lyra picker. No broad organization-access table grant or additional real-person binding is needed. Names/emails stay excluded; opaque UUID display is honest and sufficient. Preserve typed-UUID fallback with server validation.

## B. Pagination and revocation

Use existing signed cursor conventions, not a new cursor framework: actor/session, organization, mailbox, context generation/version, order/filter and expiry must match; page bound50 and deterministic UUID order. Recheck current actor and candidate eligibility each page. Expiry and revocation are distinct: an unexpired signature never substitutes for live authority. A candidate removed between page1 and assignment is rejected by the existing authoritative write.

Cursor from mailboxA used inB rejects; context switch clears choices and aborts pending request. If generation changes, discard the old page/cursor and refresh rather than merging stale options. Denied/absent foreign mailbox shares non-enumerating behavior. Empty eligible page is a normal empty result, not permission failure. Do not add snapshot persistence merely to stabilize a12-person picker; membership changes may alter subsequent pages, while server write remains definitive.

Acceptance: genuine authorized actor sees only current eligible UUIDs; incapable actor/foreign org/mailbox denied; invalid/expired/context-mismatched cursor rejected; page2 cannot escape scope; revoked actor sees no later page; removed candidate cannot be assigned; keyboard selection/loading/empty/conflict/mobile states verified. Synthetic accounts prove behavior without binding real roster rows.

## C. Inbound attachments: finish bytes before activation

Missing product wiring is concrete: no injected attachmentPort, no registered attachment operations, and no active content action. Existing metadata/viewer source is not a functioning attachment journey. Cassian must pin additive scoped list/content contract and routes, then inject the typed port only when those endpoints exist in the same integration. Mira owns viewer states. Metadata listing must remain safe and exclude Storage keys/hash credentials; pending/malware/rejected bytes stay unavailable.

Use the existing isolated attachment gateway boundary: Sabine owns its private authorization/helper and gateway integration; Nadia owns private Storage/scanner readiness. Rails must not gain SERVICE_ROLE_KEY. Browser supplies only scoped attachment identifiers to Rails; trusted server constructs the gateway request from authenticated authority. Gateway binds complete org/mailbox/thread/message/attachment tuple, current Auth session/context-generation and clean status, resolving private key/size/hash internally. No arbitrary URL/key or browser-asserted organization is accepted. Reuse the approved narrow internal authentication scheme rather than inventing a second credential protocol.

Check authority immediately before Storage fetch and again after network before releasing bounded bytes. No long database lock across the network. Enforce size/hash/status and timeout bounds; fail closed on gateway, scanner or storage uncertainty. Rails must recheck its own current session/context before response release when that is part of the approved seam. If any proxy layer streams bytes before the second check, it cannot claim post-fetch revocation fencing; minimum bounded attachment read buffers before release. Revocation after final check cannot retract bytes already delivered—document this normal boundary instead of promising absolute instantaneous recall.

No public/signed URL fallback, fake-clean state or browser service credentials. Blob URLs are revoked on switch/unmount; reject stale resolved promises even after cancellation. Safe filename/content disposition and bounded supported media must follow the frozen contract. Clean scan is not outbound approval; compose/upload remains absent and sending held.

## D. Fail-safe rollout and simulations

Clean attachment + authorized viewer: exact tuple resolves, private bytes validated, second check passes, UI opens/downloads. Revocation during Storage fetch: second check denies, no bytes released, UI reports unavailable and clears pending state. ContextA request resolving after switchB: frontend fence discards it and revokes any created object URL. Storage outage/hash mismatch/oversize: no fallback, no blob, retry offered where appropriate. Pending or malware metadata: honest status, no download action. Metadata may be listed even when byte capability is temporarily unavailable; do not call that successful viewing.

Candidate directory and inbound viewer are independent backend lanes. Generic reply-label/prefill fix can proceed while bytes are completed. Outbound attachments, real staff binding, Reply All and offline native storage are separate missing/deferred product scope and must not be claimed done by these activations.

## E. Executable minimum order and proof

1. Cassian/Sabine freeze only the two additive endpoint contracts and exact authority predicates for a test snapshot; Theo/Nadia/Mira/Lyra continue bounded independent work.
2. Integrate assignee SQL/controller/gateway and prove real-role positive/negative assignment behavior with Soren fleet Docker.
3. Integrate attachment scoped list/content route and existing private gateway; prove clean bytes, revoked-after-fetch denial, malformed tuple, bounds and private-field non-disclosure before port injection.
4. Inject ports and validate actual browser picker/viewer on that exact integration, including mobile/context-switch/loading/failure states. Capture honest screenshots after data readiness.

These are product completion and runtime gates, not requests for further general architecture. Actual latest-SHA authenticated HTTP/DB, scanner/private gateway and browser evidence remains uncertain in the inventories. Older structural or mocked PASS cannot satisfy these gates; no live enrollment/credentials/spend required.
