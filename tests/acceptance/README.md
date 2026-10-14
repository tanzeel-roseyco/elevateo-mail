# Shared acceptance harness v1

Current state: T0 source authored; dependency lock, compilation, regression execution, adversarial review and integration are **NOT_RUN**. Root owns fleet Docker execution and sealing. No runtime seed or authenticated session is supplied here.

## Consumer API

```ts
import { loadAcceptanceConfig, loadSeedContract } from '../shared/config.js';
import type { AcceptanceConfig, SeedContract } from '../shared/config.js';
import { recordCase } from '../shared/report.js';
import type { CaseResult } from '../shared/report.js';
```

`loadAcceptanceConfig(): AcceptanceConfig` and `loadSeedContract(): SeedContract` are synchronous validated boundaries. `recordCase(result: CaseResult): Promise<void>` also validates its input at runtime; await it and propagate failures. Type assertions are not validation. Exported `caseResultSchema` and `seedSchema` in `shared/schema.ts` let T4 validate unknown records. Unknown properties fail closed. Errors from invalid config/seed/case input omit rejected values.

## Configuration

All required variables must be present; there is no filesystem output default.

| Environment | Meaning |
| --- | --- |
| `ACCEPTANCE_BASE_URL` | Exact `http://app.test` for integrated private HTTP; `https://app.test` only for TLS; BE-only `http://api:3000` only for unit/database/real_auth_api. No slash, port normalization, query, fragment or userinfo. |
| `ACCEPTANCE_LANE` | `unit`, `database`, `real_auth_api`, `playwright_real`, `playwright_mock`, `puppeteer_cdp`, `selenium`, `native_platform` |
| `ACCEPTANCE_PROFILE` | `fixture`, `internal_http`, `tls`, `native`; native only with native lane, fixture browser only with mock lane. |
| `ACCEPTANCE_RUN_ID` | 1–80 ASCII letters/digits/underscore/hyphen, first character alphanumeric. |
| `ACCEPTANCE_DISPATCH_ID` | Same bounds; preserve actual dispatch identity. |
| `ACCEPTANCE_SEED_PATH` | Absolute runtime seed JSON path, regular file, at most 64 KiB. |
| `ACCEPTANCE_OUTPUT_DIR` | Absolute pre-existing canonical task-owned directory, no symlink ancestors. Root also precreates its `cases` subdirectory. |

Config properties are `baseURL`, `lane`, `profile`, `runId`, `dispatchId`, `seedPath`, `outputDir`, `limits`. Optional positive-integer environment bounds:

| Environment | Default | Maximum | `limits` property |
| --- | ---: | ---: | --- |
| `ACCEPTANCE_MAX_ARTIFACT_BYTES` | 262144000 | 536870912 | artifactBytes |
| `ACCEPTANCE_MAX_RECORDS` | 5000 | 10000 | records |
| `ACCEPTANCE_MAX_RECORD_BYTES` | 262144 | 1048576 | recordBytes |
| `ACCEPTANCE_TIMEOUT_MS` | 120000 | 3600000 | timeoutMs |
| `ACCEPTANCE_MEMORY_MIB` | 3072 | 4096 | memoryMiB |
| `ACCEPTANCE_CPUS` | 2 | 2 | cpus |

`limits.workers` is fixed at 1. These are ceilings, not resource reservations or measurements. Root enforces cgroups, timeout, aggregate artifact quota and allocation; collectors enforce artifactBytes while collecting. The record writer enforces count and per-record bytes. No automatic inflation. No arbitrary secret-bearing configuration map is exposed.

Root must provide a fresh private local directory per run/dispatch/lane, writable only by the one lane process and root. Keep config/environment fixed for that process. No untrusted concurrent writer, network filesystem, mutable parent/symlink substitution or multiple writer processes: lexical validation cannot secure a concurrently hostile filesystem. Ordinary file hard links and fsync must be supported. No existing run directory is reused for a different run or dispatch. Root snapshots/seals the directory after all writes settle; OS write permissions are not WORM guarantees.

