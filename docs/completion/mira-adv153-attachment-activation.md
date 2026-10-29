# ADV153 — attachment activation

Exact source: 10b7b3b2203b4be14a0307edd8ec1cf9f66bdd81, completion-cassian-int801. Static only; runtime NOT_RUN. No tests/builds or implementation edits.

Confirmed defects: 1 P3; density 1 / 171 unique versioned source LOC (5.85 per 1,000 LOC). No confirmed functional or authorization defect in the bounded activation changes.

P3 — apps/web/src/app/featureGateways.tsx:36 still describes absent feature capabilities as the same as production today. main.tsx:32 now injects the real attachment port, and line 37 passes the configured featureGateways to App. The comment is misleading at this touched capability seam and should describe the isolated no-provider behavior without claiming current production parity. This is a comment synchronization defect under the user's standards, not a runtime blocker.

The two newly active operations map exclusively to GET metadata/content routes with mailbox/thread/message identity and attachment identity on content. Their exact mappings are asserted by the revised registry test; the ordinary registry count rises from 19 to 21 while the V2-only and no-worker-route assertions remain. register! still requires enabled and controllers_ready, validates booleans, and rejects unknown/inactive/duplicate operation lists before adding routes. Canonical draft.8 statuses and candidate description match the registry activation.

Production main constructs the attachment gateway once and supplies it through the existing feature gateway seam; no fixture or permissive fallback is added. The inspected adapter boundary retains page limit 1–50, parsed optional UUID cursor, scoped path, strict response schema, bounded response bytes, context headers, shared error schema, and abort signal. Existing controller/strict schema/security implementation was reviewed in ADV133/ADV139/ADV145/ADV146 and is cited as prior coverage rather than recrawled or freshly certified. The route activation test replacing the inactive expectation is appropriate for this deliberate behavior change and preserves exact endpoint/controller proof.

Tradeoff: wiring the existing optional port and activating only its two guarded GET operations avoids duplicating transports or adding another permission mechanism. Candidate activation enables fleet proof; it does not establish real-byte, scan, revocation, or visual acceptance. Comments correctly retain pending-proof language except the stale no-provider statement above. Code-generation and full runtime gates remain required; no generated-type or full-build PASS is claimed here.

## Exact coverage

Current v2_route_registry.rb 20–56: 37 LOC.
Current v2_route_registry_test.rb diff context 12–21 and 70–85: 26 LOC; parent removed 15,18,73–80: 10 LOC. Total 36.
Current main.tsx diff context 9–15 and 29–35 plus 36–39: 18 LOC.
Current contracts/v2/openapi.json diff context 3–9,92–98,182–188: 21 LOC; three parent replaced status/description lines: 3 LOC. Total 24.
Current featureGateways.tsx 1–39 and parent replaced line25: 40 LOC.
Current v2AttachmentGateway.ts 33–47 and parent replaced line33: 16 LOC.
Total 171 unique versioned source LOC, each read below 180 lines and assignment below 190. Unchanged unified-diff context counted once at current version; removed parent lines counted separately. Metadata-only path/stat output excluded.

Excluded: full attachment adapter/body handling, App provider implementation, MessageAttachments UI, controller internals, SQL and private gateway, full canonical schemas, generated declarations, other tests, docs content, actual routes/runtime/visual acceptance. No broader feature-completion claim.
