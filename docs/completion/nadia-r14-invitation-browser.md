# Nadia OFF406 / INV406 R14 invitation fixture and runner

Source-only candidate, exact base `86036e276df9c3294206e6bfa14d478c223c54dd`, new branch `feat/nadia-r14-invitation-fixture`, isolated clone `nadia-r14-invitation-browser`. GitHub issue 15. Runtime, authored tests, lint, strict typing, actual GUI and independent reviews: **NOT_RUN**. This is an implementation handoff, not BE02 acceptance. No production/application source changed; BE03 remains closed and observer OFF. Requested Sol 6.1 LOW/Fast/YOLO execution identity and billing are not attested.

The supplied current BE02 accepted decisions and implementation brief govern this fixture. The historical standalone consultation-brief path referenced by the gate record is absent from this frozen tree; the accepted synthesis, gate disposition, implementation brief and current INT-401 mandate were read. Existing source anchors and seed/publication/privacy/cleanup conventions were inspected before edits. No paid consultation or runner was launched.

## Design and private boundaries

The original `acceptance_seed.rb` still creates/validates exactly nine identities and publishes its complete seed before returning zero. The runner validates its private files before creating a separate `acceptance-invitation` service, inherited from the existing seed service. This runs before each browser lane. A newly generated recipient and unaccepted Auth identity are linked exclusively to the already seeded primary organization/mailbox through the fixture admin role, authorization-generation lock and real membership triggers. Only read access is granted; the existing primary conversation remains available. No whole `Be02Fixture`, hardcoded `api:3000` redirect or unrelated organization fixture is reused.

The fixture uses internal Auth `/invite` issuance with a short-lived privileged JWT that never crosses into the browser. Bounded, proxy-free, redirect-free, retry-free Mailpit requests poll at most 50 messages for the exact dedicated recipient; detail recipients must also match. The one delivered link must have exact `http://app.test` authority without userinfo/fragment, `/auth/accept`, exactly one `token`, `type=invite` and fixed `redirect_to=http://app.test/auth/complete`. Its 64-hex token must match the dedicated unconfirmed Auth row, with `invited_at` present and no Auth/application session, before any scope grant. Existing Rails routes and Auth URL/redirect configuration supply these values; no TLS profile is invented. Provider/parser/SQL failures are never stringified by the fixture entrypoint.

The unchanged private contract is `acceptance-private/acceptance-invitation.json`, mounted readonly at `/run/secrets/acceptance-invitation.json`:

```text
{version:1, link:string, password:string, actor_id:UUID, organization_id:UUID, mailbox_id:UUID}
```

The file is mode0600 in the canonical owner/group mode0700 output mount. Reads use nofollow/nonblock and bounded regular-file checks. Publication writes a mode0600 exclusive temporary file, flushes/fsyncs, then hardlinks complete bytes exclusively to the final name and removes the temporary. This avoids exposing partially written files or replacing an existing credential. Ordinary failures remove owned temporary/published files. Final runner cleanup handles the exact final/tmp two-link pair after interrupted publication, while rejecting outside hardlinks, symlinks, wrong owners/modes and active consumers. No private link/password or invitation-file hash is emitted in public seed/evidence/logs/screenshots.

Before the next lane, the prior invitation receipt is checked against the same primary scope and excluded from the original seed actors. Its sole organization membership is removed under the generation lock, cascading the mailbox membership through real triggers; old invitation sessions lose access. Auth rows and pending/session records belong to final disposable stack teardown, not hand-edited restoration. Each lane uses a new invitation identity; scanner/victim/replay browser contexts share only that case's identity. The initial nine-actor contract and its public hashes are not rewritten. Failure invalidates the disposable dataset; never continue with a partial fixture.

Strict RBS boundaries and a separate strict Steep target cover the new Ruby fixture, transport and private I/O. Shared producer code and the canonical application checker are unchanged. New Ruby unit regressions cover private publication, malformed provenance, seed-before-Auth ordering, scope grants, token/row mismatch, permissions/symlinks and collision cleanup. Python runner regressions cover missing seed, fixture failure/missing output, exact private deletion, interrupted hardlink publication and active/outside consumers. Service policy regression includes the new service. All are authored NOT_RUN; synthetic doubles prove unit boundaries only, not actual Auth/Mailpit behavior.

## Pairing, selection and Soren-only commands

