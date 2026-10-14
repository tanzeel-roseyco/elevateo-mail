# ADV159 — standard suite root admission

Exact source: Orion 07411a15f1c69570136f024e10b6ea1975e3cae5 (fc45037 successor), completion-orion-native812. Static only; runtime NOT_RUN. No test execution or implementation edits.

Confirmed defects: 0. Density: 0 / 55 unique source LOC (0 per 1,000 LOC). Classification repair statically closed; exact-pin fleet execution remains separate.

The added case admits precisely test/v2_attachment_error_test.rb and test/v2_route_registry_test.rb. It introduces no root wildcard or fallback. The glob enumerates each matching path once, and Bash case chooses only the first matching arm, so neither exact addition can be duplicated by a directory branch. Dedicated-role exclusions remain before standard directory admission. Unknown test paths still fail immediately before test execution; empty standard selection also fails.

Tracked-path inventory contains 146 test suites: 137 standard and nine dedicated. Dedicated consists of four be_01_r1 historical suites and five exact paths (attachment gateway ACL/authority, attachment database, campaign database, Mailpit protocol). Both new root files exist. Older 139/141 counts are stale and must not be treated as this snapshot's inventory. This review preserves the preceding classification-failure history; it does not recast an earlier blocked run as PASS.

Existing process isolation, required-suite presence checks, suite timeout bounds, accumulated test failures, and final Steep/lint failure exit remain unchanged. Exact-path admission is the smallest useful change and retains fail-closed discovery for future roots. No permission, API, credential, or application-state boundary changes are introduced. This is manifest coverage review, not certification that dedicated suites passed or that standard suites require no additional runtime services.

Coverage: ops/tests/be02/test-suites.sh 1–55 at exact SHA (55 LOC); unified-zero diff adds current29–30 already included. No removed parent lines or other source read. Tracked test filenames inspected as inventory metadata only; test bodies excluded. Every read below180 and total below120. Runtime classification/execution, dependency availability, Docker cleanup, and actual suite results remain Soren's fleet verification. Full adversarial rubric applied proportionally; no styling checks performed.
