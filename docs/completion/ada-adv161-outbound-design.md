# ADV161 — outbound attachment contract decision

Design-only review of Cassian docs/completion/cassian-outbound-attachment-decision.md at5cc1de27. No source code inspected (0 LOC); no defect-density claim, implementation, tests or runtime acceptance. Existing seam details below are supplied packet evidence, not independently verified code.

## Decision: retain draft ownership and start smaller

Approve the additive V2 draft-owned design. Never stage against an invented inbox message. Keep V1 seven-field draft payload, empty attachments and snapshot.v1 unchanged. Choose one file, initially at most262144 raw bytes (256 KiB), while retaining a524288-byte maximum for the complete rendered SMTP message. A1 MiB file expands to approximately1.37MiB after base64 line framing before text/headers, so it cannot fit the documented524KiB renderer. Choosing1MiB now requires a separately agreed larger renderer/transport budget and larger buffered retrieval. It is a later compatible limit increase, not required to make attachments useful today.

Even256KiB is not an automatic MIME fit: bound the existing text and final MIME, returning a closed message_too_large error before approval if the total exceeds524288. Do not silently truncate. Rowan still needs a V2 multipart renderer and SQL consumer; a smaller cap does not make the text-only V1 worker attachment-capable.

## Stage / metadata / selection

Cassian should expose the proposed mailbox+draft scoped POST, GET and PUT binding routes. Raw binary with bounded operation_id, filename and content-type headers is a reasonable minimal one-file transport if compatible with the existing gateway; choose one transport, reject duplicate/unknown control fields, and document header encoding. Neither metadata nor response returns storage key, credentials or private scan reason.

Stage requires current compose permission, editable draft and exact organization/mailbox/draft; validate size/type/signature before writing. Reserve operation_id and canonical request digest in a short transaction, transfer to private storage without a database transaction, then reacquire fresh session/context/compose/draft authority and commit immutable metadata pending_scan. Concurrent identical retries must resolve to the same id or a bounded operation_in_progress result; they must not upload two independent objects then guess which won. A request digest includes bytes hash, filename, MIME and complete ownership tuple.

Scan uses the existing restricted verdict pathway. GET returns safe metadata only under current draft-read/mailbox authority; write paths require compose independently. Status vocabulary must match the actual scanner and canonical V2 enum, rather than inventing a second spelling for failed scans. All non-clean statuses prohibit selection/review/send.

PUT binding uses operation_id and expected_draft_version. Lock draft, enforce authority, validate exact immutable clean reference, update selection and version atomically with operation outcome. Identical replay returns its original result even after later edits; a reused id with different payload returns409. Replacing/removing selection is an explicit versioned operation. Allow at most one selected reference; retain unselected private objects for task-owned reconciliation, not unlimited UI history. A stale draft version is409 conflict; foreign or inaccessible id is404; authorized held item423. Do not conflate absent with held.

## Review / approval / worker

Use a separate V2 review/approval path and snapshot.v2 containing the proposed ordered id/SHA/size/MIME/filename tuple plus draft version and existing actor/mailbox/policy binding. References keep approval snapshots small; bytes embedded in JSON add duplication and would invalidate current size limits.

Review may fetch/hash bytes via the confined private gateway using fresh authority checks around network I/O; it must not hold the approval transaction during retrieval. Approval atomically rechecks reference, verdict, draft version, policy and authority under the existing lock order. Approval itself cannot prove that remote bytes remain unchanged forever: immutable storage reference plus final worker hash/length verification is essential.

Worker retrieves exact approved bytes outside long database transactions, checks actual digest/length, renders bounded multipart MIME, then reacquires the existing final fenced authorization/cancellation guard immediately before possible SMTP I/O. This sequencing prevents a cancellation during download from becoming a send. It does not promise cancellation after transport has begun; retain existing unknown/reconciliation semantics and never retry an uncertain submission automatically. Remote transport remains held; disposable Mailpit/Mox proves decoded byte identity without live credentials.

## Owner scopes and acceptance order

1. Nadia: draft-owned relation/reservation ledger, private staging, scanner reuse, safe metadata and versioned selection controller/repository. Prove compose vs viewer, conflicting/concurrent retry, revoked-after-upload, crash/ambiguous commit and pending/malware denial. Do not add a browser Storage credential or new infrastructure.
2. Rowan: snapshot.v2 producer+SQL+approval and bounded multipart worker consuming exactly that format. Prove swapped/changed tuple denial, stale draft, cancellation/revocation during retrieval, corrupt bytes before SMTP, decoded MIME exactness and uncertain-send no replay. Old V1 tests must remain valid.
3. Mira: upload/progress then pending_scan, clean-but-unselected, selected, held/error, version-conflict and removal states through MailroomGateway. Keep Send disabled until server review succeeds; a clean badge is not approval. Retry an ambiguous upload with the same operation id; a deliberate replacement gets a new id. Clear attachment state on draft/mailbox/session changes.

Cassian owns canonical OpenAPI/error enums/generated DTO/registry/injection once contracts are fixed. Implement the three scopes in isolated candidates in parallel after tuple/limits are agreed; integrate staging+UI before activating V2 send. Soren owns actual-role and private-storage/clamd/MIME runtime gates. No circular requirement for live credentials before disposable integration.

## Simulations: blockers versus later work

Crash after upload: object stays private and pending reconciliation; no false successful selection and no deletion after ambiguous commit. Scan finishes after a held review: user retries review only after clean; never retroactively authorizes the prior digest. Draft replacement after approval: version mismatch stops a new attempt. Revocation/cancellation during private byte retrieval: final guard denies before SMTP. Corrupt remote object: worker hashes actual bytes and refuses before first I/O. Concurrent operation reuse with different bytes:409, immutable history retained.

Blockers are draft ownership, fresh compose/session checks, atomic idempotency/selection, exact versioned producer/consumer, real clean verdict, bounded MIME and final fenced guard. Larger files, multi-file/reordering, resumable upload, previews, remote provider delivery and richer native attachment APIs are later improvements. They should not delay this useful one-file slice or existing inbox acceptance.
