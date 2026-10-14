# ADV132 — Admin preferences and role audit annotations

Source-only bounded review of afdf997ea8fe8747340c5561ea949bf800cb8cb9 in completion-sabine-sec802. No tests, builds, Docker, or application execution performed.

Coverage: apps/server/app/controllers/v2/admin/user_display_preferences_controller.rb lines 1–101 (101 LOC; blob bb13daa42968b64395cd9a0547233aa0c3be8a25), and organization_role_audit_controller.rb lines 1–75 (75 LOC; blob a016e804676f81f66400735b753e790b01b0979c). Separate reads of 101 and 75 lines; corresponding zero-context parent diff repeated only already counted added annotations. Total 176 unique versioned source LOC. No parent source or additional helper source read in this assignment.

Confirmed defects: 0. Defect density: 0/176 = 0 per KLOC. This is bounded source acceptance, not a full feature or authorization certification.

The diff adds only 11 local type annotations. Read connections are AbstractAdapter, identities SessionIdentity, read session ReadResponse::item, and query Hash[String, String]. Write connection is WriteStatements and input WriteInput::object. These match the previously inspected ADV131 contracts: sig/read_controller.rbs 1–16, sig/write_controller.rbs 1–14, read_controller.rb 1–50, and write_controller.rb 32–40. Those prior ranges are cited context, not newly read coverage. No untyped escape or blanket suppression was introduced.

Preferences remains scoped to the authenticated session digest rather than a caller-selected user. Update requires exactly name and expected_revision, rejects nonempty query parameters, validates nullable names and integer revision bounds, and checks returned user/organization metadata. Read/write error mapping, optimistic revision request, and output validation are unchanged. Role audit retains path organization equality with identity.org_id, session/context/version-bound cursor scope, UUID cursor-position validation, bounded result decoding, and next-position consistency checks. Annotations cannot change those runtime branches.

Design tradeoff: precise local annotations compensate for protected-block inference while retaining the established read/write wrapper interfaces. This is a small, explicit repair; adding controller-specific abstraction would increase coupling without improving this patch. Actual runtime authority still depends on the existing wrappers and SQL, which this assignment does not independently certify.

The complete scoped controller bodies were assessed for input/null/empty/bounds handling, state coupling, error propagation, permission boundaries, naming/comments, unnecessary complexity and hot-path work. No new loops, queries, dependencies, state changes, or user-facing behavior were added. Test and documentation source were not included in this assignment; focused strict typing and runtime regression evidence remain pending. No claim is made that these comments close a particular Steep diagnostic until the exact-source gate runs.

Excluded: broader protected helpers beyond prior ADV131 context, preference/role-audit SQL authority, cursor implementation, projection validators, routes, HTTP/database tests, and execution/platform behavior. Do not use this report to certify those seams or the invalid over-budget Theo review.
