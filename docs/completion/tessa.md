# QA816 API-backed browser acceptance candidate

Scope: `tests/acceptance/playwright/qa816-send.e2e.ts` adds three real-browser scenarios for a case-owned saved draft and simulated send, reader authorization, and mobile logout/deep-link revocation. It reuses the existing authenticated Playwright seed, real response observer, sanitized case record and bounded screenshot writer; no production source or frozen contract changed. The candidate begins at baseline `bbf2353`; final commit is recorded in the shared outbox.

Dependencies: Soren must supply a disposable seeded Auth/PostgreSQL/API/web stack with the BE03 send routes explicitly enabled and a manager whose mailbox has compose and approve_send. The case never fabricates auth or business responses. Approval is simulated and must have no live transport. A disabled route, unavailable real-auth seed, or no configured sender is a setup blocker, not acceptance evidence. Mobile coverage means a 375px browser viewport, not an installed Android app.

Requested execution only: under Soren's Docker lease on fleet-02, run acceptance TypeScript compile and `playwright test --config playwright/playwright.config.ts qa816-send.e2e.ts --workers=1` in the existing internal_http real-browser container; retain sanitized case records, four candidate PNGs, endpoint/status evidence, source SHA, and exact cleanup/independent resource absence. Run the existing real-auth setup and production-bundle checks first. No tests or screenshots were executed by Tessa, and no browser/visual PASS is claimed.

Limitations: suite does not establish production deliverability, installed Android, outreach dispatch, zoom at 200%, or all loading/error states. Existing acceptance cases cover inbox/search, drafts, logout, unavailable and loading views on older source; those results do not verify this candidate. Root must visually inspect actual screenshots and schedule a separate outreach/admin state pass when corresponding APIs and seeded roles are integrated.

Design tradeoff simulation: one manager-owned draft avoids mutating a shared seed and gives an immutable API chain, but it needs reliable disposable cleanup. The reader test verifies UI nonactionability; direct unauthorized API assertions should be added after the agreed versioned BE03 error contract and seed are available.

Continuation candidate: `qa816-matrix.e2e.ts` adds authenticated inbox permalink/keyboard/history at 1440/375/320px, duplicate draft submit and reload, foreign-thread denial plus settled unique empty search, and Fable branded shell desktop light/dark plus mobile drawer screenshots. Strict Fable assertions require his committed shell to be merged before running. `QA816-SHELL-P` accepts Celeste's truthful paused/unavailable campaign list; create/detail requires a separate authoritative versioned API and Fable route, so it is not marked covered. Browser pinch/text zoom at 200% still needs a reliable container execution mechanism; changing CSS zoom would be a simulation, not genuine browser zoom.

`QA816-SEARCH-F2` adds genuine held-response loading, transport-abort error, and server-backed retry to a settled empty result. It uses the existing transport barrier and does not synthesize a business response. The shell scenario requires both Fable FE805 and Celeste FE807 to be integrated with the protected read context; a placeholder-only merge is deliberately insufficient.

`QA816-ZOOM-P` uses Chromium CDP visual viewport scale 2 and verifies `window.visualViewport.scale`, seeded inbox visibility and a screenshot. It is genuine pinch/visual viewport zoom, not desktop browser text zoom, and requires Chromium; that distinction remains in the acceptance ledger.

Reporter identity repair: `quiet-reporter.ts` accepts `SCN-[A-Z]+-NNN-(P|F1|F2)` titles. The nine QA816 cases now use `SCN-QA-816/817/818` identities; prior `QA816-*` titles would have failed publication before an acceptance record existed. Historical evidence inventories remain unchanged; these are supplemental cases with their own records and cannot be counted toward the frozen BE02 set.

Screenshot admission repair: the shared screenshot writer uses a closed ID list and would reject every new QA816 capture. Sixteen fixed supplemental IDs were appended to that list without changing the lock, size budget, path controls or historical IDs. The run must still use a task-owned artifact ledger with sufficient budget; no screenshots have been produced.

`SCN-QA-819-P` adds a current V1 roster boundary: manager GET 200 and rendered revision, plus a separate real reader session with API denial and nonactionable UI. It does not mutate membership or claim Lyra V2 grant coverage. Two fixed admin screenshot IDs bring the supplemental screenshot set to eighteen.

