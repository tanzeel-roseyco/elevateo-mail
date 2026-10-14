# ADV134 — attachment binds and standalone imports

Exact Nadia4557fd734fb1cd27e98d88f34bb339667cc2bfaf in fleet completion-nadia-send810; controller context independently read from integrated215080a4ed74a56f33c06113ea616170443a91f2 in completion-cassian-int801. Source-only; no tests/builds/Docker/nested agents/live operations.

## Coverage / result

Packet counted before source reads: proposed198 LOC; added48 caller LOC, actual246 unique versioned source LOC. Nadia attachments_repository.rb1–65 (65); service_test.rb1–25 (25); sig/attachments.rbs1–82 (82); lib/elevateo/attachments.rb1–48 (48); integrated inbox_attachments_controller.rb20–45 (26). Each packet<=180, total<=250 target. No parent source read. Confirmed defects0; density0/246=0/KLOC.

Excluded remaining service validation helpers, scanner callers, storage/scan require bodies, full service tests, DB functions/RLS, connection contracts outside shown RBS, static typecheck and runtime. The focused repair document was read as prose; its prior failed receipts are supplied evidence, not executions in this review.

## Bind semantics

The repair converts only Integer values using to_s; it preserves Strings and nil. This is truthful serialization for the existing String QueryAttribute metadata and SQL's explicit integer/UUID casts, rather than an authorization-value coercion or broader type assertion. Repository arrays include byte_size, page limit, scan limit and attempt as integer positions; IDs, scope, keys, hashes and verdicts are string positions. Nullable cursor deliberately remains nil so $5::uuid IS NULL retains first-page behavior. Converting nil to an empty string would break it; this patch avoids that.

Actual stage caller supplies generated UUID/key, bytes.bytesize and SHA256 string. Actual list caller enforces integer1–50, validates optional string UUID cursor, authorizes read and sends limit+1 for pagination. Integrated controller validates path IDs and limit/cursor before service and binds authorization callback to exact identity organization/mailbox/thread/message plus read capability. RBS declares scan limits/attempt as Integer and scan IDs/token as String; actual scanner callers were not read. No SQL placeholder order/cast or authorization check changes are claimed beyond the repair packet.

## Standalone test dependencies

minitest/mock explicitly provides stub/mock support; repository require explicitly loads the real constant rather than relying on another test's import order. Reviewed repository top-level requires active_record and attachments, then defines its class. It performs queries only in instance methods; loading this repository introduces no explicit connection establishment/query. Reviewed attachments top level defines constants/classes and requires stdlib only. Complete ActiveRecord and other pre-existing scan/storage dependency loading was not audited; standalone runtime load remains necessary. The excerpt establishes imports, not full happy/failure assertion coverage.

## Tradeoffs and simulations

First page cursor=nil remains SQL NULL; next page UUID remains unchanged. Integer limit51 serializes to string51 then SQL casts back to integer51; bounds remain service-owned. Byte size and scan attempt retain exact decimal value without permissive conversion of arbitrary objects. Invalid UUID string is not made valid by this change; current boundary/SQL rejection remains responsible. Unauthenticated/cross-mailbox access still fails at unchanged authorization/RLS seams, independent of bind metadata.

Use this narrow conversion rather than new numeric bind machinery or a general repository abstraction. It fixes the mismatch at one existing serialization boundary, adds no query/loop beyond the existing map, and the comment explains why text metadata needs decimal values. No new dependency or production storage behavior is introduced. No fresh regression test for bind serialization appears in this packet; meaningful existing repository/DB tests and exact Steep run must verify nil/string/integer behavior. The requested repair is statically coherent, not a runtime PASS.

## Completion proof

Soren fleet Docker: coherent integrated Steep and standalone service/scanner/real-role DB tests, pinned to exact integration; record actual source/DB identity, exit status and task cleanup. In particular confirm standalone load no missing stub/Repository constant, nullable cursor and numeric stage/scan binds. This review does not certify DB permissions, scanner verdicts or private-download completion.
