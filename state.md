# Project state

The immutable application candidate is **94d32db7fa6d626be371361ec01d055a5f497dbb**. This documentation revision does not change its app, test, contract or build source. Soren R8 owns fleet Docker validation: targeted checks, full backend including authenticated HTTP and worker, eight frontend gates, then the actual four-flow GUI with screenshots. Candidate runtime acceptance is **NOT_RUN / pending receipt**, not PASS. Observer remains OFF; BE02 acceptance is pending, BE03 implementation is closed, and F2 durable draft recovery remains OPEN (current recovery is memory-only; unload prompts are not guaranteed).

Latest completed runtime evidence belongs to **8a18f399**: R7 backend 386 tests / 5,680 assertions / zero failures / two errors (`Rails.logger` undefined in ReadControllerTest). Target Auth, Steep, RuboCop and Python harness checks passed; authenticated HTTP, worker and GUI were NOT_REACHED. All three attempt cleanups passed. Latest completed frontend PASS belongs to **45405cc**, not the new frontend source. Earlier 2f/ef7 health, seed and readiness success did not establish authenticated HTTP, worker or GUI success.

Source acceptance for this freeze includes Mira R7/R8, Nadia R8/R9 and Rowan b813210 (ADV774/775); source review is distinct from execution. Exact lineage, file hashes and closure are in [current provenance](docs/completion/int401-current-freeze-provenance.json). The immutable fleet bundle is `reports/cassian-app-94d32db.bundle`, SHA-256 `7a16f75fd0a2bba7f2d4a3fb4d60bdfd03d5813c29afe440fa12613762c6944e`, under `/home/tanzeel/elevateo-mail-wave-20261014/`. Its receipt records prerequisites and source closure.

Historical checkpoints and all earlier evidence are preserved in [the status history](docs/completion/int401-status-history-20261014.md). [Remaining milestones and authority map](docs/completion/int401-remaining-milestones.md) distinguish local acceptance from later production activation. Root owns acceptance and the actual Obsidian vault; Cassian owns this project mirror and integration records. No live sending or public deployment is authorized by this status.

## Next required milestones

Follow the [bounded checklist](docs/completion/int401-remaining-milestones.md). Accept exact runtime receipts before advancing BE02 or opening BE03. Current docs-only dispatch: `task_37f01123edfe / ctx_e26df76f1830`. No application tests were run for this documentation change.
