# ADV137 — private attachment content candidate

Nadia3a454c8c18342cb0da03fb224948dfdc627102a1, completion-nadia-send810; Cassian9c959298 supporting vocabulary/header source. Source-only; no tests/builds/Docker/live operations. Isolated route remains inactive; integrated runtime identity not proven.

## Exact coverage and defects

Counted planned278 LOC before reads: Nadia inbox_attachments_controller.rb1–136; attachments_download.rb1–29; download_service_test.rb1–77; sig/inbox_attachments_controller.rbs1–13; sig/attachments_download.rbs1–23. Then69 context LOC counted before read: Cassian9c959298 api_controller.rb45–55 (11), collaboration_error.rb1–35 (35), v2_attachment_error_test.rb1–23 (23). Total347 unique versioned LOC; each packet<=180. No parent source read. Confirmed defect1; density1/347=2.88 defects/KLOC.

## Confirmed defect — fixed held envelope

Controller78–80 emits attachment_held423 with message Attachment is not ready. Cassian9c959298 fixed vocabulary17 and regression10 require Attachment is not available yet. Thus the candidate bypasses the shared fixed renderer and disagrees with the integrated contract. Minimal correction: raise CollaborationError.new("attachment_held") in Held rescue and use inherited renderer. Preserve authorization-before-held ordering; do not change grants or status. This finding was sent immediately to root.

## Authority and transaction flow

Paths validate four UUIDs; content rejects unexpected query/body and obtains context/version. Each download_snapshot authenticates the cookie afresh, opens its own read-only tenant frame, authorizes current context/version, checks direct message, queries exact org/mailbox/thread/message/attachment metadata, then requires clean and bounded positive integer size. Foreign/absent tuple is denied before held status is exposed. Public row ID/type checks and strict snapshot fields remain fail-closed. The private claim contains current identity/session identifiers and exact tuple, not Storage keys or service-role credentials.

with_connection/with_context blocks return before DownloadService invokes gateway.download; no reviewed DB transaction spans network. The second fresh snapshot must equal the first, including tuple/session fields, metadata and size; expiry checked before/after. Bytes must be String, exact expected size and within MAX_BYTES before binary frozen return. Claims use generation from newly authenticated identity.metadata, while context/version come from authorize; whether these are coherent current-generation values depends on unseen session implementations and must be proven in real-role runtime. No assertion that a source name alone establishes freshness.

## Response and status

Successful response is fixed octet-stream/attachment filename, explicit exact Content-Length; api_security_headers provides no-store, Vary Cookie and nosniff. No browser URL fallback. Auth/not-available and gateway unavailable map to intended error families; held has the confirmed envelope defect. Check actual Rails middleware/proxy headers and binary preservation in HTTP runtime. No unbounded network response behavior can be certified without the unseen gateway client.

## Tests, types and limits

Unit tests require two snapshots, one gateway call and timeout5, reject pre-fetch denial, simulate revocation during fetch and changed size, wrong/oversize bytes, expired initial claim and failure propagation. Snapshot fixtures are simplified and do not prove real Auth/RLS/current generation or tuple fields; no controller/header integration test is in this packet. RBS declares explicit snapshot fields/binding and private method types, with nullable context/version consistent with helper boundary. Existing index lambda strict error was supplied for older gate215080; no fresh typecheck was performed, so this review does not attribute that old diagnostic as a new content defect.

Unseen dependencies: session authenticate/authorize and generation provenance; Tenancy implementation; ThreadReads/RLS; private helper and gateway client's before/after Storage checks, SHA validation, size bounds, signature/expiry verification; route activation/OpenAPI parser. These require Soren exact-integration proof rather than further claims from this packet.

## Design simulations and completion

Revocation during Storage fetch: second snapshot denies, buffered bytes discarded. Context generation switch: fields differ or authorization denies; no release. Attachment becomes held or metadata changes: second snapshot throws/inequality rejects. Equal public metadata cannot independently prove equal bytes; gateway SHA/binding is essential unseen proof. Expiry after network rejects. Revocation after final check cannot retract delivered bytes; this normal boundary does not justify a long lock across network.

Two short reads plus bounded buffering is preferable to locking DB rows across Storage latency. Keep the existing gateway protocol and central error renderer, avoiding duplicate envelope logic. Query duplication is deliberate authority fencing, not a caching opportunity. Repair the one fixed envelope mismatch, retain inactive route until strict checks and real-auth clean/held/foreign/revoked/content headers pass Soren fleet Docker. Root/Jules may mirror these simulations to Obsidian; no vault changes here.
