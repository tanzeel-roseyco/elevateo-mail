# PERF-01 consultation record

Status: **three independent exact-model opinions completed on 2026-10-12 (host +11:00); Astra MAX synthesis completed by the parent coordinator the same day** as [astra-max-synthesis.md](astra-max-synthesis.md) (SHA-256 `15f0aaa7af6cec489b21ead5b3764d8efe2f2dd429079f54dcd1b74c12dbc73c`, `gpt-6-astra` at `max`, task `/root/perf01_max_synthesis`). The synthesis decision is conditional design acceptance of a bounded foundation investigation; it is not implementation permission, not a benchmark result, not performance acceptance and not a merge decision. Its gates are applied to the plan in `docs/perf-01/README.md` section 7b. No application code changed; no benchmark, Docker or test ran anywhere as part of this consultation or its synthesis.

## Execution evidence

Runner: installed Claude Code CLI 2.1.296, flags verified against its current help before launch: `--safe-mode --print --model <exact> --tools "" --no-session-persistence --output-format json`. No fallback model, no permission bypass, no resume, no shared conversation. Three fresh single-turn sessions ran sequentially from one identical common packet; each received its own focus prompt and no other opinion. Raw JSON results, stderr and the status log stay outside Git in the private input/output directories recorded in [metadata.json](metadata.json).

| Session | Requested model | Observed model (`modelUsage`/`canonicalModel`) | Exit | `is_error` | Words | Elapsed | Opinion |
| --- | --- | --- | ---: | --- | ---: | ---: | --- |
| Second opinion | `claude-fable-5` | `claude-fable-5` | 0 | false | 2,339 | 94 s | [fable-5.opinion.md](fable-5.opinion.md) |
| Third opinion | `claude-opus-5-5` | `claude-opus-5-5` | 0 | false | 1,781 | 81 s | [opus-5-5.opinion.md](opus-5-5.opinion.md) |
| Fourth opinion | `claude-fable-5-1` | `claude-fable-5-1` | 0 | false | 1,631 | 195 s | [fable-5-1.opinion.md](fable-5-1.opinion.md) |

Returned session IDs, usage, cost and timing are in metadata.json; the observed model is taken from the runner's returned `modelUsage`, never from the model's self-description. Opinion texts are retained in full with only the terminal newline normalized; each was scanned for credential-shaped values (zero matches). Stderr was empty for all three. All three completed on the first attempt; no authentication or model-routing blocker occurred.

## Packet

- Base commit `5785eba47f3709debb2815c8d86608f7e62d02f3`, branch `perf/fable-5-1/backend-speed`; working-tree diff SHA-256 recorded in metadata (the uncommitted inventory, harness docs and ledger edits are included as SOURCE).
- Common packet SHA-256 `f3ce7c85b090d5debee3701fd01a590f776cbe71ec7ca498555a5b9033e7c2e4` (425,418 bytes), identical across the three inputs; [task-override.md](task-override.md) is the PERF-01 task section, and each `*.input-prefix.md` is the shared brief plus focus prompt that preceded it.
- Contents: the ten mandated current documents, the accepted ADRs 0001/0002 and decision record D-01..D-10, the standards, the PERF-01 brief, the seven inventory documents, `ops/perf/cleanup.sh` at the reviewed revision `f135397c…` with its four confirmed coordinator findings stated as facts, and the complete current backend source. Excluded on purpose: every earlier model opinion and synthesis, the other harness scripts and the test suites (disclosed inside the override). Credential-shape scan of the packet: 0 matches, 0 PEM blocks, counts only.

## Packet accuracy note (recorded after execution)

The parent's later read of the executed [task-override.md](task-override.md) found two stale statements that the lead did not catch before launch: the "Task identity" section named `.planning/consultations/results/be-01/decisions.md` as a SOURCE although that file was deliberately excluded from the packet (its refinements are restated in ADR 0002, which was included), and the status section said eleven harness defects were "found and repaired" while the cleanup section correctly described C1–C4 as queued and unverified. The models therefore saw one dangling SOURCE reference and one over-firm repair sentence. The executed override, the three opinions and every hash in metadata.json are preserved unchanged as the historical record. The corrected text is saved beside them as [task-override.erratum.md](task-override.erratum.md), labeled as an erratum and not as an original input. The parent coordinator decided that the three recorded opinions stand; no consultation was re-run.

