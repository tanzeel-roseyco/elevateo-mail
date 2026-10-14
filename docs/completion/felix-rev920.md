# Felix REV920: reply test changes

Independent static review of test-only hunks in Mira `fcfaf0fc8d4d116b0d66dc9f4597ee90bf5c793c` and `3ceafd15fb57b76008dd7df4ffe5d1da6314ec29` at `completion-mira-fe806`. Actual reviewer runtime: Orca Codex `gpt-6-sol` on local host; billed tier unverified. Application and Docker runtime: **NOT_RUN** by Felix. Production source was excluded by assignment and not read.

## Exact coverage

| Version and file | Blob | Read coverage | Unique LOC |
| --- | --- | --- | ---: |
| `fcfaf0fc` `apps/web/src/features/thread/ThreadPage.test.tsx` | `87ea9be0b02b3b8016100001bd55a923d4ec22f2` | all changed hunks (75 added, 4 removed), plus current lines 35–60 and 93–128; overlap counted once | 135 |
| Parent of `fcfaf0fc`, same file | `b4990286ae846a81f1943fbc6fd98c6d728bef59` | 4 removed lines only, included above | — |
| `3ceafd15` `apps/web/src/features/thread/CollaborationPanels.test.tsx` | `0a12408b78002314c144812624c9cd6b1b6ee97e` | all reply test changed hunks (30 added, 9 removed), plus current lines 243–250 and 266–278; overlap counted once | 49 |
| Parent of `3ceafd15`, same file | `25301967737ecbfa6ad7c6fd6a3149fcfd68ed2b` | 9 removed lines only, included above | — |

Total **184 unique versioned source LOC**, below the 190-line cap. Reads were diff hunks (79 and 39 source lines) and selected numbered context (62 and 21 lines), each below 180. The count unions changed current lines with overlapping context and includes removed parent lines. No production, other tests, or unlisted helpers were read. Formatting belongs to linters.

## Finding

**MEDIUM, test oracle gap — explicit save and no-persistence contract is only partly asserted.** `CollaborationPanels.test.tsx` current lines 274–278 assert that `saveDraft` was not called before clicking, success text says version 1, one call occurred, and the fourth argument has thread and recipient. They do not assert the call's expected revision argument. The parent test's direct `getDraft`-before-save absence check was removed (parent changed lines 251–258), so an accidental persistence path other than `saveDraft` could remain invisible to this test. The new test also has no failed-save branch to reject a false success. Fix recommendation: assert the exact revision argument against the gateway contract, check fixture state remains absent before explicit save, and add a rejected-save case that leaves no success indication. This is a test coverage defect, **not proof of a production bug**.

The `ThreadPage.test.tsx` additions use explicit independent sender fixtures for Ada and Ben and assert top reply To/Subject, senderless disabled state, no reply during loading or failed thread read, selected message rather than latest sender, deep-link loading then selected sender, and selected-message denial (`129–197`). The selected deep-link test proves Ben from the direct read before enabling reply. Top reply asserts no `saveDraft` call on opening. These cases support the intended happy and read-failure behavior as written; they were not executed. No confirmed test defect was found in that packet. Null sender is covered; empty or maximum message collections and subject limits are not established by this bounded packet.

One confirmed test-only defect over 184 LOC gives **5.43 defects/KLOC**. Test setup largely reuses `renderReply` and existing providers, and the additions do not introduce observable hot-path loops or broad helpers. Names describe the scenarios. Authorization and external input validation are exercised through the UI tests but cannot be concluded from tests alone; production behavior and documentation accuracy are outside this assignment. Soren fleet React test execution and independent production review remain separate acceptance evidence.
