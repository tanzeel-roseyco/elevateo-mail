# REV852 — Leonie OPS820 packet C static review

Reviewed exact source commit: `3fd0dcb835b591e4979541316da1e6a4addb55e0` in `completion-leonie-ops820`. Reviewer: Lyra FE808, independent static source review. Runtime identity: Codex worker in Orca terminal `term_e324d4a8-6f89-4c59-816b-19ff39caa104`; no Docker, application test, host test, clamd service, restore, or browser execution. The current user's full functional/security/performance review rubric was applied; formatting is delegated to lint.

## Coverage and limits

Credited bounded versioned source coverage: `ops/ops820/clamav_probe.py:1-76` (76 LOC), `test_clamav_probe.py:1-46` (46), `restore-rehearsal.sh:1-90` (90), and `source-runner.sh:1-59` (59): **271 unique LOC**. The cumulative credited coverage is below 350 LOC. One combined context read reported 191 output lines before truncation, so the 180-line per-call discipline cannot be claimed; I stopped further code reads and exclude partly truncated `full-runner.sh` references from credited coverage. Uncovered: later restore lines, complete full-runner implementation, migration 00018 contents/down method, snapshot verifier, Compose service/image policy, real clamd/runtime receipts and resource absence. This packet cannot prove end-to-end restoration, isolation or a real ClamAV verdict.

## Findings

1. **P2 / MEDIUM — no whole-reply deadline.** `clamav_probe.py:33-41` reads one byte per `recv`, while `verify:57` sets a 20-second socket inactivity timeout. A peer sending one byte just before each timeout can extend a 256-byte reply to roughly 85 minutes. The reply length is bounded, but elapsed time is not. Set a monotonic deadline for the entire reply and update the socket timeout to the remaining allowance before each receive; test a slowly trickling fake peer and a normal real reply. This matters for Soren's bounded disposable job and cleanup visibility.
2. **P2 / MEDIUM — changed fixture bytes are read before size/type validation.** `clamav_probe.py:53-55` calls `path.read_bytes()` after only a symlink check. A changed fixture can be arbitrarily large, exhausting the probe's memory; a FIFO or unusual file can block it. Require a regular file and exact expected size, then perform a bounded read and compare with the embedded fixture bytes. Test an oversize file and a nonregular entry. The socket scan itself rejects empty or over-1MiB payloads, but this prior read bypasses that bound.

Confirmed defects: **2 in 271 credited LOC = 7.38 defects/KLOC**. Both are static findings; runtime impact is inferred from Python socket/file semantics and is not a measured fleet failure.

## Scoped functional assessment

The probe embeds harmless clean bytes and a 68-byte EICAR test string, sends a length-prefixed clamd INSTREAM request with the zero terminator, accepts `stream: OK` as clean and a bounded signature `FOUND` reply as malware, and fails closed on incomplete/unrecognized replies. The unit fixture covers clean/EICAR framing and two malformed replies; it does not run a real ClamAV daemon, exercise slow replies, or cover oversized/nonregular fixture files. The fixed `clamav:3310` target and small embedded payloads limit ordinary input exposure; the stated 3-second connect timeout and 20-second inactivity timeout do not constitute a whole-operation deadline.

The inspected restore prefix requires an absolute verified snapshot, acquires Soren's Docker lock, uses a unique `ops402-restore-*` Compose project, and reports both job and cleanup exits. It checks migration 00018 is present before full mode and calls a reviewed runner; `source-runner.sh` uses a separate disposable `ops820-source-*` project and executes Rails migrations with local/outbound-hold settings. No shared-data deletion or `docker prune` appears in the credited ranges. Down/up fidelity, complete project absence and marker preservation remain unverified because the later runner and migration implementation were outside this bounded review.

Review suggestions were sent to root and Leonie's active Orca dispatch. Owner repair, independent re-review, fleet tests and exact cleanup evidence remain pending; this report changes no owner source.
