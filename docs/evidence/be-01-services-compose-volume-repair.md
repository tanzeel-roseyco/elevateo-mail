# BE01 full-services failure and Compose volume repair

Status: failed runtime, independent cleanup verified, fleet reservation RELEASED. Local repair frozen for bounded parent review; no repaired tests or lifecycle rerun executed.

## Actual evidence

Fleet audit: `/home/tanzeel/elevateo-mail-tests-20261012-ultra/be01-services-app-audit-cbc9f6f6-406f-4647-a349-dae6ba413091`.
Parent `be01servicesapp-9a500f14-5ed5-47fe-8d4e-7adc5e2fb4a4.ppXWGu`; child `be01services-d58bdc9c-a288-444c-8383-f11e574666fe.snYsX6`.
Build and baked-source verification PASS. Parent and child each report `test_exit=1 cleanup_failed=0`. Launch SSH=1; wrapper `parent.status` absent, so no independent wrapper-status-file claim. Failure occurred in prepare_stack after private normalized config generation, before service registration/provisioning. No Auth, private Storage or restart/bootstrap acceptance executed.

Boolean-only diagnosis: input_four=true, output_three=true, state_unused=true. Prior predicate diagnostics: services/network/volume names and all nine service profile checks true; volume-set check false. Compose v5.3.1 omits unused fixture-only state. No private environment/config values are included in this packet.

Independent reconciliation SSH=0, inventory=0, source=0. Evidence `independent-final/status`, containers/volumes/networks/images/builders inventories and space.after under audit. Exact parent/child names, task labels, recorded child IDs, builder/cache and immutable app image `sha256:1f76e251a6d10178767beacc937960393ea04266aa839cb1b04127637c277103` absent. Shared builder `8f5fbab3e0e5eca575e9557e4de5f0baf0c9588c7c6f972bcdfe0d94f6902e43`, its state volume, Ruby/BuildKit and all five service bases retained. No further deletion was needed. Source/package checks passed against deployed original bytes. Private evidence retained. Available bytes before272800686080, after272849780736, raw shared-host delta+49094656; not attributable reclaimed space.

Local sanitized evidence: `C:/Users/Tanzeel/AppData/Local/Temp/be01-services-final-reconciliation.log` and `be01-services-base-retention.log`. Earlier locate-only SSH1 was a failed read-only search under /tmp; no test/mutation/retry. It does not change successful final reconciliation.

## Narrow repair and regression

config.jq declares only the three volumes used by Compose; stack.sh requires exactly those three. volumes.sh remains unchanged and independently creates, pins, content-checks and cleans all four task-owned volumes including fixture state. No state mount is added to any product service. Every existing security/profile predicate remains intact.

New stack-regression.sh uses real config.jq and prepare_stack in a fresh Bash process with errexit enabled, mocked Compose normalization and a registration sentinel before daemon access. Nine cases: normalized valid plan, exact old-predicate discrimination, missing config, extra state, foreign data name, nonexternal storage, state mount, privileged API, published port. Tests are Docker-only and NOT_RUN; mocks do not establish actual Compose acceptance.

Core bounded slice: config8 + stack70 + regression52 =130 full-file LOC. Coupling slice: dispatch38 + existing app regression82 =120 full-file LOC, only three package-pin substitutions. Manifest changes17 lines total. Functional delta: two existing lines replaced, one explanatory comment added,52 new regression lines; app pin delta three lines. Parent-run.sh unchanged. Canonical52, fixtures, dependencies, product and previous tools/Lane C packages unchanged.

## Frozen LF execution files

| File | SHA256 | LOC |
|---|---|---:|
| ops/tools/be01-services/config.jq | 356289830fbc3bf2f6ed42f879b7bb797acbb8f10e0c0e82d29373009ed149d6 | 8 |
| ops/tools/be01-services/stack.sh | 0c588a647154660bc230178ded87b0fa7c8c89e34284a09398ac97b32cf79733 | 70 |
| ops/tools/be01-services/stack-regression.sh | e950575321eceb0e8effbfe80e14e6aa04917d016aaa5d01fa40b1305d6c6e4f | 52 |
| ops/tools/be01-services/package.sha256 | b20a69471069c9e8c24d241c327fb1457c55982d175756b3623bd15036e7cbc3 | 14 |
| ops/tools/be01-services-app/dispatch.sh | 3b452c1e20d750487f0c464007739448075acb31d581bf9893c75f3247d63e92 | 38 |
| ops/tools/be01-services-app/regression.sh | 90a7d57d5c53e146155ff31f5437200ebee580e459c4313c52414582b8d308e8 | 82 |
| ops/tools/be01-services-app/package.sha256 | 2da812bb3a95fabdad927a7ed9d5c7fb1e03d4fac0601ca66100c80938f48466 | 3 |

## Next actions and limits

Parent bounded correctness/design review of these bytes precedes staging or execution. Reacquire coordinator lease. Authenticate exact seven-file overlay against old deployed pins and new package manifests; preserve canonical52. Old services-tools844af and appcheckcbc1 packets still bind historical packages and must not be invoked against this changed snapshot unchanged. They retain their historical PASS evidence, not acceptance of this repair.

Next socket-free workload requires reviewed jq-capable tools image/lifecycle wiring: inside constrained Docker, `bash -n /src/ops/tools/be01-services/stack-regression.sh`, `bash /src/ops/tools/be01-services/stack-regression.sh /src`, then existing app coupling regression against updated pins. Ruby base alone lacks jq. No unreviewed acquisition/build runner is supplied or executed here. After this prerequisite and exact cleanup, separately reserve full services using unchanged parent-run.sh with SERVICES_APP_PACKAGE_SHA=2da812bb3a95fabdad927a7ed9d5c7fb1e03d4fac0601ca66100c80938f48466. All other documented bounds/host/context/BuildKit inputs remain unchanged. Real Auth/private Storage/restart-before-reseed and native Windows remain pending; BE02 third-opinion gate remains unresolved. No ultrareviews or paid calls.

## Compose volume repair static closure
Parent reported core130 + coupling137 (including17 manifest lines) =267 unique reviewed LOC, zero confirmed defects,0/KLOC. Dedicated design130 overlaps/nonadditive; Obsidian unavailable, analytical static tradeoff simulation only. All17 manifest entries matched. Historical runtime guard defect remains recorded; static acceptance does not establish runtime acceptance. Nine-case Docker regression and real Auth/private Storage/restart remain pending.
