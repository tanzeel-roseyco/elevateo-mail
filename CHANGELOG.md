# Changelog

All notable changes to Elevateo Mail are recorded here. The format follows Keep a Changelog; versions follow the deployed pilot builds. Detailed gate receipts remain in `state.md` and `docs/completion/`.

## Unreleased

### Added

- `financial planning/`: cost model (`cost-model.csv`), pilot, growth and enterprise-readiness scenarios with live-checked prices dated 2026-10-18.
- `docs/production-readiness-plan.md`: 141 numbered readiness items with verdicts, owners, effort, a risk-ordered pilot plan and the backend task list.
- `SECURITY.md`: private reporting process, response targets and tester rules.
- `.github/workflows/ci.yml`: web lint, typecheck, OpenAPI contract checks and Vitest; server RuboCop lint and Steep; gitleaks secret scan.
- `.github/dependabot.yml`: monthly grouped updates for npm, Bundler, Cargo, Docker and GitHub Actions.
- `.gitleaks.toml`: secret-scanning configuration with allowlists for vendored upstream samples and example env files.
- `docs/runbooks/`: stolen-laptop, incident-response (with key-rotation schedule, erasure procedure and postmortem template) and disaster-recovery runbooks.
- `docs/large-files.md`: tracked files over 1,000 lines and what to do with them.

## 2026-10-17 Resend-first scope

- Self-hosted mailserver deployment deferred; Resend selected for the immediate launch (`docs/completion/`, `state.md`).

## 2026-10-16 Attachments and session hardening

- Private attachment storage, ClamAV scanning, session hardening, draft attachments and editable viewport (`eabb741a`, `1a3951b7`, `e94109e0`).