`SCN-QA-819-F1` is a pending integrated V2 People candidate: real manager grants GET 200 versus separate reader 403/404, with truthful unbound planning identities and no reader save control. It requires Cassian's active V2 grants GET, Lyra/Fable integrated `/people`, and a seed with a reader denied administration. No grant is changed; no V2 runtime outcome is claimed. Two more fixed screenshot IDs bring the supplemental set to twenty.

Cassian's integrated Celeste page currently says “Outreach is draft or paused. Sending and enrollment are unavailable.” The shell assertion follows that exact source copy; it still requires a bound Outreach gateway for actual list data. This static alignment does not establish the active V2 browser path.

Execution partitions for Soren (all inside fleet Docker, each exact merged source SHA):

| Partition | Playwright grep | Admission |
| --- | --- | --- |
| V1 baseline | `SCN-QA-817|SCN-QA-819-P` | Real Auth/BE02 V1 seed and API; includes reader, draft, search, V1 roster. |
| Shell/visual | `SCN-QA-818` | Fable+Celeste integrated shell, Chromium for visual viewport scale; Outreach list gateway is not required for copy/route check. |
| BE03 send | `SCN-QA-816` | Enabled simulated send routes, seeded configured sender, case-owned disposable draft. |
| V2 grants | `SCN-QA-819-F1` | Cassian active grants GET, Lyra/Fable `/people`, real role-scoped seed. |

The shell case validates route and paused copy only. It does not claim campaign list data until the V2 adapter is bound. Each partition must produce its own sanitized case records and task-owned screenshots; a blocked partition remains NOT_RUN, and no passed partition stands in for another.

Fable R3 visual follow-up: `SCN-QA-818-P` now checks People and Personal settings links in the desktop Personal rail, captures the real session-backed `/settings/personal` page, and checks People in the mobile drawer. It retains Fable's current accessible drawer names until the owner supplies exact replacement names. One fixed screenshot ID brings the supplemental set to twenty-one.

Outreach candidate: `qa816-outreach.e2e.ts` adds `SCN-QA-820-P/F1/F2` for real V2 draft campaign create/list/detail/reload, empty-name no-POST, and reader POST denial. This is gated on Cassian's bound OutreachGateway adapter, active V2 campaign routes, manager/reader seed policy and disposable campaign cleanup. No live sending/enrollment is attempted. Four more fixed screenshot IDs bring the set to twenty-five. Source is NOT_RUN; a current `featureGateways = {}` build is an expected setup blocker, not a failure of the product flow.

`SCN-QA-821-P` adds a logout/cache candidate after a real V2 campaign read and People navigation. Post-logout deep links to both routes show only sign-in, and `/v1/session` returns 401. It requires the same bound V2 adapter and active grants route; it does not export or screenshot the sign-in form.

Static policy correction: the former reader POST denial assumption in `SCN-QA-820-F2` was unsupported by current Dorian/Rails source. F2 now creates one case-owned draft with a manager, signs in a separate `other_org` browser context, and requires a real V2 detail 404 with no campaign name rendered. The fixed screenshot ID was renamed accordingly. This is source correction only; no runtime claim.

Coordinated drawer rename: root/Fable selected `Open navigation` for the mobile trigger and `Navigation` for the drawer accessible title. QA816's shell selector now requires those names and must run only on Fable's follow-up source or an integrated descendant. Older Fable `6e9d32f` still uses `Open mailbox menu`/`Mailboxes` and is not admitted for this updated case. Existing `apps/web/e2e` references are in another owner's path and were requested for a coordinated update.

Mira compose seam candidate: `SCN-QA-821-F1` opens a seeded thread as a composer, uses “Reply to this sender as draft”, saves case-owned reply text through real V1 PUT, reloads and checks reply-to thread binding. It requires Mira's integrated reply UI and an eligible seeded sender; no send/approval occurs. One fixed screenshot ID brings the set to twenty-six. Source NOT_RUN.

Reply candidate correction: the server may mark a seeded thread subject truncated, in which case Mira intentionally leaves the reply subject empty. QA816 checks the recipient and reply-to binding without assuming a `Re:` prefix for that fixture.

