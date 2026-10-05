# Project instructions

Read README.md, state.md, documentation.md, and .planning/STANDARDS.md before making changes. The frontend standards in .planning/STANDARDS.md were approved on 2026-10-01 and are binding; violations are defects. Read docs/product-master-plan.md, docs/backend-blueprint.md and the proposed .planning/BACKEND-STANDARDS.md for future work. The user authorised autonomous backend foundation work on 5 October and credential-free integration/desktop takeover on 6 October 2026. Unresolved production policy and live activation remain pending; consult .planning/BACKEND-STANDARDS.md for the current boundary. Raw research reports and older planning scenarios do not override the latest requirements.

Keep README "Current state", state.md, and relevant documentation synchronized in every implementation commit. Use strict typing, boundary validation, deliberate errors, and no secrets. Search AIDEV anchors before editing and preserve/update their intent.

Frontend rules worth knowing before editing:
- `src/domain` is pure (no React, no store). Consent, suppression, and send validation live there; the UI must call those functions rather than re-derive them.
- Anything a backend will own goes through `MailroomGateway` (`src/data/ports.ts`).
- Navigation and filter state belongs in the URL.
- Never render message content as HTML. Every simulated action must be labelled as simulated.

After building, use adversarial review agents covering at most 200–400 lines per review assignment and a dedicated design-tradeoff reviewer. Record coverage, defects, and defect density in code-reviews.md. Delegate formatting to linters. Use the user's full review rubric for review assignments.

Run application tests inside Docker (`docker build -t elevateo-mail-check . && docker run --rm elevateo-mail-check`) and validate the actual UI before publishing. Clean only task-owned disposable Docker resources after use; preserve persistent data. Project completion deletion requires explicit user request and the user's full GitHub verification, local-data audit, and confirmation process.
