# FE-01 accepted decisions

Decision owner: actual `gpt-6-astra`, effort `max`, agent `/root/plan_synthesis`; coordinator-observed spawn evidence is in `metadata.json`. Three independent successful exact-model opinions are preserved alongside this file. This accepts a bounded first checkpoint, not completion of FE-01 or its backend dependencies.

<!-- AIDEV-NOTE: Read checkpoint acceptance cannot be promoted to full FE closure without real dependency integration. -->

## FE-D01 — bounded read checkpoint

Accept Fable 5's simpler shell/inbox/plaintext-reader checkpoint. Include current-session bootstrap, mailbox capability display, URL navigation, bounded HTTP transport, loading/empty/error/session-unavailable states, and fixture/HTTP conformance from the start. Omit composer, save, review, send, cancellation, attachment actions and collaboration mutations until their full safe contracts are accepted. This changes the proposed brief's first checkpoint, not its final product acceptance. No dead controls or simulated success claims substitute for those features.

FE-01 remains open under issue [#4](https://github.com/tanzeel-roseyco/elevateo-mail/issues/4). In particular, reject dropping F07 or reducing full accessibility/visual acceptance merely because the first checkpoint cannot exercise later features.

## FE-D02 — canonical generated contract and one owner

Freeze `contracts/v1/openapi.json` (OpenAPI 3.1.1, version `1.0.0-read.1`) plus its normative README for the four GET operations. JSON is chosen over the consultants' suggested YAML only to avoid another parser in artifact verification; semantics are identical. Schema SHA-256: `94c5f31bc5d514fed420dcbcee2f6ce49bf4254e325000ea0794fe6a1140e8ca`.

Generate TypeScript `paths`/`components` using pinned `openapi-typescript 7.13.0`; use these in the typed HTTP client/gateway, and check regeneration. This generates types, not executable fetch methods or runtime validators. Retain runtime boundary validation with conformance against the canonical schemas; do not hand-author competing DTO interfaces. Later language SDK generators remain separately gated. The coordinator is the sole ongoing contract owner; the frontend writer cannot redefine it. BE-02's own mandatory gate checks and may explicitly amend it, with regeneration and affected tests.

## FE-D03 — session, capability consistency and CSRF

Accept Opus's real per-session CSRF token **and** exact Origin check for future unsafe requests. Reject Fable 5.1's alternative relying only on Origin/Sec-Fetch-Site plus a fixed marker. GET session provides authenticated bootstrap only; login/logout routes remain undefined, and no fake local sign-out claims are permitted. Missing/expired/revoked authentication is uniformly `401 unauthenticated`, clearing all sensitive client state and outstanding request generations.

Session returns actor, organization, context/version and CSRF token. To avoid duplicated/stale capability lists, GET mailboxes is their sole authoritative list. The other reads send context/version headers; Rails rechecks current authorization before returning data and rejects stale context with `409 context_changed`. Absent and inaccessible objects both use `404 not_available`, adapting Opus's proposed `403 mailbox_forbidden` to preserve non-enumeration. Tokens remain in memory. A transport seam may allow future native credentials, but no unused auth framework or native credential implementation is added now.

## FE-D04 — bounded read semantics and plaintext

Accept explicit scoped cursors, invalid-cursor recovery once, independent message pagination, nullable sender/subject/date values and valid empty conversations. Freeze 50-entry list/20-message detail maximums, byte limits and per-field bounds in OpenAPI/README. Adapt the proposed 64 KiB summary budget to 256 KiB so 50 realistically sized escaped summaries fit; byte budgets still take precedence and can shorten pages with a continuation cursor. Detail limit is 2 MiB; every truncation is explicit. No assumption that JSON escaping costs one byte per character.

Render only escaped text. Reject richText/Markdown reuse and automatic link/image fetching. A GET never marks mail read. Context keys and late-response rejection include actor, organization, context/version, mailbox and filters. Abort alone is insufficient. No network/schema failure activates fixtures. Production must exclude fixture modules and data, with both import-graph/build inspection and a negative failure test.

## FE-D05 — preserve draft/send correctness for the next checkpoint

For the later contract, accept JSON `expected_version` with HTTP 409 `draft_conflict`, serialized autosave, preservation of the local edit buffer, and explicit conflict comparison/reload. Do not import the legacy 412 branch into the new contract; the coordinator must reconcile the shared reliability document.

Prefer a separate authorized review envelope for an exact saved draft version, as Fable 5/5.1 recommend, over embedding all review authority in ordinary draft reads. This keeps review freshness and sender/attachment eligibility explicit. It is a design direction, not a partially frozen endpoint. Prefer bounded conflict metadata plus a fresh authorized read over Fable 5.1's full draft in the error body, avoiding accidental disclosure and oversized error payloads.

All three identify uncertain saves/approvals correctly. Adapt their `last_mutation_id`/`last_client_request_id` suggestion: a single last-ID field cannot prove an earlier write did not commit after another device writes. Before draft implementation, specify a durable idempotency/operation lookup, ownership, retention and payload matching that survives concurrent updates. A consumed-draft job link helps recover approval but is not by itself a complete unknown-outcome protocol. Identical send intent may retry the same identifier only under the accepted server idempotency contract; a different intent never turns uncertainty into a new send. Consumed drafts cannot be re-sent. Keep agent-origin review and exact approved content server-owned.

Authoritative job states, delivery facts, cancellation boundary/conflicts, bounded polling and honest unknown/reconciliation UI remain required in BE-03/04 plus dependent frontend acceptance. Attachment scan states and currently authorized downloads belong to BE-05. No placeholder DTO here silently decides those contracts.

## FE-D06 — audited reuse, minimal state and motion ownership

Extract selected primitives from exact first-party commit `4322cfbb639a383c4e8d940f2dbb019a9832e977` using the source audit's blob identities. Preserve Ledger styling and accessibility behavior, adapting the actual `src/styles/index.css` and `SidebarFrame` export in `src/app/Sidebar.tsx`. Use LiveInbox/LiveShell and HTTP safeguards as behavior/presentation references only. Do not copy mock stores, campaign counts, old account/CSRF headers, transient composer persistence, reviewed-send replacement lifecycle, or richText.

Use URL state, component state and a typed gateway. Reject adding Zustand or a custom external store absent a demonstrated shared-state need. No C++/Qt/WebGPU, desktop auth or duplicate native screens in FE-01. FE-02 remains Opus 5.5-owned for motion under its own fresh gate; retain reduced-motion CSS/focus behavior now. Later animation may follow an acknowledged save or authoritative status; it never invents them.

## FE-D07 — supplemental runtime evidence

The runtime audit was completed after the opinion packet and is preserved as a separately hashed snapshot. Accept Node 24.21.0/npm 11.19.0 in the verified pinned Node image, React/DOM 19.3.0, router 7.18.4, Vite 7.3.6, TypeScript 5.9.3 and Zod 4.6.5. Use Radix 1.1.23 only for imported dialog primitives. Replace historical Vitest/coverage 3.2.7 with paired 4.1.11 because the publisher's advisory says 3.x will not be patched. Select Playwright 1.64.0 with its matched digest-pinned browser image and generator 7.13.0.

These are metadata/advisory selections, not executed compatibility or whole-tree security claims. The coordinator resolves the exact lock in Docker, audits resolved production/dev packages and licenses, verifies regeneration and performs all application checks. Do not claim the browser image contains the selected Node build runtime. New support packages need a purpose and version justification; omit unused dependencies.

## FE-D08 — operational ownership and evidence

The coordinator starts the exact Fable 5 implementation worker in a fresh isolated checkout with read/edit tools only, no subprocesses or child agents. It exports pinned source and generated types, owns Docker resolution/checks and records the real issue/base/session/model/bounds. This split preserves frontend ownership without granting the writer backend or process authority.

Every application change still receives the full adversarial rubric, coverage assignments at most 200 lines each and a dedicated design reviewer. Record defects and density. Actual browser visual/accessibility validation and Docker checks are mandatory before relevant acceptance. The unavailable Obsidian connection remains a limitation; the analytical scenario table is not a claimed simulation. No publishing, live mail, production activation or weakened per-task/repair consultation gate is authorized here.
