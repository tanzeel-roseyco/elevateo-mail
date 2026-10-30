# BE-02 opinion reconciliation queue

This is a coordinator evidence queue, not Astra MAX synthesis or implementation approval. Frozen common input remains `b0e80a92d2871b85e0b3fd4b49780f635732a2cc37ef5b5b26031c85d3c2154a`; corrections belong in subsequent decisions, never in already-dispatched inputs.

<!-- AIDEV-NOTE: Preserve dissent and distinguish model assertions from verified pinned-runtime behavior. -->

| Section | Required synthesis disposition |
| --- | --- |
| Current Auth | Reject Fable 5's positive Auth corroboration cache against the no-positive-cache requirement. Online `/user` is not automatically proof of every pinned session-expiry policy. Resolve the actual authoritative current-session predicate with least privilege. |
| Refresh | Both Fable 5 and Opus proposals need scrutiny: post-call CAS cannot prevent two upstream calls already in flight. Define a durable pre-call lease/generation protocol, crash and lost-response reconciliation, logout dominance and bounded recovery without holding a DB transaction over HTTP. Do not claim exactly-once upstream effects under ambiguous transport failure. |
| Read consistency | Specify the snapshot/commit relationship, revocation before stale-context responses and the remaining Auth-to-DB race. Verify compatibility of read-only isolation with current tenancy helpers before accepting Opus's transaction proposal. |
| Invite and recovery | Both opinions flag `/auth/v1/verify` versus direct Auth routing. Verify actual pinned templates, token forms and callback behavior; a model's proposed route is not runtime evidence. Freeze a browser-safe route/schema table before implementation. |
| Native transport | Preserve one domain/session authority while distinguishing same-origin web cookie proof from later Tauri/WebView2/native presenter evidence. No native implementation or acceptance follows from the web design. |
| Draft contract | Resolve operation identity, retention/tombstones, authorization on lookup and save-A/save-B lost-response oracle. Current draft version cannot prove an earlier operation's outcome. Retain canonical JSON expected_version and 409 draft_conflict. |
| Documentation errata | Reliability line15 already agrees on expected_version +409 draft_conflict; review required mailbox_id on detail, stale sanitized-HTML wording versus plaintext, and Auth callback prefix. Coordinator owns canonical contract amendments and generated client synchronization; do not silently edit the frozen contract here. |
| Scope and migrations | Fable's no-migration first-slice claim conflicts with durable session persistence. Sequence bounded slices without dropping membership, thread/message pagination, drafts, assignment, notes, read state or search from full BE-02. |
| Acceptance and dispatch | Real Auth foundation evidence and explicit BE-01 dependency disposition remain required. Native Windows is separate from Linux research/design. No Devin launch until actual MAX synthesis, frozen implementation input and fresh live credit/stop evidence. |

All scenarios above are analytical and untested. Obsidian is unavailable; no simulation execution is claimed. FE retains fleet-02. No Docker, product changes, paid Devin session or ultrareview belongs to this reconciliation step.