Use the external baseURL in browser runners. Never launch a mock `webServer` for a real lane. Runtime public egress, live sends and published ports are prohibited. TLS must use trusted certificates and normal verification; never `ignoreHTTPSErrors`. `native` records require actual target-platform evidence. Backend-only api:3000 evidence does not establish integrated browser acceptance.

## Seed and login

`shared/seed-contract.json` is a complete **example**, rejected by `loadSeedContract()` because its kind is `example`. Root copies this shape to a private runtime file with `kind: "runtime"`, replaces all actor `user_id` fields with the actual generated Auth UUIDs and records the actual expected versions. Keep deterministic org/mailbox/thread/draft IDs and marker/ordering values where the fixture permits them; if changed, all consumers read the runtime values. Schema v1 is strict with no optional extension bag.

Nine aliases are manager_primary, manager_backup, reader, composer, approver, disabled, revoked, no_membership and other_org. Emails use synthetic `.test` domains only. Two organization/mailbox keys (`primary`, `other`) and data keys (`thread_primary`, `thread_other`, `draft_primary`, `draft_other`, `draft_version`, `ordered_at`, `marker`) define the minimal shared dataset. Primary draft ownership belongs to composer; other draft/thread belong to the other mailbox. Root seed implementation must establish and verify those relationships. `ordered_at` is the primary fixture ordering timestamp; consumers must not infer additional data or pagination coverage from this minimal seed.

Capabilities are expected effective fixture capabilities: managers manage/read/compose/approve_send, reader read, composer read/compose, approver read/compose/approve_send, other_org read only in the other mailbox, disabled/revoked/no_membership none. Every explicit BE02 mailbox membership permits read. `manage` is the seed alias for the API's `manage_members`. Disabled/revoked retain logical scope for negative tests. Disabled means a real Auth ban and login 401; revoked means removed private-mailbox membership, retained organization membership and login 200 with mailbox access denied; no_membership has login 404. These outcomes require real UI/API verification.

`authorization_version` is a 43-character opaque base64url HMAC, computed with BE02's existing SessionPresentation/SessionCrypto, the actual persisted authorization generation and the same ephemeral session key as Rails. It is null for disabled/no_membership because neither can enter an app session. The example's all-A values illustrate shape only. `membership_generation` is always null: BE02 has no separate per-membership generation contract. The internal authorization generation is not a wire version. The fixture checks add/remove/readd/remove generation advancement for revoked without creating sessions. Root must compare the initial expected HMAC to an actual UI-established session privately before membership mutation; later scenarios use the live session version after refreshing context, never the stale seed version. Constants or shape validation prove no runtime behavior. All identifiers/emails are distinct. No passwords, JWTs, cookies, bearer credentials or storageState fit this shape.

Root uses the pinned v2.196.0 local Auth `POST /admin/users` API with random passwords and email confirmation for these nine synthetic `.test` users. Browser runners sign in through the actual password UI; no invite link, login response, token or browser session is captured by the seed. The private credential file is a separate strict `{schema_version: 1, passwords: {<nine aliases>: <password>}}` object. BE02's `ops/tests/be02/acceptance_seed.rb` writes `/acceptance/acceptance-credentials.json` and `/acceptance/seed.json` exclusively with mode 0600 after committed database read-back; root mounts the former read-only at `/run/secrets/acceptance-credentials.json` and gives the latter to `ACCEPTANCE_SEED_PATH`. The other mailbox's draft belongs to other_org and remains historical after its compose grant is removed. No application session is manufactured. Invitation acceptance remains a separate unexecuted scenario. Seed JSON validation proves only shape; backend assertions must prove identities, grants and durable data. Never log private credentials or capture sensitive login trace phases.

## Records and consolidation