Mira transport recovery candidate: `SCN-QA-821-F2` aborts an unforwarded real browser thread GET, asserts the error removes plaintext, then clicks Try again and requires a real GET 200 and seeded message. It uses the existing acceptance transport barrier, not a fabricated response. Two fixed screenshots bring the set to twenty-eight; runtime remains NOT_RUN.

Review packet suggestion for root: divide `qa816-matrix.e2e.ts` by scenario groups into bounded <=200 LOC packets rather than treating the whole file as one review assignment; review `qa816-send.e2e.ts` and `qa816-outreach.e2e.ts` separately. A dedicated design tradeoff reviewer should inspect fixture ownership, API response observation, barrier semantics and screenshot admission. No independent review has occurred.

Fleet source-only receipt: Soren's exact `302142c8380049803090f021246215c5a721822e` acceptance container completed npm install, TypeScript compile/build and 73 acceptance unit cases PASS, with task container absent. This predates all later QA816 cases and screenshots. His Playwright `--list` diagnostic exited 1 under quiet reporter; exact sanitized cause requested. No real browser cases or screenshots ran. Integrated candidate `7523933` remained blocked by backend migration before HTTP/browser, according to the current Cassian/Soren outboxes.

Gateway seam update (static only): Cassian `844a3cf` merged Fable's `77dbd86` production bridge and now passes `bridgeOutreachGateway(createV2OutreachGateway())` from `main.tsx`. This supersedes the earlier `featureGateways = {}` source blocker for that candidate. Cassian/Soren still report web lint/type integration issues and an integrated PostgreSQL migration failure (Corin attachment CASE in later receipt), so V2 HTTP and browser cases remain NOT_RUN. The Fable drawer trigger is `Open navigation menu` at `77dbd86`, while root's earlier message said `Open navigation`; exact accepted label is pending an answer.

Drawer and list probe follow-up: Fable `f295b35d6a57f90d80ef75c076b8841bdbde880a` implements the accepted `Open navigation` button and `Navigation` dialog, updating its web e2e selectors. QA816's staged selector now matches that owner source. Soren ran a list-only fleet Docker probe on exact Tessa `6389cc4`, using a task-local example seed converted to valid runtime kind: `playwright --list qa816-send.e2e.ts` exited 0 under the real quiet reporter, with exact task cleanup. This fixes list/config admission only: zero browser cases and screenshots. Current integrated web lint still fails six Fable bridge unused-parameter errors; integrated SQL/HTTP/browser remain gated by the Corin migration repair.

Independent review routing: root assigned Felix. Tessa sent Felix exact functional packets A152+B181=333 LOC with source hashes from `tessa-review-packets.md`; C169 and dedicated design review remain for separate assignments. This is a request only: no review findings, density or acceptance claim yet.

Felix packet A source review found one MEDIUM empty-search oracle defect: `toHaveCount(0)` could pass during loading before a settled empty result. QA816 now waits for exact `No matches`, the `Searching` status to disappear, and zero result links before screenshot. This is a source repair pending Felix re-review and fleet runtime; the initial finding remains in history.

Felix's independent repair re-review on exact `e91eac6`/matrix SHA `6cdc4f41…` examined the two added oracle lines and found 0 new static repair defects (0/KLOC for those 2 LOC). The initial MEDIUM remains historical; packet B and full runtime/visual checks are still pending. Felix said his durable report will follow, so this is a provisional message receipt.

ADV046/047 repair from root's independent reviewer messages: Vera identified two acceptance oracle defects in send F1 and outreach F1; Ada found reply-recipient equality gap. Send F1 now waits for real send-review GET 403/404 and visible denial before asserting no approval. Outreach F1 now witnesses browser `valueMissing`/invalid form, then observes no POST for a bounded 500ms window. Reply F1 compares To exactly with the synthetic seed sender `sender@acceptance.test` before save and after reload. These source repairs are NOT_RUN and await exact reviewer re-review; the initial findings remain historical. Ada also confirmed visual viewport zoom is distinct from text zoom and seed roles do not prove twelve real staff enrollments; the record keeps those limits.
