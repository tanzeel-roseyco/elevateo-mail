# MAC-814 Maeve checkpoint

Scope: minimal universal Intel/Apple Silicon macOS DMG release template for a future Orion Tauri v2 shell. Source: `apps/orion/macos/release-template.json`, `validate_release_template.py`, `test_validate_release_template.py`, and README. The existing shared React UI is `apps/web`; no native shell exists at baseline bbf2353. No dependency was installed or added; validator uses Python standard library. The callback scheme is a draft assumption requiring Orion/auth owner agreement. There is no new API or change to frozen BE02/BE03 contracts.

Requested Soren QA815 Docker command: `python3 apps/orion/macos/validate_release_template.py apps/orion/macos/release-template.json && python3 -m unittest discover -s apps/orion/macos -p 'test_*.py'`. Expected static cases: valid template; wrong single architecture; credential-like field. Executed: none. No host app test or build. Candidate SHA: recorded in control outbox after commit.

Blockers: Orion Tauri shell integration; macOS runner; pinned toolchain; Apple Developer account and Developer ID; notarization/stapling/Gatekeeper; clean installed app login/logout/secure storage/callback replay/expired session/upgrade tests on Intel and Apple Silicon. Linux Docker static validation is not native DMG evidence. No live credentials, SMTP, DNS, Hetzner changes, paid account or signing operation.

Design tradeoff for root: universal binary offers one download and upgrade track but increases package size and requires both architecture slices. Separate architecture DMGs would reduce download size but double distribution and installed-app validation. This template selects universal pending real Mac build and size measurement.

Review: author self-review only, 0 independent review lines and no defect density claim. Request bounded independent source review and dedicated design-tradeoff review from root.
