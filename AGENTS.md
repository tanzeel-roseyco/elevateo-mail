# Project instructions

Read README.md, state.md, documentation.md, and .planning/STANDARDS.md before making changes. Standards remain draft until explicit user approval. Keep work scoped and do not treat candidate technologies as approved choices.

Keep README Current state, state.md, and relevant documentation synchronized in every implementation commit. Use strict typing, boundary validation, deliberate errors, and no secrets. Search AIDEV anchors before editing and preserve/update their intent.

After building the application, use adversarial review agents covering at most 200 lines per review assignment and a dedicated design-tradeoff reviewer. Record coverage, defects, and defect density in code-reviews.md. Delegate formatting to linters. Use the user's full review rubric from the originating conversation for review assignments.

Run application tests inside Docker and validate the actual UI before publishing. Clean only task-owned disposable Docker resources after use; preserve persistent data. Project completion deletion requires explicit user request and the user's full GitHub verification, local-data audit, and confirmation process.
