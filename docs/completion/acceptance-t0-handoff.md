# T0 authored handoff — 2026-10-13

Task `task_ae64416d83c3`, dispatch `ctx_d4527f5537cf`, terminal `term_168f3658-993c-419e-8c97-ebc038154c29`. Requested execution identity: GPT-6-Astra LOW; actual author is this dispatched Codex worker. This worker cannot independently attest provider model/effort metadata; coordinator must retain the dispatch's actual runtime identity rather than infer it from the requested label.

T0 shared boundary is authored in the assigned paths only. No package manager, test, Docker, SSH, agent, commit, send, purchase or activation was executed by this worker. Runtime checks, dependency resolution, compilation, lint, all regressions and integration are **NOT_RUN**. This is source handoff, not independent review or runtime acceptance. Root owns lock generation, image digests, browser dependencies, proxy/seeds/secrets, review dispatch, fleet execution and final sealing.

Exact APIs: `shared/config.ts` exports `loadAcceptanceConfig(): AcceptanceConfig`, `loadSeedContract(): SeedContract` and both types; `shared/report.ts` exports `recordCase(result: CaseResult): Promise<void>` and the type. `shared/schema.ts` exports the semantic schemas/types for T4. See `tests/acceptance/README.md` for all field names, required env, optional bounded limits, seed sample, package scripts, Docker compile commands and single-writer immutable-directory prerequisites.

Required env: `ACCEPTANCE_BASE_URL`, `ACCEPTANCE_LANE`, `ACCEPTANCE_PROFILE`, `ACCEPTANCE_RUN_ID`, `ACCEPTANCE_DISPATCH_ID`, `ACCEPTANCE_SEED_PATH`, `ACCEPTANCE_OUTPUT_DIR`. Integrated origin is exactly `http://app.test`; backend-only may use `http://api:3000`; TLS is `https://app.test` with normal verification. Root precreates a canonical private output directory and its `cases` subdirectory. No output default or mock webServer. Native and fixture profiles remain distinct.

Seed sample: `tests/acceptance/shared/seed-contract.json` includes all nine aliases, two scopes, expected capabilities/versions, deterministic data IDs and markers. `kind: example` cannot be loaded as runtime; root creates `kind: runtime` with actual generated UUIDs after its supported admin/invite seed path. Browser login remains Mailpit link to actual UI acceptance. No credential/session injection.

Records use `<scenario>.<lane>.<attempt>` identity, an exact failed predecessor for retry, and synced temporary-file plus exclusive hard-link publication. No append race or overwrite of first failure. One lane process serializes writes and enforces record count/size; root enforces OS resources/artifact quota and final artifact identity. One scenario path/lane outcome per run is deliberate; framework samples/browser evidence belong in that path's assertions/partition, or separate immutable runs. T4 owns expected-case completeness and final manifest semantics.

Review checklist: input strictness and portable paths; origin/profile isolation; runtime seed mapping and authorization assumptions; atomic publication/error handling/retry causality; schema parity and incomplete outcomes; root-owned resource/sealing boundaries. Assign one file per review slice below (all under 200 lines). Dedicated design reviewer should inspect config+report only (combined under 200 lines), covering single-writer contract, per-path outcome granularity and hard-link durability versus JSONL append. No subagents were spawned because this dispatch prohibits them. Defect counts/density are NOT_ASSESSED, not zero; root records real independent findings in its ledger.

Design tradeoff reasoning: if two same-path attempts publish concurrently, stable names plus exclusive links preserve the first publication; the one-writer prerequisite makes resource accounting deterministic. A crash before link leaves only an incomplete pending file; a crash after link retains the first complete record for root reconciliation. Private local filesystem prerequisites avoid pretending this is a distributed event store. These are analytical cases, not measured simulations; no Obsidian connection was used under this bounded dispatch.

Next root commands in pinned Docker only: generate/review lock with `npm install --package-lock-only --ignore-scripts`; freeze archive; `npm ci --ignore-scripts`; `npm run typecheck`; `npm run build`; `npm test`. Preserve source fixture JSON alongside dist. Root adds browser dependencies when consumer files arrive and regenerates the lock. Review and actual Docker compilation may reveal fixes; no self-certification is claimed.

## Authored-file inventory

Hashes and line counts below identify this handoff's files, not a source archive freeze. Handoff itself is excluded from recursive self-hashing. Root must rehash after dependent edits.

| File / review slice | LOC | SHA-256 |
| --- | ---: | --- |
| tests/acceptance/package.json : 1-14 | 14 | 92b2ee91c1d542c4c5a0a5071e5788776f7ba4793f2913fc62d879868da37c3a |
| tests/acceptance/tsconfig.json : 1-10 | 10 | f353999e7e1705ead0395b6abd238d009ed71104a6dceec3b01fe5488bd543c5 |
| tests/acceptance/shared/config.ts : 1-63 | 63 | 6f0b56b5f8241e7ae229960389a0365d3ed5df99ddedded9eab4d375822e7776 |
| tests/acceptance/shared/report.ts : 1-55 | 55 | ae9d5fee3b15c686dbea5a498d17503c4ccf0dc019b33ae31b77861e5af63e3f |
| tests/acceptance/shared/schema.ts : 1-98 | 98 | 0bf4eb333305e2d0b3294173ff13a8bcf85bda206220ccae4dba7ee11ea3fa4d |
| tests/acceptance/shared/seed-contract.json : 1-22 | 22 | af92596fee2676183382d39605e0eda1b7264d5eb11372d42f3606f4012f82ac |
| tests/acceptance/contracts/run-manifest.schema.json : 1-67 | 67 | 6d88a548aa7aed4576dbaa12ff5e285b03b1a3952d126279dc4122322b96acb5 |
| tests/acceptance/contracts/case-result.schema.json : 1-42 | 42 | 544194e93a839a690dc5332b26fb4f810344c6a4b4741c4f6248f46f97976542 |
| tests/acceptance/contracts/report-validation.spec.ts : 1-134 | 134 | f12cda821056857a88199e95ce7a365e11779b73c86e64f6e191cf64756c3e52 |
| tests/acceptance/README.md : 1-77 | 77 | 9a63740880658880940e3c1a736a604d42c7c81861926f6b1facef5980a850f2 |
