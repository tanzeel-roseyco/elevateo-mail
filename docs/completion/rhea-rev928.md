# REV928: QA816 H3/I4 closed-error repair review

Reviewer: Rhea, actual runtime `gpt-6-sol` low; billed tier unverified. Read-only independent source review, 2026-10-14. No app build, application test, Docker command, implementation edit, live mail or production mutation was performed.

## Exact scope

| Source | Commit | Exact SHA-256 | Coverage |
| --- | --- | --- | ---: |
| `tests/acceptance/playwright/qa816-assignee-options.e2e.ts` H3 | `f46a958b440524824b03b9531d0bf3da1b8bef77` | `8ce2af37e12bf4049672a648d9e632dbf594c20c862ac69dbf67b8611b5283c3` | 1–77, 77 LOC |
| `tests/acceptance/playwright/qa816-attachment-api.e2e.ts` I4 | same | `73f26d31d4df808efe295d98b073b6e2515c03116c3f3f61a87f295ce6ec49ac` | 1–117, 117 LOC |
| Cassian current `apps/server/lib/elevateo/collaboration_error.rb` context | integrated checkout `290d30b2129823d17f1b2e9cd2452a24a71f353d` | `613f9c60bb9e46cb2f9270a106cff4d581b4ae4185b01e0baeb2f844ceaae3b6` | 1–43, 43 LOC |

H3/I4 total **194 current test LOC**; server context adds 43, for **237 unique versioned source LOC**, within the 240 LOC cap. The two test files were read in separate calls, each under 180 lines. Commit metadata and Tessa documentation were inspected without expanding the source packet. No other controller, database, fixture producer, UI or reporter source was reviewed.

## Result: zero new confirmed source defects

The earlier REV921 MEDIUM privacy oracle is **statically closed**: both H3 and I4 use `z.strictObject` with only bounded `code`, `message`, and `request_id`. Parsing rejects additional JSON fields before `toMatchObject` checks exact safe code/message pairs, so an error body carrying a private key, URL, storage reference or encoded bytes as an extra property cannot pass. `request_id` is mandatory and bounded to 1–128 characters. Cassian's current `CollaborationError#body` returns exactly those three fields and bounds the ID to 128 bytes; its vocabulary matches H3 `not_available`/`cursor_invalid` and I4 `attachment_held`/`not_available` messages. The fixed `Content-Disposition: attachment; filename="attachment"` assertion remains separate from the list metadata filename and matches Cassian's current reported/controller source.

The prior REV917 H scope finding remains statically closed by the exact eligible UUID set and terminal-page assertion. I4 still requests rejected content and requires 423 `attachment_held`, closing the earlier missing-request oracle. I4 still constructs a full foreign mailbox/thread/message/attachment path; attribution of its 404 to authorization remains **conditional** on a trusted producer creating and proving that exact existing foreign tuple. The current strict sidecar loader validates shape, permissions and known mailbox/thread IDs but cannot establish relational existence. There is no such producer or fleet runtime receipt yet. The historical three REV917 defects and one REV921 defect remain real historical findings; this review does not erase them.

Defect density for this repair review: **0 newly confirmed defects / 194 current H3/I4 LOC = 0/KLOC**. The 43 server LOC are comparison context, not additive test coverage. This is static confidence only, not a PASS for TypeScript, Playwright, SQL, Auth, route or browser behavior.

## Rubric and remaining proof

The cases use a real browser session helper and same-origin requests, with explicit 200/400/404/423 outcomes, bounded JSON response size, UUID and list schemas, exact clean-byte SHA-256/length, and a fail-closed missing private sidecar. Empty, null, malformed and over-limit inputs either fail parsing/setup or are outside the named positive/failure scenarios; H3 does not exercise an empty eligible page or smaller-limit pagination. The small helpers have clear names, no new class, complex loop, database hot path or mutable product state. The strict error schema adds deliberate contract coupling; that is justified by the no-private-field acceptance claim and matches the current public renderer. Existing source tests cover happy and likely denial paths, but no execution occurred here. A trusted disposable attachment fixture producer, coherent active routes/authority and Soren fleet-02 Docker TypeScript/browser receipts are still required; UI picker/download, revocation and gateway outage remain outside H3/I4.
