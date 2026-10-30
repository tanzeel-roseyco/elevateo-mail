# Integrated acceptance seed handoff

Source authoring is complete; syntax, lint, typecheck, unit, database, Auth, browser and integration execution are **NOT_RUN**. Root alone runs Docker checks on fleet-02. This worker ran no host app tests, installs, builds, Docker, SSH, commits, live sends or browser login. No runtime accounts, credentials, seed JSON or sessions were produced during authoring.

The fixture creates nine real synthetic `@acceptance.test` Auth accounts, seeds app data through existing tables/triggers, verifies committed relationships, then writes private runtime files. It fails instead of substituting invented roles, flags, generations or sessions. `acceptance_seed.rb` owns database preparation/read-back; `acceptance_seed_support.rb` owns bounded Auth requests, environment validation and exclusive output. Existing production source is unchanged.

The coordinator explicitly extended the original three-file ownership to five acceptance contract files in **Elevateo Mail - Local Completion**, confirmed in `msg_8aa5f1457717`. The final shape delta was sent in `msg_eb7d7b6eb0b1`. This is contract reconciliation with accepted BE02 behavior, not a production authorization change. Actual worker execution is Codex GPT-6-Astra at max effort in the reused dispatched terminal; no new model launch or independent review is claimed.

| Actor | Effective mailbox capabilities | Expected real login and scope |
| --- | --- | --- |
| manager_primary, manager_backup | read, compose, approve_send, manage | 200; primary organization/private mailbox |
| reader | read | 200; primary organization/private mailbox |
| composer | read, compose | 200; primary organization/private mailbox |
| approver | read, compose, approve_send | 200; primary organization/private mailbox |
| disabled | none | Auth-banned; app login 401, no app session |
| revoked | none | Organization retained; login 200, primary mailbox denied with 404 |
| no_membership | none | Auth identity exists; app login 404, no app session |
| other_org | read | 200; other organization/private mailbox only |

Every explicit mailbox membership confers read. Seed `manage` maps to the existing `manage_members` column/API capability. Disabled is an actual Auth `ban_duration`, not a nonexistent membership flag. Revoked is added/removed/readded/removed through real membership DML; the persisted authorization generation must advance by four. The fixture retains no mailbox membership for revoked/disabled and no organization membership for no_membership.

T0 `authorization_version` is a required nullable 43-character base64url HMAC. It is null only for disabled/no_membership. For the other seven actors, the fixture calls existing `SessionPresentation.version`/`SessionCrypto` with the real Auth UUID, organization UUID, persisted integer authorization generation and the same ephemeral session key used by Rails. `membership_generation` is required null because BE02 has no separate such contract. Example all-A HMAC strings are shape examples only; the runtime fixture replaces them. Compare initial versions privately against UI-established sessions before mutations; afterward refresh live session context instead of reusing seed versions.

The strict T1 credential object is `{schema_version: 1, passwords: {<exact nine aliases>: <password>}}`. Each password has 192 random bits from `SecureRandom`, 53 ASCII characters and no shared constant password. `/acceptance/acceptance-credentials.json` contains passwords only; `/acceptance/seed.json` has strict T0 shape, `kind: runtime`, real Auth UUIDs and no credentials. Both use exclusive creation, no-follow, mode 0600, flush/fsync and owner checks; the manifest is written last. Consumers must wait for successful process exit, not merely file existence.

The database transaction inserts two organizations/private mailboxes, one thread/message per mailbox, deterministic marker/order values, actor-private drafts, unassigned thread rows, known notes and manager_backup's read state. Primary draft belongs to composer. Other draft belongs to other_org: compose is temporarily granted, the draft inserted, then compose removed; generation must advance by two. Its stored draft must be hidden by runtime RLS. Message plaintext includes literal `<b>` text. Absent primary read-state rows remain the existing unread/version-zero behavior. No pagination, max-size, recovery, invitation or fault-injection dataset is claimed.

Auth HTTP calls finish before app database transactions begin. Read-back occurs after the app transaction commits and checks every supplied row field, exact actor memberships/capabilities, confirmed email identity, password presence, expected Auth ban state and absence of Auth/app sessions. There is no direct write to Auth tables, browser cookie injection, `/token` call, token/login capture or new product endpoint. Auth creation cannot be rolled back with the app transaction: every failure requires discarding this exact disposable fixture and starting fresh, never retrying against partial data.