Each record contains version/run/dispatch/lane/profile; SCN-family-###-P/F1/F2 path; named partition; framework test ID and relative source file; implementation_mode (`real`, `mock`, `simulated`); attempt identity; UTC millisecond timestamps, elapsed duration; status; bounded reason/authority/assertion/evidence text; relative artifacts. Use `not_run`, `blocked` or `skipped` with a reason when no assertion can run, never a synthetic pass. Passing records require assertions. Free text must be sanitized by the caller; schema validation cannot prove absence of secrets.

Attempt 0 has ID `<scenario_path_id>.<lane>.0`, `retry_of: null`. Retry 1 has suffix `.1` and links to the immediately preceding failed record. Maximum attempt is 20. Subsequent start cannot precede predecessor end. This intentionally provides one outcome per scenario path per lane per attempt; put sample/browser details in partition/framework_test_id and aggregate assertions within that path. Separate engine executions use separate immutable run directories. A whole-run retry uses a fresh directory and root retains the predecessor run in its evidence ledger.

`cases/<attempt_id>.json` is atomically published with an exclusive hard link after a private temporary file is synced. Existing records are never overwritten, including a previous failed attempt. Failure to publish rejects the Promise. A process crash may leave `.pending-*`; root treats these as incomplete, does not ingest them as outcomes, and removes only task-owned leftovers after reconciliation. T4 assembles JSONL if desired; the writer intentionally avoids concurrent append corruption.

Artifact paths are portable ASCII relative paths: no traversal, absolute/drive/UNC paths, backslashes, encoded escapes, ADS colons, empty/dot segments, trailing dots/spaces or Windows device basenames. Root T4 validates actual artifact existence, symlinks, byte quotas, hashes, secret scans, expected scenario coverage, source drift and cross-lane consistency before sealing. T0 does not open arbitrary artifacts. Missing expected scenarios are T4's responsibility. Structural JSON schemas accompany the semantic Zod boundary; run-manifest semantic validation belongs to T4, including time/order/profile/source/guard consistency. Planned environment versions never become observed facts automatically.

## Dependencies and Docker-only commands

- `zod 4.6.5`: strict runtime input validation and shared inferred consumer types.
- `typescript 5.9.3`: strict NodeNext compilation.
- `@types/node 24.19.2`: Node filesystem/test APIs; runtime remains pinned Node 24.21.0.

Only T0 dependencies are declared. Root adds exact browser bindings when their real consumers land: Playwright 1.64.0, puppeteer-core 25.13.0 (CfT 155.0.8059.39), selenium-webdriver 4.49.0 and types 4.35.7 (deliberate Grid 4.49.0-20260909 / Chrome+driver 153.0.8010.47 tuple). No lock or integrity is invented.

In the root-owned pinned Docker build environment, from `tests/acceptance`, root first generates/reviews `package-lock.json` with `npm install --package-lock-only --ignore-scripts`. Subsequent frozen builds use `npm ci --ignore-scripts`, then `npm run typecheck`, `npm run build`, `npm test`. Build emits `dist`; retain source `shared/seed-contract.json` for regression fixtures. Runtime tests use `node:test` and no network. Never execute these commands on the host. T0 does not provide a Docker/SSH wrapper or scheduler.

No lint command is invented without a configured linter; root must apply its actual configured static checks and bounded independent reviews. Current compilation, tests, lint, browser, native and integration results are all NOT_RUN.

QA-404 wave seed contract is now strict schema_version2 with fixture identity, variant resources and exact complete mailbox membership sets. The real Auth credential object remains schema_version1. Base, multi_mailbox and literal_read producers require fresh real Auth data and verify committed rows on a new repeatable-read readonly connection. shared-diagnostic identifies the smoke batch; advanced fixture claims require fresh per-case datasets. Root-authorized --acceptance-diagnostic selects exactly four real Chromium cases and emits DIAGNOSTIC_COMPLETED, never full acceptance PASSED. Canonical Docker recipes/profile must exist and match admission hashes before any browser run.
