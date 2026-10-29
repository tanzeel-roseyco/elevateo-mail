# FE-02 C/D dark-theme recovery capture failure — bounded repair report

Dispatch `task_aa45c2d66498` / `ctx_ae8d4dfa1203`. Target: `apps/web` on `review/ultra/frontend-reader`.
Input: root's frozen rerun (archive `585c8799…`, manifest `555a1c08…`): unit 608/608, API generation,
lint, typecheck and build PASS; browser 264 PASS / 3 FAIL / 72 SKIP (339). All three failures are the same
test on the three Chromium projects: `e2e/collaboration.spec.ts` line 224 (dark theme C/D test) expected the
alert "This draft changed elsewhere" but the page showed "Saved version 3".

**Runtime status: NOT_RUN.** Nothing was executed on the host. Root owns the Docker rerun and the screenshot
review; the frozen PASS results are root's and are not re-claimed here.

## 1. Actual cause (not readiness)

`src/dev/fixtureMain.tsx` builds the fixture gateway once per document load:
`createFixtureGateway(scriptFromHash(window.location.hash))` runs at module evaluation, so the
`#/fixtures?saveDraft=draft_conflict` script is honoured only when that URL is the hash of the document
*while it loads*. The failing test had already loaded the entry and navigated five routes by hash changes
inside the same document (the dark route loop). Its following `page.goto(…#/fixtures?saveDraft=draft_conflict)`
was therefore a same-document fragment navigation: no reload, no re-scripting, and the gateway built earlier
(unscripted, with its own live state) kept answering. The save was genuinely accepted and the state advanced
to version 3 — the UI was truthful; the scenario was not in force.

The passing conflict/uncertain/note tests start each test with the scripted URL as the first navigation
(a real load), which is why only the dark test failed, on every project.

## 2. Repair (spec only, plus one anchor comment)

`apps/web/e2e/collaboration.spec.ts`
- New helper `loadScripted(page, script, route)`: `about:blank` → scripted entry URL → route. Leaving the
  document first makes the scripted goto a real load even when the page already shows the entry.
- The three existing scripted scenarios (conflict, uncertain, unconfirmed note) use the helper; they were
  correct before and remain first-navigation loads, now explicit about the lifecycle.
- The dark route loop no longer carries the recovery scenario. A new test "dark theme recovery states:
  the conflict and the uncertain attempt, each from a freshly scripted load" does both:
  - conflict from a fresh `saveDraft=draft_conflict` load: asserts the alert, **`Saved version 2` still
    shown and `Saved version 3` absent**, both recovery buttons visible, then `captureEditor` →
    `<project>-cd-dark-draft-conflict.png`;
  - uncertain from a second fresh `saveDraft=temporarily_unavailable` load (the script belongs to the
    document that loaded it): asserts the uncertain alert, no version 3, Retry and Check buttons, then
    `<project>-cd-dark-draft-uncertain.png` (this dark capture did not exist before).
- Header comment states the once-per-document-load rule. Route-ready assertions (`CD_ROUTES`), the
  overflow checks, project-qualified names and the tall-viewport editor captures are unchanged.

`apps/web/src/dev/fixtureMain.tsx`
- AIDEV anchor extended by one sentence: the hash is read once per document load; a same-document hash
  change does not re-script the running gateway. No behaviour change (a reload-on-hash-change in the dev
  entry would be a source change without a product defect behind it; the spec is the right place).

No other source, test, fixture, contract or backend file changed. All prior uncommitted work is preserved;
nothing was committed.

## 3. Files (SHA-256 of final content, LOC)

| File | SHA-256 | LOC | Changed |
| --- | --- | --- | --- |
| `apps/web/e2e/collaboration.spec.ts` | `ce3dfc681eb04fcee6fc4886ead61156db90bedd27745023f940491d1c6c5a7d` | 254 | +27 net: helper (11), header (2), three call-site rewrites (−3 each), new dark recovery test (26) replacing the 9-line tail of the dark loop |
| `apps/web/src/dev/fixtureMain.tsx` | `9800ad02c91f8d5fe1b5b073d11cce1dbdd223526a6a8fc7f05421bc4700053d` | 34 | +1 comment line |
| `docs/completion/fe02-dark-recovery-repair.md` | this file | | |

## 4. Capture inventory after this repair (per project: desktop, narrow-390, reduced-motion)

`<project>-cd-{drafts, draft-saved, draft-conflict, draft-uncertain, draft-uncertain-lookup, reader-collaboration,
members, search-refused, narrow-{drafts,draft-editor,reader,members,search}, dark-{drafts,draft-editor,reader,
members,search}, dark-draft-conflict, dark-draft-uncertain}.png` under `apps/web/e2e/.results/`.

## 5. Limits

- Static authorship only; the expectation is that the three failures clear because the scripted gateway is now
  the one answering, but that is for root's rerun to show.
- `about:blank` then two gotos costs one extra load per scripted scenario; negligible against the suite.
- `session.spec.ts` also uses scripted hashes, always as a test's first navigation; it passed and was left alone.
