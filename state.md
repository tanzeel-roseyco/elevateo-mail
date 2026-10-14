# Project state

Mira OFF405 R11 ADV798: source-only SCN-DRAFT-008-F2 authored on exact c8ffa46 in an isolated branch. Real committed/lost-ACK receipt barrier distinguishes original operation, newer unsaved buffer and server snapshot. Memory-only reload gap remains OPEN; server saved reopening is not uncertain-buffer recovery. Runtime and independent review NOT_RUN; prior Soren R9 evidence is separate. See [R11 handoff](docs/completion/fe405-r11-uncertain-reload.md). No production changes.

The current repair freeze integrates exact Rowan R7 `6c9a4ac`, Mira R9 `e88273b` and Mira R10 `3919d2a` over application `94d32db` and documentation parent `e37603f`. Source reviews are accepted; this repair candidate runtime is **NOT_RUN**. Soren alone owns fleet Docker validation. Observer remains OFF; BE02 is unaccepted, BE03 closed and F2 durable recovery OPEN (memory-only retention and unload prompts are not durable recovery).

Actual Soren R8 on immutable **94d32db**: ReadController 15/362, Auth request 3/62, Auth client 8/44, full backend 386 tests/5,734 assertions, native 5/26, Steep, RuboCop 152 files and Python 3+3 passed. Real authenticated HTTP 1/33 passed. **Worker drain failed after 31.08s**; intent state was NOT_CAPTURED before cleanup, and sanitized 204 then 403/session_not_found logs do not prove exact intent ordering. All eight frontend gates ran: unit 623 cases, 621 passed and two failed; the other seven gates passed. **GUI NOT_RUN, zero screenshots**. Backend/frontend cleanup and independent absence checks passed; shared pins and persistent services were retained. Receipt `reports/soren-r8-immutable-receipt.json`, SHA-256 `c9fb1a4e22fe6eba31ba4341bb9911ecc27e5f962809fa1a9451abc678fbef8a`.

Exact source provenance is in [current provenance](docs/completion/int401-current-freeze-provenance.json); historical evidence remains in [history](docs/completion/int401-status-history-20261014.md). [Remaining milestones](docs/completion/int401-remaining-milestones.md) require exact repair tests, worker drain and actual GUI evidence. Root owns acceptance and the actual vault; Cassian mirrors it. No local application execution, live sending or public deployment occurred. Authority: `task_5886a83067b8 / ctx_0a526cc2d333`.

## Next required milestones

Follow the linked checklist; Soren validates the exact frozen SHA, root decides acceptance. No tests run on this device.
