Superseding checkpoint: all484 fixture code LOC and179 overlapping design LOC now PASS0 statically. The separate adapter is authored and frozen for review in be-01-services-adapter.md; runtime remains pending and FE r11 owns fleet-02. The proposed module names and pending-review wording below describe the earlier plan, not the current implementation. Seed/check wrapper wiring remains planned.

# BE01 service acceptance lifecycle and wiring plan

Planning only; no execution bytes changed. FE r11 exclusively reserves fleet-02. Explicit coordinator release, backend reservation and review precede remote mutation. Frozen fixture package remains `028c90c20b356ffaa8c4ba285524d4835dd8513685c096aa41acaa12b22a476d`.

## 1. Review checkpoint

Parent reports Auth/transport 137 LOC, Storage 104 LOC, orchestration/tests 108 LOC: each PASS, zero confirmed defects. Completed unique code coverage is 349/484 LOC, 0 defects/KLOC on that reviewed subset. Persistent-state 135 LOC remains pending. Dedicated design inspected 179 overlapping LOC, PASS zero defects, 0/KLOC; do not add it to unique coverage. Runtime remains unproven.

Design constraints: fresh password grants demonstrate current credential usability, not survival of a previously issued session. Frozen fixtures do not retain old tokens. Old-session survival remains a separate evidence gap, not a PASS inferred from this lane. Every post-restart database invocation must be `compare`, never `baseline` or `seed`. Missing state must fail before any provisioning or migration can repair it.

## 2. Narrow lifecycle adapter

Proposed separate files under `ops/tools/be01-services/`: `parent-run.sh` (authentication/build dispatch), `stack.sh` (registered create/start/stop), `profile.jq` (exact persistent mount/profile validation), `phases.sh` (fixed phase sequence), `cleanup.sh` (owned resources), `regression.sh` (failure paths), `compose.override.yaml` and `package.sha256`. Keep each executable module below 200 physical LOC; split tests by invariant if necessary. These files are proposed, not authored or reviewed by this packet.

Reuse validated Buildx inventory/recovery patterns from `ops/tools/lane-c-synthetic/cleanup.sh` and bounded daemon/source guards from `ops/tools/lane-c-app/parent-run.sh`. Leave those modules and their manifests unchanged. Do not invoke the old Lane C driver as a persistence runner: `ops/tests/fleet02-egress-compose.sh` explicitly rejects named volumes, and its override uses ephemeral data. A separate exact mount allowlist is required, not a relaxed Lane C predicate.

Authenticate the new package externally before entry; verify canonical 52-file manifest and all inherited module hashes before creating resources, then again on exit. Reject wrong host/context, Docker environment overrides, absent pinned images, unexpected image-declared volumes, source unreadability or resource collisions. No runtime pulls. Use existing immutable Ruby/app/BuildKit provenance; build only a nonce-labelled disposable app image if needed. Builder/app/database capped at 2CPU/2GiB; service/helper caps follow the existing accepted profiles. Every daemon call and overall lifecycle gets a timeout with a separately bounded cleanup window.

Register exact names before creation, then exact IDs and expected profiles before starting. External nonce-owned internal network and explicit nonce-owned volumes: database data, database config, Storage bytes, fixture state. No default project names or anonymous volumes. Fixture state directory is 0700 under the actual nonroot fixture UID, files 0600. Configuration/secrets are private task data; logs contain no credentials, message bodies or token-bearing URLs. Credential comparison gets a read-only mount; admin/API/service-key processes receive only their required variables. Preserve database image-required writable mounts rather than imposing an untested global read-only profile on service images.

## 3. Fixed phase sequence and observations

1. Socket-free Docker syntax/boundary checks, authenticated source readability, inventory and host free bytes. Create private task credentials once, then `credentials.rb baseline` once.
2. Start database; bootstrap roles; migrate; start Auth, PostgREST, Storage, Mailpit, API and worker with bounded readiness. Record exact images, container/network/volume identities.
3. `services.rb seed`, `database.rb seed`, `authorized-storage.rb`. These establish fixture state and baseline once. Record each exit separately.
4. Repeat secret generation, bootstrap and migration on the same stack; run services `check`, database `compare`, authorized Storage and credentials `compare`. Also exercise repeated seed once before restart to prove it becomes observation, then compare again. Any failure stops subsequent test phases.
5. Stop all seven long-lived services, verify each exact container stopped and volumes retained, then start the same containers. Do not run bootstrap, migrations, seed or baseline between this stop and the first comparisons.
6. Run services `check`, database `compare`, authorized Storage and credentials `compare`. Record all phase statuses and exact before/after volume identities. Auth check obtains a NEW token: record that limitation explicitly.
7. Always run exact cleanup, preserving first test failure separately from cleanup failure; independently inventory task IDs/names/labels/builders/cache/images and host free bytes. Shared images, other tasks and persistent user data remain untouched.

Cleanup inspects exact ownership and expected mounts before removal; uncertain resources are retained and reported. Remove only this lane's explicitly disposable nonce-owned volumes after all consumers are verified absent and content/layout ownership checks succeed. Do not delete a retained uncertain container's image or volume. Do not use broad prune, `down -v`, name-prefix-only deletion or unsupported Buildx inspect formatting.

## 4. Seed/check wiring repair

Both `scripts/dev` and `scripts/dev.ps1` currently dispatch undefined `seed`/`check` services. Do not add one omnibus container inheriting every secret. Proposed repair is an explicit, identical sequence in both wrappers, backed by a separate `ops/compose.acceptance.yaml` tools overlay: service seed/check helper, administrator database seed/compare helper, restricted authorization helper, credential comparison helper. Each helper runs the frozen fixture bytes with a separately selected command and minimal secrets. A private named acceptance-state volume belongs to the local stack; normal stop must preserve it. Helper services are opt-in and never start with ordinary application `up`.

`seed` dispatches initial service seed then database seed, authorization and comparisons; an existing complete state must remain unchanged, and partial state fails without automatic healing. `check` dispatches only read/compare modes and refuses absent baseline. Wrapper exit propagation must stop on the first failed helper in Bash and PowerShell. Do not expose arbitrary fixture modes from untrusted input. Initial credential baseline creation belongs to first seed only; repeat seed compares it. Real local developer data must never be selected by the fleet adapter: its project, credentials and all volumes are nonce-specific.

This later wiring patch will require explicit overlays and dependent manifest changes for any frozen source paths it changes. Preserve canonical LF source manifest; never repin CRLF checkout bytes. Native Windows wrapper proof remains separate from Linux pwsh. No BE02 browser sessions, refresh, callback routes or attachment endpoints are introduced.

## 5. Required regression and review slices

Before runtime: review each new module at <=200 LOC plus bounded design slices. Socket-free Docker regression must prove authentication failure creates no resources; wrong owner/mount/caps retains resources; all daemon operations use selected context/deadlines; dependency containers are registered before batch create; partial create/start and timeout preserve status and clean only verified resources. Phase regression must forbid baseline/seed/bootstrap/migrate after restart and forbid continuing after failed compare. Wiring regression must prove helper secret separation, missing-state failure, repeated-seed preservation and Bash/PowerShell error propagation.

The existing 484-line fixture package remains frozen pending its final review. This plan does not expand reviewed coverage or assert runtime compatibility. BE02 remains two valid opinions and a failed third; no synthesis, paid calls, Devin or ultrareviews.
