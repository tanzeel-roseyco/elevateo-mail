# HTTP approval isolation harness — bounded source review

Task `task_ba68a08c33cf`, dispatch `ctx_740e813d9882`. Read-only review of
`apps/server/test/support/launch_mailflows/fleet_protocol.py`; only this report was written.
Required context consulted: README.md, state.md, documentation.md and .planning/STANDARDS.md.
No workers, tests, Docker commands, locks, UI changes, external sends or production changes.

Reviewed SHA256: `80aacc1ccd38e6e89b7457260042264a8c1a2eda3b16fc9f355c29f6f9c510b8`.
Hash checked before and after review; retry suffix `c` is not a finding.

## Coverage and result

| Packet | Inclusive lines | Physical LOC | Defects attributed | Defects/KLOC |
| --- | --- | ---: | ---: | ---: |
| A | 1–140 | 140 | 0 | 0.00 |
| B | 141–279 | 139 | 1 | 7.19 |
| Total, unique target lines | 1–279 | 279 | 1 | 3.58 |

LOC includes blank/comment lines so the denominator is reproducible. Shared helper source
was consulted for call semantics, not added to coverage or represented as independently reviewed.
Applied the supplied functional/security/data/failure/testing/documentation rubric; no styling review.
Result: one MEDIUM cleanup defect; production isolation source checks otherwise show no confirmed defect.

## MEDIUM — fixture cleanup can be bypassed before the outer finalizer

Location: lines 186–190 (cleanup helper at 78–103; outer finalization at 268–269).

`protocol()` catches only `Exception` and places both credential deletion and fixture teardown
after that handler rather than in an independent `finally`. A KeyboardInterrupt during the running
protocol bypasses both actions. Even for an ordinary caught error, an OSError from
`.env.app-chain.unlink()` at line 188 prevents `clean_fixture()` from running and replaces the
original failure. The private runtime contains generated mailbox credentials and mail data.

The outer `finalize()` does not repair this: this runner never registers PRIVATE as
`task.acceptance_private`, and the raw Mox container has only a project label, not a recognized
Compose service or an acceptance-mount registration. Generic cleanup rejects that container as
an unexpected service before removing the project containers. Consequently an interruption can
leave task containers, the private bind directory and generated credentials behind. This is
resource/secret retention, not evidence of external mail delivery or production credential leakage.

Put credential removal and fixture teardown into independently guarded finalization stages,
preserve and re-raise the primary exception/interrupt, and give teardown a bounded cleanup budget
independent of the test deadline. Ensure the outer cleanup can safely recognize the exact fixture
if its dedicated teardown fails; do not weaken generic mount/service checks. Add regression cases
for an interrupt during protocol execution and an unlink failure, asserting teardown still runs,
the original failure survives, and retained resources are explicitly reported. No such failure
injection was run by this reviewer.

## Checked invariants and evidence limits

- Production API overlay keeps outbound hold true and Mox production enablement false; its
  control document is also held. No production guard is disabled by this target. Enabling the
  approval API is scoped to the synthetic production-mode test service.
- The fixture joins only the named network after inspecting `Internal == true`, publishes no
  ports, and uses loopback DNS plus explicit task-service hosts. The consulted base Compose
  definition declares the shared network internal. Host-side pinned-image/build traffic is
  separate from mail transport; this review makes no zero-network-traffic claim.
- Cleanup restricts its private mount to an exact resolved retry path and deletes synthetic
  runtime data only. No global prune or persistent-volume deletion is introduced here.
  Cleanup command nonzero exits are suppressed locally with `required=False`; generic cleanup
  remains a backstop and must not be interpreted as successful merely from an empty local list.
- Credentials are randomly generated, env files use owner-only modes, Docker output passes
  through Task redaction, and the chain credentials travel through an env file rather than
  command-line URL arguments. The source uses no real provider credentials.
- Source gates run independently but their failures are retained and fail the final run;
  a successful protocol chain cannot erase failed source checks. Final exit also checks cleanup.
  Source hashes and immutable image receipts bind evidence to source/build identity.
- The target selects the HTTP-chain integration test and records runtime evidence; this source
  review does not prove its assertions passed, genuine provider activation, live delivery,
  complete happy/failure coverage, visual acceptance, or whole-application correctness.

The coordinator's existing documentation accurately distinguishes earlier SQL-fixture approval
from the pending HTTP approval proof. Fleet runtime evidence remains owned by
`ctx_4be80c8bfe6d`; this review neither acquired its lease nor inspected/mutated its live resources.
