# ADV143 — gateway guard and assignee activation

Exact gateway repair b3aaa07e670c503df676b7b761cd9d3a008b0fbc (parent 7f687d81); exact activation 732f2749f2eabef67bab93f7c1a7cb48fa566b00. Source-only review; no tests/builds/Docker/live operations or implementation edits. Reported core 58/266 and Steep zero diagnostics are supplied orchestration evidence, not independently executed evidence or directory acceptance.

## Coverage

Reviewed bounded changed hunks with four lines of context for activation, and three for gateway guard, counting both old and new versions:

- attachment_gateway_client.rb: old 34–40 and new 34–42: 16 LOC.
- v2_route_registry.rb: old/new 32–40: 18 LOC.
- v2_route_registry_test.rb: old/new 11–22; old 61–70/new 61–78: 52 LOC.
- featureGateways.tsx: old/new 19–27: 18 LOC.
- v2AssigneeOptionsGateway.ts: old/new 10–18, plus final whole file 1–47: 56 unique LOC after overlap.
- main.tsx: old 7–14/new 7–15 and old 25–32/new 26–34: 34 LOC.
- contracts/v2/openapi.json: old/new 18–26: 18 LOC.
- Final mailbox_assignee_options_controller.rb 1–58: 58 LOC.

Total **270 unique versioned source LOC**, under hard 300, above target 200 because minimal controller/adapter authority context was needed. No further source was inspected. Largest individual file slice 58 LOC; each displayed diff hunk is bounded. **0 confirmed defects; density 0/270 = 0 per KLOC.** Documentation/stat inventory is not source LOC.

## Gateway guard

Float conversion now binds a local, rejects nil, and passes the narrowed value to exchange. Kernel.Float normally returns a Float or raises; the nil check accommodates the checked signature without converting nil to a usable timeout or weakening failure handling. This tiny change introduces neither authority nor state, and preserves the transport-versus-real-exchange branch. Bounds and rescue details beyond the adjacent hunk are excluded from this fresh assignment rather than inferred newly proven.

## Activation alignment

The registry adds exactly listMailboxAssigneeOptions. Its focused test requires GET /v2/mailboxes/:mailbox_id/assignee-options mapped to v2/admin/mailbox_assignee_options#index; expected active count changes 18 to 19. Attachments remain explicitly rejected as inactive operations. OpenAPI marks the same operation active. main injects createV2AssigneeOptionsGateway while the FeatureGateways port remains optional, preserving the interface's disabled configuration possibility. The injection changes default application availability; it does not remove optionality from alternate hosts/tests.

Adapter validates mailbox UUID, integer limit 1–50 and cursor length 1–2048, uses encoded query parameters and the supplied AbortSignal, sends context/version headers, schema-parses a bounded response, and rejects any response whose context/version/mailbox differs. No organization-wide directory request or private subject metadata is introduced by the activation hunks.

## Current authority seam

Controller uses protected_read, derives actor, digest, Auth session, organization and authorization generation from server identity/session, and passes those plus exact mailbox to repository.page on every request. Cursor scope includes actor/org/context/version/mailbox/order/limit. Generation/context type checks fail closed; SessionStore.check! runs before projection/response. Consequently this source contains an explicit fresh-authority seam rather than trusting a cursor or browser UUID to supply actor authority.

The repository SQL and protected_read implementation were not read within this cap. Their actual current-session validation, private mailbox/eligible subject filtering and lock/RLS semantics are **unproven by this review**. Comments and OpenAPI promise these properties; the call boundary alone cannot prove them. No confirmed missing check is inferred from an unseen dependency.

## Tradeoff simulations and acceptance

- Old cursor after revocation: request re-enters protected_read and repository.page with current proof, then checks result before projection. Required runtime outcome is denial without subject rows; cursor signature validity must never substitute for current mailbox assignment authority.
- Foreign/private mailbox: adapter can submit any syntactically valid UUID, so server SQL must deny actors lacking assignment authority and never expose other mailbox subjects. Required proof is actual-role negative response with no identifiers, alongside a positive eligible-assignee page.
- A response arrives after context/version changes: the adapter checks against the request context. Consumer current-session fencing must additionally prevent stale request-context data entering the new session. Consumer implementation is excluded; exact browser race proof remains required.
- Optional port omitted in another host: its type remains optional. Existing consumer disabled-state behavior must remain covered; default main now supplies the port. Activation is useful without adding a broad organization roster or a second write authority; V1 assignment write remains final authority.

## Exclusions and decision

Excluded repository/SQL policies, controller/adapter full tests, registry implementation outside its changed hunk, schemas and transport internals, consumer/UI fencing and optional-port disabled state, actual cursor expiry/revocation fixtures, real browser visual proof, production deployment, whole-project standards and style. README/state/docs updates appeared in inventory but were not substantively reviewed. No performance expansion is visible in activation; underlying SQL query cost remains unreviewed.

No source blocker confirmed. Registry/contract/adapter wiring agrees in the covered seams. Continue Soren's exact-source directory controller/real-role/browser gates before treating this feature as runtime-proven or publishing. Simulations supplied for root/Jules Obsidian recording only.
