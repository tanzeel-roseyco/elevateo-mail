# Draft attachment upload API

The saved-draft API accepts one PDF, PNG, JPEG or plain-text file up to 1 MiB decoded. POST `/v1/drafts/:draft_id/attachments` takes `operation_id`, `mailbox_id`, `filename`, `content_type`, and `content_base64`. GET on the same path takes `mailbox_id` in the query and returns `{items:[...]}`. Metadata has `id`, `filename`, `content_type`, `byte_size`, and `status`. DELETE `/v1/drafts/:draft_id/attachments/:attachment_id?mailbox_id=...` returns `{removed:true}`.

A guarded write commits a reservation before network I/O. The private gateway verifies a signed, short-lived request and resolves its object key through the dedicated database role. It verifies the current reservation and session before and after immutable private storage I/O. The API holds no storage token and finalizes in another fresh authenticated guarded write. Metadata begins `pending_scan`; scanner and approval logic control clean/send eligibility.

An uncertain upload keeps its slot and appears as `scan_failed`. A replay of the same operation reconciles existing bytes and never grants another upload. Remove and reupload with a new operation when recovery cannot establish the original bytes. Removal retires the reservation and metadata, blocking late finalization; it retains private blobs for later controlled cleanup.

Upload content is filtered from Rails parameter logs. File names cannot contain paths/control characters, unsupported types and malformed base64 are rejected before reservation, and decoded size is bounded independently of Content-Length.

## Verification

New regression coverage: payload bounds and malformed inputs; gateway signature, checksum, reconciliation and revocation; real PostgreSQL scope, reservation and removal authority; Rack controller commit/lease ordering, fresh finalization guard, storage failure and denied requests. Combined fleet-02 Docker validation is pending. No live upload or production migration is claimed here.
