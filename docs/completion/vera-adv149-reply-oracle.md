# ADV149 — top reply regression oracle

Exact snapshot: 20e8c46e5ef3f3fa909dcea3ed83ace61e2f90a8 in completion-mira-fe806. Runtime: NOT_RUN. Source-only independent bounded review; no tests, Docker, implementation edits, or live operations.

Confirmed defects: 0. Defect density: 0 / 174 unique versioned source LOC (0 per 1,000 LOC).

The changed regression statically closes the narrow REV920 evidence gap. Before reply navigation, it proves the reader's mark-read action neither reads nor saves a draft. After navigation it correctly expects one initial getDraft, verifies the mailbox and minted ID, and independently checks fixture storage still reports that draft unavailable. It checks prefilled recipient, subject, and thread link, then explicitly proves saveDraft remains uncalled before the Save draft click. After that click it requires one save and checks context ID, authorization version, same draft identity, mailbox, expected version zero, empty body, recipient, subject, and reply thread binding. This avoids incorrectly treating the legitimate initial GET as an unintended save.

The editor context supports this oracle: a current-session initial GET precedes readiness; stale reads return without presenting results; a new draft's not_available response creates a local version-zero buffer. Saving requires ready state, compose permission, authorization proof, and nonconsumed state, validates content, and sends the captured attempt through the current request callback. The harness delegates draft operations to a real fixture gateway/state rather than replacing them with a tautological mock response.

The test proves the baseline current context and versioned payload, not a context renewal race or backend authorization. It does not claim no other unrelated operations occur. The broad UUID-shaped regex is supplemented by the real fixture save and saved-version assertion; stronger UUID syntax is outside this narrow oracle's purpose. No new production behavior, external input boundary, loops, or abstractions are introduced. Existing permission/error, malformed sender, and max-limit regressions were not rereviewed. Documentation changes were metadata-listed only. Runtime completion and real API integration remain separate gates.

## Exact coverage

CollaborationPanels.test.tsx at current snapshot: 248–309 (62 LOC), 36–67 (32 LOC), plus search-result lines 69 and 83 (2 LOC). Parent replaced line 294 (1 LOC). Test total: 97 unique versioned LOC.

DraftEditorPage.tsx: 163–197 and 208–225 (53 LOC), plus isolated search-result lines 3, 5, 47, 94–97, 111, 129, 148, 151, 158–160, 236, 249, 275, 279, 297, 342, 403, 411, 414, 426 (24 LOC). Editor total: 77 LOC. Overlapping search results counted once.

Assignment total: 174 unique versioned source LOC. Every read below 180 source LOC; hard 200 cap preserved. Failed lookup of nonexistent CollaborationPanels.tsx read zero source LOC. Excluded: ThreadPage implementation, SessionProvider/request internals, draft domain reducer, fixture gateway internals, backend persistence/authorization, and other tests. Closure is static and limited to the explicit-no-save/current-context/versioned-payload proof.
