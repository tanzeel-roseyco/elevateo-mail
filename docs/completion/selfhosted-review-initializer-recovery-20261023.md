# Initializer recovery bounded source review — 2026-10-23

Dispatch: `ctx_d951fad02991`; task: `task_2a78c2cb9318`. Source-only adversarial review; no tests, production access, secret access, nested workers or source edits. Read AGENTS.md, .planning/STANDARDS.md, documentation.md context, README/state current context and initializer README. Formatting checks remain delegated to tooling.

## Exact coverage

Physical lines include blanks/comments. Packet A: 115 lines; packet B: 116 lines; total **231 unique lines**, within both per-packet 200 and worker 400 limits. No imported implementation or test bodies inspected.

| Packet | File under ops/production/initialize | Range | SHA-256 |
| --- | --- | --- | --- |
| A | rehearsal.py | 1–91 | 5958000f05ca05131f6792774867591bc06c2219f39a7227a7857b9de7b302ac |
| A | prepare-runner.sh | 1–24 | 99ed3b46ea76369f60b376fef4f86899bb60afbeeeb53f358c829e4b9451df85 |
| B | fleet-rehearsal.sh | 1–111 | 831855c9af192c23a1a85cf48a4a7eeab242d8823b2ea59f552979917c99b18a |
| B | quality.sh | 1–5 | 9b0111481d32568d71a14b6b8a5cf9b97c3fae24ac7f1143382d8243637a7aad |

## Actionable finding

**P2 — quality.sh:5 uses nonexistent shell-script paths.** The repository is mounted at `/source`, and the working directory is `/source/ops/production/initialize`. Python commands correctly use working-directory-relative paths, but `bash -n` and ShellCheck use `/source/fleet-rehearsal.sh`, `/source/prepare-runner.sh`, `/source/quality.sh`. The reviewed files actually live beneath `/source/ops/production/initialize`. Consequently `bash -n` fails and `-e` aborts before ShellCheck and offline admission tests. Use relative script names from the declared working directory or their complete correct absolute paths; rerun the exact gate in fleet Docker. Finding sent immediately to coordinator and implementation owner `ctx_f5eab65ab665`; repair/rereview pending.

**Confirmed defects: 1; density: 4.33 defects/KLOC (1 / 231 × 1000).** Packet A: 0/115 = 0/KLOC; packet B: 1/116 = 8.62/KLOC. These counts apply only to inspected source.

## Checklist and evidence limits

- Purpose/state correctness: real pinned Auth and Storage service images start against a pinned Supabase PostgreSQL image; both health endpoints must respond before seeding. This is appropriate source wiring for actual service migrations, not proof that the image contents or migrations succeed. Imported initializer/bootstrap/migration bodies were outside scope.
- Populated restore: five whole-row Auth/Storage sentinels are required, compared before/after restore and forward initialization; source is independently checked afterward. The initial app schema must be absent, so this proves no preservation of pre-existing application tenant data. Storage bytes are directly constructed filesystem fixtures, not API-uploaded or API-retrieved objects; documentation explicitly states that limit. No actual production-data restore claim is supported.
- Happy/failure paths: forward asserts exact nonempty migration versions, tenant replay, conflicting-role/missing-Auth rejection, one organization/receipt, owner role and four forced-RLS owned tables. Exception handling is intentional negative-path assertion. Tests and downstream transaction behavior were not inspected; runtime coverage remains unverified.
- Boundaries/security: SQL strings in this packet interpolate fixed synthetic constants rather than external request input. Runner IDs require strict sha256 syntax. DB roles/passwords are disposable and network-local; service URLs name isolated aliases or invalid domains. No production network, host ports, production credentials, live SMTP or Docker socket mount appears in the rehearsal. Runner/tool preparation and quality dependency installation deliberately use bridge networking; this is distinct from the two internal DB networks.
- Shared-host cleanup: shared fleet lock, exact-name preflight, task labels, explicit mount inspection, exact container/network deletion and absence checks avoid broad pruning. DB storage uses tmpfs; source mounts are read-only. Tool preparation creates a committed runner image and retains it for use, and host backup/content artifacts persist; the caller must account for and remove task-owned disposable resources after required evidence retention. Image metadata/anonymous-volume behavior and actual independent absence cannot be verified from these files alone.
- Pin/source binding: PostgreSQL/Auth/Storage/quality image IDs are fixed; combined runner is supplied as immutable ID. Source is mounted read-only and the forward result prints source_digest(ROOT), but no expected coordinator-approved digest is compared in this shell script. Acceptance must bind the recorded digest and actual runner ID to the independently reviewed source; image provenance and imported digest implementation are outside scope. Tool installation package resolution is not locked, so retain the resulting immutable runner identity.
- Design/maintainability: small assertion functions and shared SQL/container helpers avoid excessive abstraction. Comments explain row hashing and isolation decisions. No hot production query loop or unrelated feature expansion appears; bounded readiness polling is operationally appropriate. No extra abstraction recommendation is needed.
- Null/empty/max behavior: sentinel count and migration nonempty checks prevent empty recovery passing; timeout/readiness bounds exist. Missing CLI action fails loudly rather than producing PASS. This harness accepts no general user payload; general input validation belongs to uninspected initializer/admission code.
- Documentation: initializer README distinguishes synthetic data, direct filesystem fixture, held production apply and real restore acceptance. README/state also retain pending full initialization/restore gates. No runtime PASS, production release authority or whole-project review is established here.

## Closing source rereview

Final hash check detected the owner's five-line quality.sh repair. Reread only those same assigned lines: SHA-256 `2f840af50354ee2c3bba71cf8f02532f51a2c33a8e1912fc8371f78925668232` now uses working-directory-relative script names for both bash and ShellCheck. The P2 is **closed statically**, with runtime rerun pending; the other three source hashes remain unchanged. Unique physical coverage stays 231 lines; cumulative findings remain one/4.33 KLOC, with zero unresolved confirmed findings on the final reviewed source.

Verdict: **no unresolved confirmed source defect in scope; recovery and repaired quality execution remain NOT_RUN by this reviewer**. No central state/code-reviews update or commit was made, per assigned ownership.
