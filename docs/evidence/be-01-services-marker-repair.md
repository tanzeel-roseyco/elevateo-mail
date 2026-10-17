# BE01 adapter marker-failure repair freeze

Supersedes the execution pin in be-01-services-adapter.md. No Docker, host tests or remote execution. FE reservation/release remains coordinator-controlled; separate reservation and authorization precede execution. Code remains frozen following targeted parent review.

## Completed original review

Original package f2804ee51b5d914d8b2bf2dc8f6e43b5c6121d2c212946eb8b779f297d6fc58b: A143 zero, B135 one P2, C121 zero, D89 zero. Unique488 LOC / one confirmed defect /2.05 defects per KLOC. Design164 overlapping zero. B targeted73 overlapping discovered the same P2, not a second defect or additional unique coverage. B density1/135 =7.41/KLOC. Narrow tests only; lifecycle runtime remains pending. Separate parent run.sh66 review confirms direct unconditional run_phases at65 under set-euo at3; hash unchanged, overlapping coverage.

## Finding and repair

Original fixture.sh71 marker redirection could fail after successful removal and fall through to return prior0. The real caller in volumes.sh uses `if fixture ... && volume_verify ...`; this suppresses Bash errexit throughout fixture. Added an explicit `|| return 1` and an AIDEV explanation at that exact marker write. Original failing oracle status remains returned when the marker succeeds; marker failure returns1 even if the earlier oracle failed, consistent with cleanup failure taking precedence inside fixture.

New fixture-regression.sh sources the real fixture.sh. Only Docker boundary functions are mocked; real jq/spec generation and filesystem marker redirection run. Mock removal creates a directory at the exact marker path to force redirection failure even as root. The test invokes the actual `if fixture ... && volume_verify ...` shape and verifies removal was reached, exact status, marker type and whether volume verification was skipped. Four cases: success0, marker failure1, oracle failure42, combined failure1. Against the old fixture, marker failure would incorrectly reach volume verification and return0, failing this oracle.

No regression or syntax check has been executed. This socket-free synthetic cannot prove daemon removal, timeout cleanup, resource ownership or whole-stack persistence; existing runtime limits remain unchanged.

## Exact changed execution files

| File | Lines | SHA256 |
|---|---:|---|
| ops/tools/be01-services/fixture.sh |74|`f31145e5624935516c701e555ebc617feafe0f25918a2fd984f86fed684903fe`|
| ops/tools/be01-services/fixture-regression.sh |58|`9b9ea89de332ed49a7779dc8dacdbca96ae93772cfa7fff1e01c6c6b0701811e`|
| ops/tools/be01-services/package.sha256 |13|`3044a0e2df4daa6cf5372e1edd90c609f5ed9d91a2b874842e97710d09694787`|

Targeted full-file review132 LOC (74 fixture +58 regression), within200. Production delta is one replaced statement plus one explanatory comment; regression58 new lines; manifest replaces fixture hash and adds regression hash. Package now547 executable/config/test LOC plus19 manifest lines =566. All other adapter execution files, dependency manifest, fixture package and canonical source manifest remain unchanged. Targeted independent review complete: prior P2 resolved statically; zero new defects/132 LOC, 0/KLOC. Hashes unchanged. This is static closure only.

See [concrete socket-free execution packet](be-01-services-socket-free.md) for syntax, all three regressions, boundary tests, image prerequisites and independent cleanup gates. Commands are prepared only, not executed.

## Parent validation sequence after review and reservation

Externally authenticate new package pin3044a0e2df4daa6cf5372e1edd90c609f5ed9d91a2b874842e97710d09694787; stage these three LF files into authenticated canonical source, leaving the52 source files intact. Retain previous adapter prerequisites and dependency hashes. In the reviewed capped socket-free Docker tools environment, run syntax checks and all three regressions:

```bash
bash /src/ops/tools/be01-services/regression.sh
bash /src/ops/tools/be01-services/profile-regression.sh
bash /src/ops/tools/be01-services/fixture-regression.sh
```

Use the new manifest hash in BE01_PACKAGE_SHA for any later reviewed full lifecycle invocation. No full lifecycle until synthetic PASS, current immutable baked-source-matching app availability, complete source authentication, image/capability prerequisites and coordinator reservation. Actual resource cleanup and independent inventories remain required before release. No ultrareviews, paid calls, product implementation, commit or push.