Root must integrate the exact Mira INV405 sibling `a5c57be9134ac6c05d8a824b4a0e04424124eb90` from the same base. It owns the loader, `auth-invite.e2e.ts`, removal of only SCN-AUTH-006-P's unavailable registration and diagnostics source allowlist. No overlapping path is edited here. The generated contract matches that loader by source inspection. Without that sibling, this branch retains the old unavailable case and cannot establish browser completion.

Soren runs these commands only inside the already authorized disposable fleet Docker allocation, using its exact frozen source mounts and existing server/Python images. Ruby working directory `/workspace/apps/server`:

```sh
bundle exec ruby /workspace/ops/tests/be02/acceptance_invitation_test.rb
bundle exec ruby /workspace/ops/tests/be02/acceptance_invitation_fixture_test.rb
bundle exec steep check --steepfile=/workspace/ops/tests/be02/Steepfile.invitation
bundle exec rubocop --lint --format simple /workspace/ops/tests/be02/acceptance_invitation.rb /workspace/ops/tests/be02/acceptance_invitation_io.rb /workspace/ops/tests/be02/acceptance_invitation_transport.rb /workspace/ops/tests/be02/acceptance_invitation_test.rb /workspace/ops/tests/be02/acceptance_invitation_fixture_test.rb
```

Python working directory `/workspace/ops/tests/be02`, recorded nonroot UID/GID:

```sh
python3 -m unittest test_invitation_runtime test_acceptance_policy test_gui_order test_finalization
```

Canonical full Playwright selection, orchestrated by Soren on fleet with root's exact merged source/dispatch/context/host:

```sh
python3 ops/tests/be02/run.py --context APPROVED_CONTEXT --expect-host EXACT_FLEET_HOST --acceptance --acceptance-lanes playwright --acceptance-browsers chromium,firefox,webkit --acceptance-dispatch-id ROOT_DISPATCH
```

Do not supply `--acceptance-diagnostic` for invitation completion. The unchanged diagnostic corefour grep/labels intentionally exclude SCN-AUTH-006-P. Full Playwright `*.e2e.ts` discovery includes the paired genuine invitation case, and unchanged full-evidence validation requires it. Full-suite unavailable cases remain failures/incomplete evidence; this bridge does not convert them into passing acceptance.

For an explicit invitation inventory/run in the runner-owned fresh invitation/browser container (working directory `/opt/acceptance`), Soren can use the following canonical browser commands. The selected run is bounded scenario evidence only, never full acceptance PASS; use a fresh disposable dataset/output before each selected or full rerun:

```sh
node node_modules/@playwright/test/cli.js test --config=playwright/playwright.config.ts --output=/tmp/playwright-native --grep '(^|\s)SCN-AUTH-006-P(\s|$)' --list
node node_modules/@playwright/test/cli.js test --config=playwright/playwright.config.ts --output=/tmp/playwright-native --grep '(^|\s)SCN-AUTH-006-P(\s|$)'
```

The runner's GUI completion and base configuration restoration remain before actual HTTP tests/worker drains. No accepted HTTP/backend suites are rewritten. Fixture stdout/stderr are not attached publicly; service logging remains disabled. A selected browser run must retain the existing quiet reporter/no trace/no video/no screenshots policy and exact owned cleanup.

## Known gaps and review handoff

Actual Auth response/template token shape, new Compose service inheritance/mount attestation, Mailpit delivery, password-policy compatibility, strict typing/lint, permissions in the pinned containers, scanner nonconsumption, genuine UI acceptance/replay, lane retirement and interrupted cleanup still need Soren execution. Current transient DB startup investigation belongs to root/Soren; frozen R16/R17 evidence was not mutated. Browser retry requires a fresh identity, not replaying a consumed private link. Root owns acceptance, integration, review assignments and the actual vault; this worker changes neither vault nor project mirror.

Shared reports contain bounded line-numbered review packets, changed-path blob/mode/byte/SHA256 receipts, exact protected-source identities and a source bundle with this base as sole prerequisite. Every packet is <=200 lines except the dedicated design assignment, clearly divided into <=200-line components and <=400 total. Source and dedicated design review remain PENDING; defects/KLOC are unassessed, not zero. Author assessment covered the current full INT-401 rubric: purpose/boundaries, empty/malformed/max inputs, cross-lane state, permission/lifecycle effects, small module responsibilities, provider-I/O bounds, happy/failure oracles and truthful documentation. Formatting remains for Soren's linter.
