# Web visual QA

All browser execution used Docker Desktop (`DOCKER_CONTEXT=desktop-linux`), Chromium 156.0.8078.73 (Debian 12), Playwright 1.64.0, and axe-core 4.10.3. The repository Vite fixture server ran only inside the task container. Synthetic gateway routes and identity-provider stubs prevented mail sending or external service use.

## Executed visual checks

`npx playwright test -c qa.playwright.config.ts e2e/design-system.spec.ts --project=desktop-1440 --project=narrow-390 --workers=1 --output=/evidence/browser-final`: **24 passed, 0 failed**, 1.1 minutes. Supplemental finder/send-status action viewport run: **4 passed, 0 failed**, 12.6 seconds. `ELEVATEO_AXE_SCRIPT=/tmp/axe/node_modules/axe-core/axe.min.js` enabled axe on every executed capture.

Both 1440px desktop and 390px mobile captures cover sign-in, inbox, thread, draft editor, send review, send status, outreach, email finder, settings, empty, loading, and error states. The reviewer actually opened both labeled contact sheets and representative full-resolution images, including mobile thread/inbox, desktop sign-in/settings/outreach/error/draft, and mobile finder/send-status action viewports. White surfaces, black text, restrained gold outlines, distinguishable error styling, compact controls, and Elevateo branding match the brief. No document horizontal overflow was detected. OS dark preference still produces the light theme.

[Desktop contact sheet](contact-desktop-1440.png) · [Mobile contact sheet](contact-narrow-390.png). Raw images and axe results are under `browser-final/`; additional scrolled action views are under `browser-actions/`.

There were **zero confirmed axe color-contrast violations** across the 28 primary captures. Axe reported **17 incomplete node occurrences across 12 captures**, caused by overlapping/fixed banners or clipped text (`bgOverlap`, `elmPartiallyObscured`, `elmPartiallyObscuring`); see `axe-summary.json`. Manual image review and rendered foreground/muted/border-versus-surface assertions supplemented these checks. This is not a full WCAG audit. Full-page captures place fixed simulation banners partway down long pages; scrolled mobile viewport captures confirm the finder Start lookup and send-status Cancel before dispatch controls are unobscured. Neither action was activated.

## Retained failed attempts

The initial design suite had 20 passes and 4 failures caused by incorrect test selectors (draft action and archive URL). These were corrected without product changes; the full 24-test rerun passed. The initial fixture suite had **84 passes, 172 skips, 4 failures**: two width variants each of outdated 75ms tag-transition and previous gold focus-outline expectations. Expectations were updated only for the intended static-control and #A67C00 outline design. Production-only cases are skipped because no production URL or credentials were supplied. Browser image pull and shell-quoting failures remain in logs and are not counted as passing tests.

## Final fixture regression

`npx playwright test -c qa.playwright.config.ts --grep-invert corporate --project=desktop-1440 --project=narrow-390 --workers=1 --output=/evidence/fixtures-final`: **88 passed, 172 skipped, 0 failed**, 3.6 minutes; Docker exit **0**. See `fixture-e2e-final.log`. The 172 skipped cases require the production-artifact test URL; no production environment was contacted.

## Final build validation

Within the container-local source copy: `npm run lint`, `npm run typecheck`, `npm run build`, `npm run check:bundle`, then `grep -rl 'dev-fixtures\|Development fixtures\|fixture_token_a' dist` as a negative marker check. All five checks passed; script `GATE_EXIT=0`, Docker `DOCKER_EXIT=0` (see `browser-build-gate.log`). Entry bundle: **186.9 KB / 500 KB budget**. No dependency was added to the product for axe; it was installed only in the disposable browser toolchain.

## Cleanup

Stopped the task-owned `elevateo-white-gold-qa` container after inspecting its bind mounts. Image removal initially raced automatic container removal; after the container disappeared, a retry removed `elevateo-white-gold:chromium` without force. No other containers were stopped and no volumes were pruned. Global build-cache pruning and Docker disk compaction were not attempted while other workers were active. Scoped duplicate evidence deletion was rejected by automatic approval review (`blocked by policy`), so the original artifacts and failure logs remain available.
