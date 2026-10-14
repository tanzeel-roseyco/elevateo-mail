# QA816 seeded visual inspection — exact f210b5bf

Source `f210b5bf53f8a94367352e8f2c7de85d17a76f8f`. Soren alone ran `apps/web/e2e/visual-states.spec.ts` in fleet Docker on 2026-10-14 16:26–16:27 UTC, using the built production artifact and synthetic routed API responses. His receipt is `docs/completion/qa815-evidence/visual-f210b5bf-8png.txt` in his worktree: 8/8 Playwright cases passed, run exit 0. Initial host cleanup failed on root-owned npm files; bounded root-in-container task cleanup then removed the archive and task container, with final task absence confirmed. These are **SEEDED-SIMULATED** images, not real Auth/API or installed Android evidence.

Private artifact directory: `/home/tanzeel/elevateo-mail-completion-20261015/control/qa816-private/f210b5bf53f8a94367352e8f2c7de85d17a76f8f/qa815-8png/`. Tessa opened all eight original PNGs. The four inbox captures (`desktop` and `narrow-390`, each light/dark) show a branded shell, separate Personal and Outreach entries on desktop, three readable linked conversation rows, visible unread state, and no visible clipping or horizontal overflow. The 390px header truncates the synthetic organization name while retaining the logo, simulation badge and account icon. The four reader captures show an accessible back link, one plaintext body and inert visible `<script>` text; the payload is rendered as text, and no image or script element is visible in the inspected article.

| Original PNG | Concrete visual observation |
| --- | --- |
| `desktop-light-inbox-ready.png` | Three readable rows, unread badges, separate Personal/Outreach rails, brand and simulation label; no visible clipping. |
| `desktop-dark-inbox-ready.png` | Same structure remains readable in dark colors; row text and unread badges remain discernible. |
| `narrow-390-light-inbox-ready.png` | Three rows fit 390px; hamburger, brand mark, simulation badge and account icon fit header. Organization name truncates. |
| `narrow-390-dark-inbox-ready.png` | Same 390px structure remains readable in dark colors with no visible row clipping. |
| `desktop-light-reader-ready-hostile.png` | Literal `<script>` line and hostile URL are readable as plaintext; “Open this message” and attachment badge share a footer row. Red Assignment/Notes errors and count mismatch remain. |
| `desktop-dark-reader-ready-hostile.png` | Literal hostile text and footer actions remain readable in dark colors; the same fixture errors remain. |
| `narrow-390-light-reader-ready-hostile.png` | Literal hostile text fits the card. “Open this message” stays inside the card; attachment badge wraps to a second line without visible clipping. Red fixture errors remain. |
| `narrow-390-dark-reader-ready-hostile.png` | The 390px footer wrap and hostile plaintext remain readable in dark colors; the same fixture errors remain. |

The narrow images show a navigation trigger but keep its drawer closed, so these pixels cannot prove keyboard operation, drawer reachability or the Personal/Outreach entries inside it. The screenshot links and footer alignment are visible, but clicking/focus behavior requires the separate interactive browser cases.

| Finding | Affected PNGs | Evidence and scope |
| --- | --- | --- |
| Synthetic ready-reader fixture has two red validation errors | All four `*-reader-ready-hostile.png` | Assignment and Internal Notes both show “The entered values are not acceptable.” `apps/web/e2e/visual-states.spec.ts` generic thread matcher uses `pathname.includes('/v1/threads/')`, so it intercepts assignment/notes subresource GETs and returns a thread-detail DTO. This contaminates the intended ready-state visual evidence; it is a fixture defect, not evidence of a real API failure. Owner repair: anchor thread detail path and route schema-valid assignment/notes responses separately. |
| Synthetic message count contradicts rendered thread | All four `*-reader-ready-hostile.png` | The fixture's `threadDetail` sets `message_count: 3` but this scenario passes one message with `next_cursor: null`; screenshot says “3 messages” and shows one, with no continuation control. Owner repair: use a count matching the shown message or provide consistent paged data. |

No visible app layout defect is confirmed in this eight-image slice. Pixel inspection covered the displayed desktop/390 light/dark inbox and reader states only; it did not prove keyboard use, 200% text zoom, API-backed data, mobile drawer behavior, Outreach/People pages, session/logout, installed Android, or any of the 21 QA816 real-browser cases. The 37 QA816 fixed screenshot IDs are still candidate IDs with **zero** real-auth QA816 PNGs. Current backend migration/Auth/HTTP gates remain open.
