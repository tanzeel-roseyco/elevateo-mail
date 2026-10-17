# BE01 real-service acceptance fixture freeze

Status: authored, not reviewed or executed. FE released fleet-02 after r10; PERF acknowledged; no backend reservation exists. This packet adds verification under accepted B01-03 through B01-07 in `.planning/consultations/results/be-01/decisions.md`. Product, Compose, previous runners and canonical source bytes remain unchanged. No ultrareview, paid consultation or Devin session was launched.

## Existing coverage and remaining cases

Existing `ops/tests/db-fixtures.sql` and `apps/server/test/be_01_r1/` exercise authority, membership, tenancy and migration rollback with synthetic UUIDs. R3b passed those database suites; Lane C passed actual Compose namespaces; Lane P passed Linux pwsh 9/48/0. These results do not prove real Auth identities or Storage persistence. The new fixtures reuse the repaired Tenancy and authority guard rather than duplicate them.

| Case | New oracle | Limit |
| --- | --- | --- |
| Auth provisioning | Admin API creates two distinct users; admin reads retain exact IDs/email | No SQL writes into Auth tables |
| Real token | Password grant and authenticated `/user` agree with provisioned identity | Not BE02 browser session/refresh/revocation |
| Signup denial | HTTP 422 and `signup_disabled` | One configured local policy |
| Invite/recovery | Fresh recipient-matched Mailpit message with local verify URL, correct type and nonempty token | Capture only; no callback navigation or external mail |
| Private Storage | Private bucket, exact upload/download bytes using service role | Fixture-only privileged adapter |
| Direct denial | No token, anon token, real user JWT and public URL denied, after positive existence control | Accepted masked 400/404 as well as 401/403; no 5xx accepted |
| Application authorization | API-role RLS resolves mailbox locator for real owner; same-org outsider denied; HTTP after transaction closes | No product attachment endpoint added |
| Repeat seed | Existing completed seed becomes observation; partial seed fails closed | Does not silently recreate lost data |
| Persistence | Exact IDs, credentials digest, sorted whole-table row counts/digests and object bytes compared | Requires actual bootstrap/restart phases below |
| Boundary regression | Seven socket-free tests, statically 14 assertions: state, exclusive writes, symlink/mode, locator and HTTP boundaries | Not run; no static type-check claim |

## Files and bounded review slices

All nine new Ruby files are under `ops/tests/be01-services/`. Exact LF SHA256 values are in `package.sha256`; 484 physical lines added, no existing execution lines changed.

| Review slice | Files | Physical LOC |
| --- | --- | ---: |
| Auth/transport | auth.rb, http.rb | 137 |
| Storage authorization | storage.rb, authorized-storage.rb | 104 |
| Persistent state | state.rb, database.rb, credentials.rb | 135 |
| Phase orchestration/regressions | services.rb, boundary_test.rb | 108 |

Parent bounded code and dedicated design reviews remain pending; unique coverage is 484 planned lines, not completed review coverage. Defects/density are unmeasured. Design review should separately inspect each bounded slice, especially privileged HTTP ordering, negative controls, partial seed behavior and persistence observations. No additional implementation-model consultation is introduced.

## Immutable dependencies

Canonical 52-file source manifest stays `03d590ddaa39b22c6b1851c9911405473c0b01b0a50fff08001144e66a14638b`; do not repin local CRLF. Authenticate it plus this separate package before execution. Imported canonical files:

| Source | SHA256 |
| --- | --- |
| apps/server/lib/elevateo/tenancy.rb | 6d38a972fc99f2f873bbc197062dd261eb4fcace3d842125df27c02800180f6c |
| apps/server/test/be_01_r1/authority_guards.rb | e757c6dcdec9984526e35f002cfc4fac884e7a9eb4e5d7a5e91fbaa5d011894c |
| ops/bin/generate-secrets.rb | c622ff9697f02e8d2dac6fda65b782833a3807f2a9dd2b7dd2fc50cb7e3a143f |

Use unchanged digest-pinned `compose.yaml`: postgres 17.6.1.136, Auth v2.196.0, PostgREST v14.17, Storage v1.74.0, Mailpit v1.31.5; existing Ruby 3.4.11/Rails 8.1.4 bundle. Parent must independently inspect immutable images. If rebuilding the disposable app image, use the reviewed dedicated lifecycle and BuildKit `moby/buildkit:buildx-stable-1@sha256:cec9f139f45e93c5c69c60f8b07cfad9f43f4ef6b6a6cd917527fea5ff2e3dea`.

## Execution prerequisites and phase contract

