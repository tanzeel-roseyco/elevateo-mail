# ADV146 — error envelope repair

Snapshot: Cassian 263047b4e7df97b557872479c1210f063681d704, completion-cassian-int801. Static source review only. No application execution, tests, builds, or implementation edits.

Confirmed defects: 0. Density: 0 / 134 unique versioned source LOC (0 per 1,000 LOC). This is bounded contract review, not full feature acceptance.

The successor statically closes ADV145's remaining description-only failure-envelope finding. Ten scoped-read responses now reference a closed object requiring nonempty bounded code, message, and request_id strings. These cover assignee 400/401/404, attachment metadata 400/401/404, and attachment content 400/401/404/503. The existing 423 object remains closed, requires all three fields, and fixes code to attachment_held. Historical ADV145 remains accurate for its earlier snapshot; this repair was already committed before that feedback arrived.

WriteController's actual inherited renderer converts errors through CollaborationError. Its fixed public codes/messages satisfy the schema, and its request ID conversion removes NUL, repairs invalid encoding, bounds bytes, and substitutes unavailable for an empty result. The base ApiController also emits the same three fields; its request ID depends on the existing request-ID middleware supplying a nonempty valid identifier. That middleware was not inspected, so this review does not independently certify the base renderer for arbitrary malformed request IDs. The scoped V2 renderer reviewed here uses the stronger WriteController override.

No runtime behavior, route activation, authorization, persistence, or request processing changes occur in this schema patch. A reusable envelope avoids duplicated error object definitions without introducing another runtime abstraction. General bounded code/message strings are appropriate for a shared envelope; the held-specific code remains constrained by its existing dedicated response schema. Tests and generated declarations were not inspected or executed; parser/code-generation compatibility and end-to-end error responses remain runtime verification work.

## Exact coverage

contracts/v2/openapi.json at current SHA: 66–71, 74–79, 82–87, 155–160, 163–168, 171–176, 258–263, 266–271, 274–279, 299–304, 1257–1266 (70 LOC), plus 282–297 (16 LOC).

Same file at parent: replaced lines 66, 69, 72, 140, 143, 146, 228, 231, 234, 254 (10 LOC).

apps/server/app/controllers/v1/write_controller.rb: 45–51 (7 LOC).
apps/server/lib/elevateo/collaboration_error.rb: 9–19 and 35–41 (18 LOC).
apps/server/app/controllers/v1/api_controller.rb: 66–78 (13 LOC).

Total: 134 unique versioned source LOC. Each read remained below 180 source lines. Metadata-only path discovery excluded from source count. Broader schemas, transport, middleware, SQL authorization, generated types, tests, and inactive-route registry were not rereviewed. Previous reviews supply broader historical context, not fresh certification.
