# Project state

Imported accepted Rowan ADV807, Nadia ADV806 and Elara ADV808 proof sources after immutable **3bf323c**. Permanent GUI-before-HTTP restoration, baseline Auth lifetime and opt-in policy wiring are source accepted by ADV821/822; candidate runtime NOT_RUN. Soren's separate immutable 3bf R12 is untouched: supervisor reports four actual core GUI cases and 16 screenshots, final immutable receipt/manual Mira review pending. Observer OFF; BE02 unaccepted; BE03 closed.

R9 c8 backend390/5792 and frontend624/all eight gates PASS retain original provenance. R10 c3 browser compilation/image and authenticated HTTP1/33/worker drain passed, but seed failed before GUI. R11 confirmed `fresh_auth_fixture_required` with pre-seed Auth count1; both diagnostics cleanup/independent absence passed. These failures remain historical evidence, not new-source test results.

F2 durable recovery remains OPEN: accepted reload loses newer memory-only buffer/operation while the committed server version survives. No durable local recovery, warning or ledger proof is inferred.

See [provenance](docs/completion/int401-current-freeze-provenance.json), [R12 handoff](docs/completion/int401-r12-setup-handoff.md), [history](docs/completion/int401-status-history-20261014.md) and [milestones](docs/completion/int401-remaining-milestones.md). Root owns acceptance and the actual vault; Cassian mirrors it; Soren alone schedules fleet Docker. Authority `task_1b0410b27785 / ctx_746eda601ef7`.

R12 evidence clarification: supervisor reported four core flows and16 screenshots; isolated conflict/revocation failed with causes not preserved by reporter. Whole GUI remains unaccepted; next candidate runtime NOT_RUN.
