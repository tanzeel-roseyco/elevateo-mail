# REV894 Android manifest-tree parser review

Reviewed exact Astrid commit `82df7b0fab5227ff56ab0c84d2bcd849580afc6f` against its parent in `completion-astrid-apk813`. Actual reviewer runtime identity: Theo, Orca task `task_4b8157dc92e8` / dispatch `ctx_cbedafa789e9`, Codex `gpt-6-sol` per active worker projection; billed tier unverified. Static review only: no Python tests, APK build, aapt invocation, Docker, credentials, or live operations by Theo.

## Evidence and exact read coverage

The two changed files have **31 changed LOC** (25 additions, 6 removals), **1 confirmed P2 defect**, **32.26 defects/KLOC changed**. Current commit source read: `apps/android/verify_manifest_tree.py:1–40` (blob `ce5460f80c7a25367e3fda2b68119a10274ab9a0`, 40 LOC) and `apps/android/test_verify_manifest_tree.py:1–60` (blob `6b2135fcf3b794c4597c5c05209a403188c86b15`, 60 LOC). Parent parser `verify_manifest_tree.py:1–20` was read (20 versioned LOC). Additional `rg` navigation snippets outside those files: `apps/android/README.md:30` (1), `test_verify_permissions.py` lines 5, 9, 12–14, 21–22, 26, 28–30, 34, 36, 38, 40–41, 57, 66, 69 (19), and `verify_permissions.py` lines 1, 9, 18, 21, 23, 31, 33, 39, 43, 46, 51 (11). Thus **151 unique versioned source LOC** were exposed, all reads under 180 and the total below 350. The retained runtime text `android-32d043fbce8e-aapt-dump.txt` was read at lines 1–47 and 73–88 (63 nonversioned lines); combined read exposure **214 LOC**, below the task cap. Navigation snippets are not an independent review of the permission scripts.

Retained aapt dump SHA-256 was verified as `a354109de14f9d9e7b9fc71a07ab047b904403a0fa0a13d60042950ecbc500e8`. Its first namespace line, two-space manifest and four-space application match the repair. The dump identifies Debian aapt `v0.2-debian`; pinned Build Tools 36 behavior remains unproven. The reviewed parser's successful exit/nonempty stderr rejection, empty/usage/flat-tree denial and unconditional VIEW substring rejection remain in place. A separate permission verifier exists, but its policy implementation was not reviewed here and no claim of permission-policy regression coverage is made.

## Finding sent immediately to Astrid and root

**P2, `apps/android/verify_manifest_tree.py:12–14`: independent regex matches do not prove application is inside manifest.** For example, this zero-exit, empty-stderr output passes the current function:

```text
N: android=http://schemas.android.com/apk/res/android
  E: manifest (line=2)
  E: unrelated (line=3)
    E: application (line=4)
```

The application is a child of the unrelated two-space sibling, not the manifest. The added `test_rejects_flat_or_unrelated_tree` covers a same-indent application but not this malformed nesting. Require the four-space application to occur while the two-space manifest remains the active parent, rejecting intervening two-space siblings; add this exact regression. This concerns parser acceptance of malformed tool output, not an observed defect in the retained APK.

## Design tradeoff and remaining rubric

Pinning exact namespace plus two/four-space element markers is a small, readable match for the observed Debian output and rejects the old column-zero assumption. It couples the verifier to aapt's textual indentation, so confirming pinned Build Tools 36 output is necessary. A tiny indentation-state check for the manifest subtree would close the found gap with less complexity than a general XML parser, while retaining fail-closed behavior for unknown layouts; if the pinned tool differs, adapt only from a retained exact receipt. The implementation adds no app state, permissions, or hot-path work. Names/comments are clear, and tests include success, VIEW denial, tool failure, empty, diagnostic and flat cases but miss the sibling-nesting failure above. The parser does not validate the separate allowed-permissions list, signing, installed behavior or live app route; those remain independent gates. Soren fleet Docker rerun and manual artifact inspection are pending, and this source review is not APK acceptance.
