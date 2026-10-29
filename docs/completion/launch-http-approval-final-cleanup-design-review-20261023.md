# HTTP approval final cleanup — dedicated design review

Task task_990afb0f0718; dispatch ctx_e91c80a72126. Static review only; no tests, locks, Docker commands, subworkers, live-resource inspection or source edits. Runtime remains owned by ctx_4be80c8bfe6d. Obsidian is unavailable: no simulation via the vault was performed. Scenarios below are analytical desk simulations, not execution evidence.

## Scope and provenance

Required README.md, state.md, documentation.md, .planning/STANDARDS.md and prior launch-http-approval-harness-review-20261023.md were consulted. The combined context display was truncated; no claim of exhaustive historical-document review is made. Full supplied functional/security/state/error/testing/documentation rubric applied; formatting delegated to tooling.

SHA256 before/after source review matched:

| File under apps/server/test/support/launch_mailflows | SHA256 |
| --- | --- |
| fleet_protocol.py | 2e88d91660207b0c8c8bf6295e11b4a8de827050cd278f13d648261300ca1331 |
| fixture_finally.py | def29ca252454c75ee2093ca05ab38a2b15b9afd36026f77e224ed8ded0c5148 |
| fixture_finally_test.py | 85d3066a7c1ce25b715cb4797ffeb01bfa9b786b4f657d35bbb9fb577b0fa045 |

| Review packet | Inclusive lines | Physical LOC | Open confirmed defects | Defects/KLOC |
| --- | --- | ---: | ---: | ---: |
| fleet protocol A | 1–151 | 151 | 1 | 6.62 |
| fleet protocol B | 152–302 | 151 | 0 | 0 |
| finalization helper | 1–26 | 26 | 0 | 0 |
| helper regressions | 1–37 | 37 | 0 | 0 |
| Total original authorized coverage | | 365 | 1 | 2.74 |

The actual harness has 305 lines. Lines 303–305 (blank/main entrypoint) were incidentally displayed, increasing unique source viewed to 368; they are not attributed substantive review coverage. The coordinator's later reduced-range instruction arrived after the original full-file reads. No further source was read: fixture_presence_test.py (42 lines) was not reviewed because cumulative unique reads would reach 410, beyond the updated 400-line ceiling. This limit was reported to the coordinator. Each original review packet is at most 200 lines. No imported helper implementation was read.

## Prior MEDIUM: repaired bypass, remaining cleanup acceptance issue

The specific interrupt/unlink bypass is repaired at fleet_protocol.py:203–209 and fixture_finally.py:11–26. Catching BaseException captures KeyboardInterrupt, the finally always invokes finish_fixture, credential unlink and teardown run as independent stages, and the exact primary exception object is raised after attempted evidence recording. An unlink failure cannot prevent teardown. No-primary cleanup failures deliberately fail the run. The prior single MEDIUM is therefore fixed for that bypass mechanism; this does not mean all teardown failure paths are accepted.

One open MEDIUM at fleet_protocol.py:98–117: stop/remove command failures are ignored without checking post-removal absence. Every command uses required=False and its returned result is discarded. If Docker returns a nonzero stop/remove result without raising (the prior report explicitly documents this contract), the code proceeds to remove the runtime directory and can return an empty error list while the fixture container remains. The outer backstop retries, but uses the same helper, so it can repeat this silent outcome. Generic finalization is not a substitute: the prior report records that it rejects this raw fixture. This is retained-container/resource reporting failure, not evidence of external mail or production credential exposure.

A narrow repair is to verify exact fixture absence after removal, retaining/reporting failures before claiming successful teardown or deleting runtime data still needed by a live fixture. Preserve exact ownership checks. Test a non-raising nonzero stop/remove outcome and assert explicit retained-resource reporting and failed cleanup. This finding does not require a new abstraction. Count: one open confirmed defect / 365 reviewed LOC = 2.74/KLOC. Historical fixed defect count: one; historical and current counts are not added as two independent current defects.

## Bounded cleanup and primary-error limits

clean_fixture sets cleanup_mode and a new 240-second deadline before inspection, so its own cleanup budget is separate from the test deadline. Commands request finite timeouts. Helper source is excluded, therefore enforcement of aggregate limits and subprocess termination is not independently established here.

Additional unresolved design verification at lines 284–295: the outer backstop performs task.docker presence lookup before calling clean_fixture and before locally resetting cleanup_mode/deadline. If that lookup is subject to an expired task deadline after an interrupted first teardown, it can fail before the fresh budget is installed. The local except records failure and continues generic finalization, but does not retry exact fixture cleanup. Confirm with the Task owner/runtime; this is a conditional risk, not a second confirmed defect, because Task implementation was outside scope. Move budget activation ahead of backstop lookup if that contract applies.

Primary preservation is proven statically within finish_fixture, including evidence-write failure. At application-run level, outer finalize/space-after/stat/write operations can themselves raise; their behavior and interrupt preservation are not certified without the excluded helpers/runtime. Do not broaden the helper-level guarantee into whole-run exception preservation.

## Analytical tradeoff scenarios and isolation

- Protocol interrupt plus credential unlink denial: stage one records denial, stage two still attempts cleanup, record is attempted, and original interrupt survives. This deliberately prioritizes causal failure while retaining secondary diagnostics; the regression asserts exception identity and teardown invocation.
- Successful protocol plus cleanup failure: helper raises RuntimeError rather than reporting a clean pass. The third regression directly covers returned retained-resource diagnostics. Successful protocol plus entirely successful cleanup and empty stages work by inspection but have no explicit regression in the reviewed test file.
- Evidence writer failure with a primary error: primary survives; the recording failure is appended only in memory and may not become durable evidence. This is an observability limitation, not a reason to replace the primary error. No regression covers this branch or an interrupt raised by a cleanup stage.
- Fixture absent: container inspection is skipped; synthetic-directory cleanup proceeds. Missing-container command exits are tolerated intentionally, but that tolerance is also why failed removal of an existing container needs an explicit absence postcondition. New presence regressions were not inspected due the cumulative source ceiling.
- Wrong ownership/mounts: cleanup refuses deletion on mismatched exact name, pinned image, project label, published ports or bind-source allowlist. Safety wins over reclamation and returns an explicit retained-fixture error. Exact PRIVATE.resolve comparison gates directory deletion. This assumes exclusive task ownership and stable paths; no adversarial concurrent-host mutation protection is claimed.
- Transport boundaries remain held: synthetic API retains outbound hold and production enablement false; internal-network proof precedes fixture start, no published ports, loopback resolver and validated IPv4 task hosts. These checks do not certify imported Compose configuration or production activation. Pinned images and generated secrets/env-file transport avoid introducing actual provider credentials into command arguments.

No unnecessary class hierarchy, future-facing abstraction, database loop or performance bottleneck was identified in this bounded cleanup change. Fixed-size cleanup stages and bounded service loops fit this one-off harness. Existing AIDEV notes explain critical ownership and ordering constraints. Test helper typing is incomplete relative to the strict-typing standard; this is recorded as conformance debt rather than an additional runtime defect. Current documentation distinguishes fixture proof from production readiness.

## Acceptance

Static decision: interrupt/unlink finalization repair accepted; complete cleanup acceptance remains OPEN for the nonzero stop/remove postcondition and conditional expired-budget backstop verification. Reviewed regressions cover three relevant failure scenarios but do not establish real Docker cleanup, successful teardown, mount refusal, fresh-deadline behavior or external isolation. Fleet runtime evidence, additional presence-test review and coordinator acceptance remain outstanding. No production release authority is implied.
