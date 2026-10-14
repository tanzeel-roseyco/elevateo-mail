# MAC-814 Maeve checkpoint

Scope: minimal universal Intel/Apple Silicon macOS DMG release template for a future Orion Tauri v2 shell. Source: `apps/orion/macos/release-template.json`, `validate_release_template.py`, `test_validate_release_template.py`, and README. The existing shared React UI is `apps/web`; no native shell exists at baseline bbf2353. No dependency was installed or added; validator uses Python standard library. The callback scheme is a draft assumption requiring Orion/auth owner agreement. There is no new API or change to frozen BE02/BE03 contracts.

Requested Soren QA815 Docker command: `python3 apps/orion/macos/validate_release_template.py apps/orion/macos/release-template.json && python3 -m unittest discover -s apps/orion/macos -p 'test_*.py'`. Expected static cases: valid template; wrong single architecture; credential-like field. Executed: none. No host app test or build. Candidate SHA: recorded in control outbox after commit.

Blockers: Orion Tauri shell integration; macOS runner; pinned toolchain; Apple Developer account and Developer ID; notarization/stapling/Gatekeeper; clean installed app login/logout/secure storage/callback replay/expired session/upgrade tests on Intel and Apple Silicon. Linux Docker static validation is not native DMG evidence. No live credentials, SMTP, DNS, Hetzner changes, paid account or signing operation.

Design tradeoff for root: universal binary offers one download and upgrade track but increases package size and requires both architecture slices. Separate architecture DMGs would reduce download size but double distribution and installed-app validation. This template selects universal pending real Mac build and size measurement.

Review: author self-review only, 0 independent review lines and no defect density claim. Request bounded independent source review and dedicated design-tradeoff review from root.

## Continuation: actual Orion overlay

Imported Orion's exact NATIVE-812 commit `d13c985476d32103c1bc131224771be4847d7ee0` as ancestor `f0298df` to bind the MAC-814 work to `apps/native`. Mac platform override is `apps/native/src-tauri/tauri.macos.conf.json`; empty entitlements avoids adding unproven rights. `apps/native/macos-release.sh` preflights macOS, signing/notarization inputs, installed identity, universal Rust targets and a reviewed Cargo.lock before building. It uses the shared web build, Tauri universal DMG build, stapler/Gatekeeper checks and checksum. This has not run. The former `apps/orion/macos` packet is historical; `apps/native` is now the integration seam.

Threat model/regressions: a malicious remote page must not navigate into privileged app context; base CSP and empty local capability remain fail closed, while an offline static validator checks their presence. A forged or replayed auth callback has no handler, so the current app cannot accept one. Future auth must bind state/nonce and PKCE verifier to one pending login, verify exact redirect origin, consume once, store tokens outside the renderer and purge on logout. A second installed-app upgrade check must prove secure storage state and callback registration do not leak across versions. These are design requirements, not performed tests. Static test cases cover valid overlay, remote connection relaxation and unapproved callback registration.

Soren-only Docker request: `python3 apps/native/validate_macos_config.py apps/native/src-tauri && python3 -m unittest discover -s apps/native -p 'test_validate_macos_config.py'`; also retain the earlier `apps/orion/macos` check for historical template consistency if integrating it. No application or host tests were executed by Maeve.
