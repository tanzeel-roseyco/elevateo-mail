# Mira OFF405 ADV810 — actual R12 visual amendment

Application IN PROGRESS. Personally opened all 16 existing private PNGs with `view_image`, after reading all four corresponding real case records. This amends, without replacing, the preserved zero-image R10 report `fe405-r12-adv810-visual.md`. Exact runtime source: `3bf323ce59ccf762104c1a8e4d496afab53659f1`; no application source changed.

Soren's exact core job `be02-c7317292368a4167a6604d8fcbfe9ddd` records four real cases passed and cleanup_passed=true. This is bounded core runtime evidence, not full application acceptance. Prior strict frontend/backend results remain evidence only for their recorded revisions. Source verification reports dependency trees identical to R9; that does not turn inherited results into newly executed checks. Soren alone schedules the five isolated followups; none is assessed by this amendment.

## Capture identity

Private root: `/home/tanzeel/elevateo-mail-wave-20261014/soren/.local-jobs/app-3bf323c-r12/ops/local/be02-c7317292368a4167a6604d8fcbfe9ddd/playwright_real-chromium/native-private`.

Each filename pattern below has exactly four existing PNGs: `1440-light`, `1440-dark` (PNG IHDR 1440×900), `375-light`, `375-dark` (PNG IHDR 375×812). Theme labels match the actually viewed light/dark palettes. Full individual paths, dimensions and SHA-256 identities, plus hashed prerequisite/case records, are in `fe405-adv810-r12-actual-visual-receipt.json`. Images remain private and are neither copied into Git nor uploaded/published.

| Filename (`{partition}` as above) | Actual owning executed case | Captured state |
| --- | --- | --- |
| `SCN-GUI-006-P-inbox-{partition}.png` | SCN-GUI-006-P | Loaded one-row inbox |
| `SCN-GUI-006-P-{partition}.png` | SCN-GUI-006-P | Loaded reader with heading focus outline |
| `SCN-GUI-006-P-search-{partition}.png` | SCN-GUI-006-P | Search controls/query/scope and five loading skeletons |
| `SCN-DRAFT-001-P-{partition}.png` | SCN-DRAFT-001-P | Reopened saved editable draft, heading focus outline |

SCN-AUTH-001-P and SCN-READ-002-P passed but have empty artifact lists. Reader images belong to SCN-GUI-006-P, not SCN-READ-002-P. Login/invitation visual NOT_RUN; successful login execution is distinct from a login capture.

## Actual observations and findings

Inbox: both themes and widths keep the row, unread badge, date and All/Unread controls inside the viewport with no observed overlap. Subject/preview truncation is visible on desktop and stronger on mobile; the mobile header identity is ellipsized. These are bounded truncations, not evidence of hidden full-text access. The sparse one-row fixture cannot assess dense inboxes or long localized labels.

Reader: literal markup is visibly rendered as text. Sender/date, assignment controls and notes form readable separated cards. Desktop fits all shown controls; mobile wraps the date and helper text. The note textarea extends below the 812px capture, and lower actions are uncaptured; a viewport boundary alone does not establish a scrolling/clipping defect. Heading focus outlines are visible in both themes and widths. Keyboard movement/history assertions are inherited from the real case record, not independently established by a still image. No measured contrast or screen-reader claim.

Draft: subject, recipient, message, saved-version text, draft-only badge and Save changes fit within both viewport sizes, with no observed field overlap. Literal markup remains visible. Light desktop captures a loading sidebar while dark desktop captures loaded navigation; these different capture instants do not prove a theme-dependent failure.

**ADV810-V1, LOW observed visibility concern:** the upper-right user/profile glyph in dark draft desktop and mobile captures is nearly indistinguishable from its header background; the corresponding light glyph is also faint. Reader/inbox/search glyphs are more visible. Capture evidence establishes faint appearance only: enabled/disabled state, intended semantics, cause and numerical contrast are unverified. Root should scope any repair after confirming whether this is an intentional disabled/loading state. No source repair authorized or performed.

Search: controls remain inside the viewport; mobile wraps scope selection onto a second row. The narrow query field visibly cuts off the long query, while the summary shows it below. All four search images show loading placeholders, not loaded search rows, empty results or error states. This is a capture-coverage gap, not proof of a stuck request: the executed case separately records genuine API 200/history/scope assertions. Skeleton layout is assessable, animation/duration and settled-result readability are not.

No other definite visual defect observed in these captured states. One bounded visibility concern is recorded; defects/KLOC is not applicable to image inspection (zero source LOC reviewed). No zero-defect/full visual PASS claim. Error, denied, empty, invitation, login, open mobile drawer, focused form-control traversal and scrolled mobile-reader states remain visually NOT_RUN. Static images do not establish responsiveness between these sizes, accessibility compliance or performance budgets.

## Prerequisites and activity

Read exact private artifacts promptly, corresponding records, README/state/documentation/STANDARDS and current routing/inbox. Read-only artifact inventory, PNG metadata/hashing and image viewing; documentation/receipt commit only. No browser/tests/Docker/server/build/dependency work, application edits, public artifacts, mail, secrets or user-data upload. Frozen source untouched. Root independently inspects actual images and owns vault updates. Requested Sol6.1 LOW/Fast/YOLO; effective model/effort/tier/billing unverified. Owned visual continuation complete; return idle.
