# r11 validation packet (PREPARED — awaiting parent inspection and coordinator reservation)

Date: 2026-10-12. No fleet-02 reservation held; no Docker touched; r10 evidence preserved
untouched. This packet is the exact reservation request material.

## Archive

- Local directory: `Elevateo Mail - FE Validation 20261012-r11/` (context.tar.gz,
  context.tar.gz.sha256, manifest.sha256; 58 files).
- Archive SHA-256: `0eedf661729e5c8a853ed6f5d5717bb02dc4af4476e0598dbf2b2c4258b0a350`.
- Normalized manifest delta vs r10: EXACTLY the four reviewed repair files, no other changes:

| file | r11 SHA-256 | review |
| --- | --- | --- |
| apps/web/src/styles/index.css (147 LOC) | `5d00d5ae76e61e55525a120580d572df2865bab710ade2053cf44b167fa151a3` | product+design PASS, 0 defects |
| apps/web/src/ui/Async.tsx (45 LOC) | `d6252d68e4b94ad22766e792a9cdf882391ccf22374478a91279110b08e47f5c` | product+design PASS, 0 defects |
| apps/web/src/features/thread/ThreadPage.tsx (198 LOC) | `e529eca8a77e34bc735ec707fe9da7900ff2731a48c03b9b57995c5c8a9715df` | product+design PASS, 0 defects |
| apps/web/e2e/visual-states.spec.ts (350 LOC) | `1c8f1f3ddd67b98f9b97b92ad498e7a43586d27156f0ba4bc0dda2eac876771a` | test review P2 fixed; final 57-LOC re-reviews PASS, 0 defects |

## Runner (frozen rev 5, byte-identical — no changes proposed)

| file | SHA-256 |
| --- | --- |
| run-fleet-02.sh | `dcaa2bc92d76c26a896f9737ba7c099a65da2c077b2ec018e488b60effbcc597` |
| make-snapshot.sh | `3337873ba662be88c00fc0c7db1de6c8cd943b7878ef3aad255869c876c54c64` |
| validation.Dockerfile | `73861610a354eb5a9198f3ecb89f9978935ba0d5312ad74879bafeec5b80193b` |
| probes.sh | `21f672750b078e1cf950d637cc3dea159b0fbcc164ce79294eea3f5e175d2952` |

## Execution plan on reservation (same staging pattern as r10)

SCP runner files + archive to a fresh `r11-fe01/` under the fleet-02 evidence root; verify all
hashes remotely; run probes in a disposable `--network none` container with read-only bind and
tmpfs, capturing the true docker exit with the full log preserved; then
`bash run-fleet-02.sh context.tar.gz results-fe01r11`; copy logs + e2e-results home; attest
cleanup with per-command exits and preserved inventories; release the reservation.

## Acceptance (to be observed, not assumed)

- Unit: 209 tests / 14 files PASS (unchanged bytes outside the four files).
- Browser: **163 passed / 0 failed / 50 expected skips** (160 prior + the new in-spec contrast
  oracle regression once per project ×3) and **112/112 visual PNGs**.
- The relit captures to inspect: session-loading, session-recovering, inbox-loading,
  reader-loading (light themes) now show skeleton bars (#e4e4e7 on canvas); narrow
  reader-truncated-badges shows wrapped badges inside the viewport.
- Exact cleanup, `cleanup_failed=0`, zero task-named leftovers.

## Scope notes

The oracle P2 is closed statically within the current opaque-hex theme scope (no perceptual
ΔE/WCAG claim); the probe anchors on the first NON-TRANSPARENT (alpha>0) ancestor, which under
current themes is always opaque hex. Reduced-motion limitation recorded: inbox skeleton covered
both themes; reader skeleton and badge geometry skipped there; geometry proves viewport
containment only.
