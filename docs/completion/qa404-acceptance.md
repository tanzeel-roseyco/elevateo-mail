# QA-404 acceptance — IN PROGRESS

Elara OFF-404, attempt 2; baseline c3ecd1f4cc35b98755a523d48032391ccdd0402c observed. Root's latest explicit source authorization supersedes the stale initial inbox hold. Requested runtime identity GPT-6.1-Sol / low / Fast; model, service tier and session ID are not independently exposed to this assistant. No substitute identity or lifecycle receipt is invented. REA is absent from the supplied skill catalog; reference capture remains root-owned.

Source-only work: authored READ-001-F1 static zero-visible-mailbox real Auth case and DRAFT-008-F1 same-mailbox private-author case. All runtime outcomes below are NOT_RUN, pending Soren's serialized container lease and Rowan's least-privilege schema repair. Historical fixture/unit results do not attest this baseline. No host app tests, dependency install, Docker mutation, mail send or activation occurred.

| Exact Playwright scenario | Authored stimulus / remaining requirement | Current result |
| --- | --- | --- |
| AUTH-001-P / F1 | Real login / wrong password at desktop and narrow widths | NOT_RUN: scheduled stack required |
| AUTH-001-F2 | Duplicate submission with authentic unforwarded login abort, error and genuine retry | NOT_RUN: one-shot gate not yet authored |
| AUTH-003-P | Real logout, protected reload and session denial | NOT_RUN: scheduled stack required |
| AUTH-003-F1 | Held real write vs logout, both lock directions and watchdogs | NOT_RUN: Rowan private coordination barrier required |
| AUTH-003-F2 | Authentic protected success delivered after logout; cancellation cannot pass | NOT_RUN: one-shot delivery gate required |
| AUTH-006-P | Invitation/scanner-safe acceptance | NOT_RUN: private Mailpit invitation/reset actor lifecycle required |
| AUTH-007-F1 | No organization protected deep link | NOT_RUN: scheduled stack required |
| READ-001-P | Multiple authorized capability-varying mailboxes / tenant switch | NOT_RUN: expanded private fixture required |
| READ-001-F1 | Real revoked-mailbox member login 200, validated complete empty collection, retry observation, denied deep link | NOT_RUN: newly authored source |
| READ-001-F2 | Live revocation or genuine malformed/oversize response | NOT_RUN: private stimulus missing; corrected reason |
| READ-002-P / F1 | Plaintext reload/back / foreign thread generic denial | NOT_RUN: scheduled stack required |
| READ-002-F2 | Hostile literal search/read, null metadata, long-content boundaries | NOT_RUN: fixture contract expansion required |
| DRAFT-001-P / DRAFT-008-P | Real save receipt, list, exact reopen and reload | NOT_RUN: scheduled stack required |
| DRAFT-001-F1 | Stale CAS conflict with independent no-overwrite observation | NOT_RUN: Rowan committed-state observer required |
| DRAFT-001-F2 | Oversize/rejected boundary with unchanged state | NOT_RUN: independent observer required |
| DRAFT-003-P / F1 | After-commit ACK loss / no-forward uncertainty with operation recovery | NOT_RUN: private observer and authentic transport gate required |
| DRAFT-003-F2 | Recorded conflict / unrelated operation recovery | NOT_RUN: observer/control missing; expiry was an inaccurate reason |
| DRAFT-008-F1 | Two actual composer sessions save distinct drafts; complete <=10-page peer list, private/missing detail 404, author reload continuity | NOT_RUN: newly authored source |
| DRAFT-008-F2 | Uncertain save reload retains operation identity and text | NOT_RUN: private uncertainty control required |
| GUI-006-P / F2 | Reader history/focus at both widths / absent production fixture paths | NOT_RUN: scheduled stack required |
| GUI-006-F1 | Actual routing/readiness mismatch negative control | NOT_RUN: isolated wrong-target control required |

Inventory preserves 26 unique Playwright identities: 12 source-authored scenarios and 14 explicit unavailable registrations. This is source accounting, not passing coverage. Puppeteer/CDP and Selenium each retain four purposeful real login/read/draft/logout journeys; no synthetic count expansion. Every selected lane must export schema-valid exact-ID results; the overall run stays incomplete while any case is NOT_RUN.

Readiness and ordering requirements remain explicit: both real database lock directions with bounded acknowledgement/watchdogs, final-state observation after rollback, and a genuine wrong-target readiness control that must reject. No sleeps establish race order; the empty case's two-second deadline closes an event-based negative retry observation. Browser transport deadline is 10 seconds in transport.ts; future holds must remain <=5 seconds with >=2 seconds margin.

Visual queue from Mira: actual app 375x812 and 1440x900 in light/dark; loading/auth error/empty/denial/conflict/recovery; keyboard focus and nested aria-current; narrow search entry, search history and mailbox scope. Screenshots must use synthetic acceptance data and avoid credential forms. Root owns visual approval and Obsidian mirroring.

Independent review requested: read-empty.e2e.ts as one <=200-line slice; draft-privacy.e2e.ts as one <=200-line slice; unavailable diff separately, plus dedicated design-tradeoff review. Static author correction added required error message field after inspecting CollaborationErrorSchema. No independent defect density is claimed for these changes. Elara independently reviewed Rowan's 72-line draft_bootstrap_test.rb at 42f6369: zero demonstrated defects (0/KLOC), runtime NOT_RUN; exact source hash and limits sent to Rowan inbox.

Soren handoff: freeze this commit plus Rowan repair into a new immutable integration SHA before execution. Do not run mutable mixed checkouts. Use selected BE02 runner, actual inspected local Docker context/hostname, current root-approved dispatch identity and all three browser lanes sequentially. Retain source before/after hashes, sanitized case records, screenshots, result.json and independent cleanup.json; absence of evidence is NOT_RUN. The inherited tools package mismatch and scripts/dev seed/check service mismatch are not passing workflows.
