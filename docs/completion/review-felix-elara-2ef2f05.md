# QA-817 bounded static review: Elara Mailpit worker

Source: Elara `2ef2f05f72edc11546bae72ef36a45d2ebf7b885` in `completion-elara-send811`. Review date: 2026-10-14. This is a source review; no application test, Docker run, SMTP connection, or benchmark was executed by Felix.

## Exact coverage

| File | Lines read | Unique LOC | SHA-256 at source commit |
| --- | ---: | ---: | --- |
| `apps/server/bin/send-worker` | 1–49 | 49 | `a56658f91fdda5c629072ce95a304688c0b8b6b5ba03b94af8c8114e50aef093` |
| `apps/server/lib/elevateo/send_worker/database_store.rb` | 1–146 | 146 | `d0b091bea693949f451791a8ea4cd92d4b389c9066c84f5c5ee49c30524b7cf9` |
| `apps/server/sig/send_worker/database_store.rbs` | 1–41 | 41 | `1896e38775d295d65a5b687fb991aaf5373c6a6682db7b1e99c36355b7a57e64` |
| `apps/server/test/sends/mailpit_worker_database_test.rb` | 1–75 | 75 | `6efeb64222a97a6a035d284544371274e6370d2779a5be431eaa63b0d06f19a1` |

Total: **311 unique versioned source LOC**, in 169- and 142-line reads; no assigned source lines excluded. Confirmed static defects: **0; 0.00 defects/1,000 reviewed LOC**. Runtime defects and performance are unmeasured.

## Findings and acceptance limits

No confirmed defect in the bounded source. The CLI requires the worker role, a control path, and outbound hold before constructing a driver (bin lines 12–30). Mailpit requires the explicit `--mailpit-test` form and one UUID, while the existing synthetic profile remains the default. The store hashes `local:mailpit-smtp-test-v1` for authorization and calls `record_observation_v2` with `mailpit_smtp_test_v1` (store lines 16–17, 69–75, 87–108). Its claimed tuple matches Elara's documented Rowan 00013 interface, but Rowan's SQL was outside this assignment and interface compatibility remains unverified here.

The new disposable-DB test directly checks accepted profile/source/receipt and one attempt (test lines 17–28), unknown followed by due reconciliation with zero further client calls (30–40), and session revocation before invocation (42–47). It injects an object whose `deliver` method returns a fixed accepted receipt (51–64), so it **does not establish an actual Mailpit SMTP exchange or CLI profile fence at runtime**. Soren should run the stated database test and an isolated CLI/Mailpit fixture on the integrated exact source before those claims are accepted. This is a verification gap, not a demonstrated production defect.

The code uses parameterized SQL, limits due exclusions to 32 UUIDs, caps lease/call budgets, and validates result shape. The small profile map and versioned SQL branch have a clear present purpose; no new unbounded Ruby loop, repeated query per recipient, unrelated state mutation, or confirmed authorization bypass appears in these lines. `claim` does two database calls and `authorize_submission` does two; their query plans and latency require Soren's measured baseline. The source and test leave malformed/null sender behavior, real SMTP response handling, Rowan migration permissions, executor reconciliation, and end-to-end receipt validation outside this bounded review. `docs/completion/elara.md` documents the mode and labels runtime NOT_RUN. Naming and why-comments are sufficient for this packet; formatting remains with lint.

**Requested fleet checks (not executed by Felix):** run the new DB case with Rowan 00013 and one isolated explicit CLI Mailpit positive/invalid-sender/revoked fixture; preserve synthetic default and unknown-no-replay assertions. Report actual runtime and memory only from that execution, with exact integrated SHA and cleanup evidence.