No new executable Docker dispatcher is supplied by this fixture freeze. Before execution, reserve fleet-02 and review a narrow adaptation of the existing validated owned-resource lifecycle. It must authenticate manifests, enforce selected daemon and short hostname `Ubuntu-noble-latest-amd64-base`, verify actual nonroot UID readability, inspect exact ownership/mounts/caps, and retain uncertain resources. Source is read-only at `/repo`; private nonce-owned state volume is `/acceptance`, directory mode 0700 owned by fixture UID. Only credential comparison gets `/credentials/local.env` read-only. Do not dump that volume or environment into evidence.

Use isolated internal networks with private DNS `db`, `auth`, `storage`, `mailpit`; no public ports or external mail. Preserve exact database and Storage volume IDs across phases. Read-only root, nonroot, cap-drop, no-new-privileges, bounded tmpfs, no Docker socket in fixture containers. App/database/builder caps 2CPU/2GiB; small helper caps 0.5CPU/256MiB; ActiveRecord fixture may use 1CPU/512MiB. Bound every daemon call and overall lifecycle. Helpers have internal deadlines (service 150s, database/adapter 60s); wrapper must impose a deadline on all phases including credential checks. Cleanup must preserve initial test status, remove only verified disposable task resources after final observations, and independently inventory exact IDs/names/labels/builders/images plus host free bytes.

Commands below are container payloads, never host Ruby invocations. Run with the existing app bundle working directory `/repo/apps/server` and its locked gems; inspect syntax inside Docker first. Each row is a separate process/container with only its specified secrets; shared state remains private.

| Order | Container payload | Required secrets/network |
| --- | --- | --- |
| 1 | `bundle exec ruby /repo/ops/tests/be01-services/boundary_test.rb` | None; network none |
| 2 | `bundle exec ruby /repo/ops/tests/be01-services/credentials.rb baseline` | Read-only credential file; network none |
| 3 | `bundle exec ruby /repo/ops/tests/be01-services/services.rb seed` | SERVICE_ROLE_KEY, ANON_KEY; Auth/Storage/Mailpit |
| 4 | `bundle exec ruby /repo/ops/tests/be01-services/database.rb seed` | POSTGRES_PASSWORD; database only |
| 5 | `bundle exec ruby /repo/ops/tests/be01-services/authorized-storage.rb` | API_DB_PASSWORD, SERVICE_ROLE_KEY; database/Storage; no admin password |
| 6 | Repeat existing secret generation, bootstrap and migrations against the same task stack | Existing isolated administrator lifecycle |
| 7 | Repeat rows 3–5; run credentials `compare` | Seed paths now observe, never upsert |
| 8 | Stop/start the entire task stack without removing volumes; record pre/post service and volume identities | Reviewed lifecycle only |
| 9 | services `check`, database `compare`, adapter, credentials `compare` | Same separated secrets as above |

Retain individual logs and exit statuses for every row, plus image/network/volume identity evidence and final cleanup. Never run a seed repair between restart and comparison. A service restart must not be substituted for whole-stack restart. Existing migration rollback checks remain necessary and already have R3b evidence; this fixture does not replace them.

## Exact remaining dependencies

`scripts/dev seed` and `check` currently target undefined Compose services, and `apps/server/db/seeds.rb` is absent. These user-facing bootstrap commands remain a BE01 wiring repair/acceptance gap; the explicit fixture phase contract above does not claim they work. A separately reviewed lifecycle adaptation is needed before these fixtures can produce runtime evidence. No existing frozen runner is silently altered.

Following emailed `/auth/v1/verify` through a browser requires callback routing/session transport that belongs to BE02; this packet proves local capture only. Browser login, refresh serialization, logout, org switching and immediate revocation are outside this repair. Native Windows proof, applicable static typing/lint and other foundation acceptance remain separately pending. No whole-BE01 completion claim.

BE02 remains two valid opinions plus failed Fable 5.1; no three-opinion synthesis or implementation. Its frozen 561092-byte common input remains unchanged. No paid calls or Devin launch.

## Primary-source basis

Auth routes and response shapes follow the [pinned Auth OpenAPI](https://raw.githubusercontent.com/supabase/auth/v2.196.0/openapi.yaml); signup rejection follows [pinned signup implementation](https://raw.githubusercontent.com/supabase/auth/v2.196.0/internal/api/signup.go). Storage requests follow [bucket creation](https://raw.githubusercontent.com/supabase/storage/v1.74.0/src/http/routes/bucket/createBucket.ts) and [object retrieval](https://raw.githubusercontent.com/supabase/storage/v1.74.0/src/http/routes/object/getObject.ts). Capture uses [Mailpit API](https://mailpit.axllent.org/docs/api-v1/) and its [pinned messages implementation](https://raw.githubusercontent.com/axllent/mailpit/v1.31.5/server/apiv1/messages.go). Static source research is not compatibility execution evidence.