## What the three opinions say (recorded, not synthesized)

The lead records convergence and divergence here for the parent's Astra MAX synthesis; no recommendation below is accepted, adapted or rejected by this record.

Convergent across all three:
- Classes A (indexes) and C (tenancy round trips): support no-change / forbidden. Class D fan-out or cache: no-change / forbidden; the `/ready` timeout and lease items are correctness work to be handled separately, and Fable 5.1 adds that `connect_timeout` does not bound an already-established connection against a frozen database.
- Class B (`context_uuid` body): defer; Opus 5.5 moves it out of PERF-01 entirely. All three name B as the riskiest class and give the same failure sequence (IMMUTABLE or foldable function, generic plan after five executions, cross-tenant read on a pooled connection with no error) and the same regression (alternate principals on one connection across prepared executions; assert `provolatile = 's'`).
- Class E (environment file, Puma threads) and G (worker tmpfs, RubyGems-free probe): support measuring, with contract tests, a measured baseline and this gate as prerequisites; no-change remains an acceptable outcome.
- Measurement: pass-2 within-stack repeat is insufficient; add an unmodified second baseline project A′ (A, B, A′) and treat deltas inside the A/A′ band as indistinguishable. Pin the load client to the baseline image for every run. Drop tier-16 new-connection `/ready` cells from candidate runs.
- Harness safety beyond C1–C4: a secret-value grep of the whole evidence tree before `SHA256SUMS`; fail-closed user counts in the image and volume steps; the manifest proof must bind to this run/project, not any manifest; build cache and pulled images should be retained outright unless a task-named builder proves ownership.
- Gates: contract tests first; the Steep gap blocks controller edits only, not config or Compose candidates; the harness guard regressions should run before the first real baseline.

Divergent or singular points preserved for synthesis:
- Fable 5: the measurement edifice is heavyweight relative to likely findings; offers a minimal alternative (contract tests, in-image facts, c=1 baseline, 120 s idle) if budget is tight; make the cross-principal prepared-statement regression a standing test now; pre-commit the shape of a no-change report so it is a complete deliverable.
- Opus 5.5: split E into E1 (environment) and E2 (Puma) and measure separately; E2 is determinism, not speed; adopt a 10-minute idle window for class G only; add workload W6 (`/health` during a `/ready` storm) to the baseline; define boot time as five cold starts to first `/health` 200; retain all build cache and pulled images and remove the flags; anonymous volumes must be reported as retained; manifest must be incomplete on any unavailable sampler row during a measured window; move `/ready` timeout and lease work to a separate FIX task.
- Fable 5.1: the Rails `Allocations:` log field excludes Reloader and Static, so the whole-stack `GC.stat` method must be the primary allocation metric or E cannot be judged; contract tests must run under the same `RAILS_ENV` as the measured service and capture `bin/rails middleware` for both; a paused task container cannot be stopped, so the exit trap must `unpause` before `stop`; a mid-run host-load abort file is needed; the capped worker may fail its own probe at 0.25 CPU and `.State.Health` must be recorded per window.
- Hard contradictions named: Opus 5.5 and Fable 5.1 both flag the 120 s versus 10-minute idle window conflict between benchmark-runner and design-adversary. Fable 5.1 flags that `cleanup.sh` documentation promises a non-zero exit whenever anything is retained while the reviewed revision exits 0 with default-retained volumes and images.

## Synthesis outcome and next

The synthesis (section 2 of its file) accepts E1, E2-as-inventory, read-only YJIT verification, G1 and G2 as experiments only; rejects A, B-IMMUTABLE, C, D and probe-cadence changes; defers the `context_uuid` body rewrite, readiness deadlines/lease release and the frozen-body rider outside PERF-01; and accepts a measured no-change as a complete outcome. It supersedes the earlier four-finding cleanup summary with the six H5 findings, and the parent's later H6 review added four more; all remain open pending rereview and Docker regressions. Dissent is preserved in its section 8.

1. Harness owner repairs the open cleanup findings; parent performs fresh bounded review; no execution anywhere until frontend releases fleet-02 and the coordinator issues a new reservation.
2. No product edit proceeds before the cleanup findings close with evidence, the guard tests pass in Docker and a valid baseline A exists.