The pinned primary source defines `POST /admin/users` under admin middleware and accepts `email`, `password`, `email_confirm` and `ban_duration`; successful creation returns HTTP 200 user JSON. See [v2.196.0 API routing](https://raw.githubusercontent.com/supabase/auth/v2.196.0/internal/api/api.go) and [v2.196.0 adminUserCreate](https://raw.githubusercontent.com/supabase/auth/v2.196.0/internal/api/admin.go). This supported admin path creates confirmed password users without invitation delivery; invitation acceptance remains a separate scenario. A short-lived service-role JWT exists only in fixture memory for this request. Requests reject redirects, non-200/non-JSON responses and bodies over 64 KiB; environment proxies and automatic retries are disabled.

Dependencies are existing Ruby 3.4.11, Bundler 2.6.9, Rails 8.1.4 app sources, locked `pg 1.7.0`, locked `json 3.0.2` and Ruby platform libraries (`net/http`, OpenSSL, SecureRandom, URI, Base64, Digest). No new dependency or lockfile was added. Auth must use `supabase/gotrue:v2.196.0@sha256:c0c25187a6b835e65a6f6e6c6b39d090e832d40e6de5186f2c038e0411944232`; PostgreSQL must use the existing `17.6.1.136@sha256:f371b5f3f2ac0a05703f33d6e6134515fb2498cab708fb948a0aeb7481467c00` image. Root freezes the exact server image plus all current app migrations/helpers before execution.

Root owns the integrated compose override and secret/mount preparation. Start fresh task-owned PostgreSQL/Auth, complete bootstrap and all current migrations, and keep API consumers/browser runners stopped until seeding exits 0. Root must configure the same-origin app at `http://app.test`, Rails local HTTP cookies, Auth site URL `http://app.test` and callback allowlist `http://app.test/auth/complete`. Use the existing isolated Docker network with `db:5432`/`auth:9999`, no public egress or published host ports, held outbound mail and internal Mailpit only.

| Fixture environment | Required value/ownership |
| --- | --- |
| ELEVATEO_MODE / ELEVATEO_OUTBOUND_HOLD | `local` / `true` |
| ELEVATEO_BROWSER_ORIGIN | Exactly `http://app.test` |
| ELEVATEO_AUTH_URL | Exactly `http://auth:9999` |
| BE02_ADMIN_DATABASE_URL | `postgres://supabase_admin:<URI-encoded ephemeral password>@db:5432/postgres`; no query/fragment |
| BE02_FIXTURE_SIGNING_SECRET | At least 32 bytes; same disposable HS256 key as Auth, never a live signing key |
| ELEVATEO_SESSION_KEY_BASE64 | Strict base64 of 32 ephemeral bytes; exactly the key used by Rails |

The admin database URL and fixture signing secret are fixture-only credentials; do not pass them to Rails API/browser runners. Auth itself receives its required disposable signing secret. Root's existing ignored private env file supplies secret values without printing them or putting literal values in command arguments. Connection timeout is 3 seconds, SQL statement timeout 10 seconds, lock timeout 5 seconds, Auth read/write timeout 10 seconds. Root must impose a 180-second whole-fixture deadline and remove only its exact fixture container on timeout; individual read timeouts do not bound a continuously trickling response.

Use the existing `ops/compose.be02-test.yaml` fixture service with this root-owned override, preserving its read-only source mounts, resource limits, init process, dropped capabilities and private network. `BE02_ACCEPTANCE_OUTPUT` names a fresh root-prepared Linux directory owned by uid/gid 10001, mode 0700, initially empty with no symlink ancestors or concurrent writer. `BE02_ACCEPTANCE_CONTRACT` names the frozen JSON file listed below; mount the exact bytes read-only. Missing binds must fail instead of creating host directories.

```yaml
services:
  fixture:
    user: "10001:10001"
    environment:
      ELEVATEO_MODE: local
      ELEVATEO_OUTBOUND_HOLD: "true"
      ELEVATEO_BROWSER_ORIGIN: http://app.test
      ELEVATEO_AUTH_URL: http://auth:9999
      ELEVATEO_SESSION_KEY_BASE64: ${ELEVATEO_SESSION_KEY_BASE64:?}
    volumes:
      - type: bind
        source: ${BE02_ACCEPTANCE_OUTPUT:?}
        target: /acceptance
        bind: {create_host_path: false}
      - type: bind
        source: ${BE02_ACCEPTANCE_CONTRACT:?}
        target: /acceptance-contract/seed-contract.json
        read_only: true
        bind: {create_host_path: false}
    command: [bundle, exec, ruby, /workspace/ops/tests/be02/acceptance_seed.rb]
```

The exact fixture container command is `bundle exec ruby /workspace/ops/tests/be02/acceptance_seed.rb`, with working directory `/workspace/apps/server`. Root runs the following only inside its fleet-02 task workflow, after readiness/migration and under its container deadline/cleanup supervision. `BE02_SOURCE` is the frozen backend tree; `BE02_ENV_FILE`, `BE02_ACCEPTANCE_OVERRIDE` and `BE02_PROJECT` are root's private env file, reviewed override file and reserved task namespace.

```sh
docker compose --env-file "$BE02_ENV_FILE" \
  -f "$BE02_SOURCE/ops/compose.be02-test.yaml" -f "$BE02_ACCEPTANCE_OVERRIDE" \
  -p "$BE02_PROJECT" --profile tools run --rm --no-deps -T fixture
```

Exit 0 emits only `acceptance_seed=ready actors=9`; assertion failures emit fixed nonsecret reason codes, other exceptions emit a fixed failure message. After success, root privately validates seed JSON through T0 `loadSeedContract` and credentials through T1 `parseCredentials`. Browser runners mount only the credential file read-only at `/run/secrets/acceptance-credentials.json` and seed JSON read-only at the absolute `ACCEPTANCE_SEED_PATH`. Keep mode 0600: consumers must run as uid 10001 or another explicitly controlled identity that can read those files; do not relax permissions. Keep report/output directories separate. Preserve bytes/modes when moving artifacts and exclude credentials, env files, login traces, tokens and storageState from ordinary evidence exports.

Root's pending verification is explicit:

- Run Ruby syntax/static checks and acceptance TypeScript build/typecheck plus the amended contract regressions in the pinned Docker images. New regressions cover real capability combinations, HMAC bounds/type/null semantics and rejection of invented membership generations.
- Seed a pristine DB/output mount, validate both strict JSON boundaries privately, check all nine Auth UUIDs and durable relationships independently, and verify file ownership/mode and absence of secrets in logs/artifacts.
- Login through the real UI for all nine actors. Check disabled 401, no_membership 404, revoked login 200 with no accessible primary mailbox, cross-organization denial, exact effective capabilities, private-draft visibility, marker text, read state, notes and assignments. No admin-created browser session can satisfy this gate.
- Compare initial HMACs to real session-time metadata privately; mutate memberships under the existing backend protocol, refresh context and prove versions change. Verify removed/readded membership invalidation independently; the seed's trigger assertions are not a browser concurrency proof.
- Exercise wrong signing/session keys, unavailable Auth, malformed/oversized responses, wrong contract hash, invalid output permissions/symlinks, duplicate/reused fixtures and an interrupted publish in disposable root-owned fixtures. Expect nonzero exit and no consumption of partial output; verify exact cleanup ownership.
- Adapt currently unavailable empty-mailbox/actor-private-draft browser cases to the real revoked/composer relationships if useful. Invitation acceptance, broader datasets, native/TLS gates and root's source freeze/reviews remain separate; do not relabel NOT_RUN as passed.

Standards conformance from static inspection: small modules, no new production API, no added dependency, existing schema/roles reused, bound SQL values, explicit fixture boundary validation, deliberate errors and comments explaining cross-file/security assumptions. Formatting belongs to the configured linter. Runtime conformance, regression execution and independent adversarial review remain NOT_RUN. No project state/README or other worker source was edited beyond the coordinator-approved seed notes.

Hashes below cover final authored source bytes; physical line counts include blanks. `B` is `C:/Users/Tanzeel/Code and projects/Elevateo Mail - BE02 Codex`; `C` is `C:/Users/Tanzeel/Code and projects/Elevateo Mail - Local Completion`. Root must preserve or reconcile these exact bytes in its frozen archive. The support file pins the JSON hash, so newline/content drift fails before Auth mutation.

| File | Lines | SHA-256 |
| --- | ---: | --- |
| B/ops/tests/be02/acceptance_seed.rb | 181 | `d11cc2e713ad7f3bdc60722198606645139419a22d7a2c88ec574bed59a774a3` |
| B/ops/tests/be02/acceptance_seed_support.rb | 131 | `1766348f4a8217d721ded4d92a6164a6d6dfc471f4849514107043580c018851` |
| C/tests/acceptance/shared/schema.ts | 101 | `78599d8a46244720d6302583b9c26a07e198a684121fa3d6e4a998bbdbfc32ee` |
| C/tests/acceptance/shared/seed-contract.json | 22 | `221d49259f52f2dcc9944a3af7744327cc2cbc1a3030fa4d13ae85b292e6a952` |
| C/tests/acceptance/contracts/report-validation.spec.ts | 158 | `7d1451a35eeb8eac25f1be467edb2c4d6fc04f27cfd41d6d85713a9cae66ddf8` |
| C/tests/acceptance/playwright/support.ts | 59 | `dbcb23f1dcd6a0ea587ab4f0f8a31bf8701a98722c4f18710b10bfb38acfb3c4` |
| C/tests/acceptance/README.md | 79 | `d8e7a7cec4e7e67973f166a94f191adefc4e902b731d67b6aa3bbcfc5d66fef9` |
| C/tests/acceptance/playwright/boundaries.ts (read-only T1 reference) | 43 | `9ed6af050c697b3083c23d4df3239d81bbe6a2c37c3247e6efb34b35f5747766` |

The handoff file's own hash/line count is emitted separately through Orca to avoid a self-referential hash. No durable runtime report exists yet. Root retains ownership of resource reservation, actual browser/UI validation, sanitized evidence sealing and removal of only the exact task-owned disposable containers/data after reconciliation.
