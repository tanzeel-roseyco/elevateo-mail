# REV890 Nadia attachment typing repair review

Reviewed exact Nadia commit `da0bba88efc43299fbe1e5b2c21f1434602b9752` against parent `518fd712e497d087125cab3b78bffc2ef44beb98` in `completion-nadia-send810`. Actual reviewer runtime identity: Theo, Orca task `task_f01978ee66ee` / dispatch `ctx_3c739a2d52c4`, Codex `gpt-6-sol` per active worker projection; billed tier unverified. Source-only review: no Docker, app tests, Steep, RuboCop, scanner connection, Storage I/O, live credentials, mail or DNS changes. The Nadia owner packet `docs/completion/nadia-att886-steep-repair.md` marked its test recipe NOT_RUN; that limit remains.

## Exact bounded coverage

The commit diff was inspected first. **345 unique versioned source LOC** were read, below the 350 task cap and 400 hard cap; every read was at most 78 LOC. Overlapping diff context is counted once.

| Exact `da0bba8` source | Inclusive lines | Unique LOC |
| --- | --- | ---: |
| `apps/server/lib/elevateo/attachments.rb` | 18–99 | 82 |
| `apps/server/lib/elevateo/attachments_scan.rb` | 20–75 | 56 |
| `apps/server/sig/attachments.rbs` | 1–75 | 75 |
| `apps/server/test/attachments/service_test.rb` | 85–140 | 56 |
| `apps/server/test/attachments/clamd_scanner_test.rb` | 1–76 | 76 |

Exact reviewed blobs: `attachments.rb` `c0366edcf43cee95f0c20a0c4b9c549e0e0a3294`, `attachments_scan.rb` `c9ab50f57b8893690aa52d5763c3038c934d9246`, RBS `6657b9ecb11fc849ccf29217360db9f7b77a0a02`, service test `51d5c442ebf8e286d64590827fd6ecb9360bb12b`. The four changed code/RBS/test files contain **55 changed LOC** (41 additions, 14 removals), **0 confirmed defects, 0/KLOC**. The scanner test is unchanged context. Parent code removed in the diff was inspected as part of that exact patch, with no separate whole-parent review claim. Repository SQL, Rails route/gateway, actual scanner service and integrated runtime were excluded.

## Assessment

**No confirmed defect in the reviewed repair.** `Service#scope!` still checks all four UUIDs before building the scope, and `authorize!` passes the same explicit organization/mailbox/thread/message keywords and capability to the authorization callback. Stage keeps the write check before validation/Storage and repeats it after Storage before repository create; list and download keep their read checks before repository access. The explicit repository calls preserve scope IDs, cursor and the `limit+1` lookahead. No public response adds a private key or digest. The new `byte_size!` accepts only an integer from 1 through `MAX_BYTES`, rejecting a malformed stored string rather than silently coercing it; service regression checks both list and clean-download denial and verifies authorization denial still precedes size disclosure. Empty/over-limit input and cursor bounds remain checked.

`ClamdScanner#scan` rejects nil or incompatible socket objects before protocol writes. `write_all` now narrows a nullable byte slice before sending and raises a deliberate scanner error if unavailable; the loop still advances only by a positive integer write count. The reviewed scanner tests cover exact clean/malware framing, invalid/EOF replies, short writes, nil factory, empty and oversized payloads. The RBS additions describe `respond_to?`, the private scope authorization helper and stored-size helper without blanket `untyped` or ignored diagnostics. The change does not enable a live scanner or send path.

Methods remain small, names and AIDEV comments state the trust boundary, and no new loops, database queries or duplicated domain algorithm were added to hot paths. Tests cover a happy path and likely failures, and Nadia updated owner documentation. Exact Steep behavior, real ActiveRecord integer materialization, actual-role authorization/RLS and network failure behavior remain **NOT_RUN**; Soren alone should run the owner's specified service/scanner tests and strict Steep in fleet-02 Docker on the integrated SHA, recording exits, case counts and cleanup. Source review does not establish production readiness.
