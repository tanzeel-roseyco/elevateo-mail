# ADV157 — attachment fixture heredoc repair

Exact successor: be921687f3a8e8a2a2ef3995ac2275650c6c583b; parent 31b3a37c91bed87bd52cf995df320e6a1d9cc6c9, completion-nadia-send810. Source-only; runtime NOT_RUN. No host tests, builds, or edits.

Confirmed successor defects: 0. Density: 0 / 50 unique versioned source LOC (0 per 1,000 LOC).

The repair separates bind-array assembly from the heredoc call in both insert helpers. For insert_stored, all nine positions remain organization, mailbox, thread, message, attachment ID, storage key, filename, byte count, and checksum. These match SQL $1–$9 in the same order; the constant content type and pending_scan verdict remain SQL literals. For insert_rejected, all five UUID positions remain organization/mailbox/thread/message/attachment and match $1–$5; rejected metadata and zero byte size are unchanged. Both heredoc calls now complete their arguments on the introducer line and immediately begin SQL body lines. This removes the original continuation-line ambiguity without interpolating values into SQL or changing storage/authorization behavior.

The bounded neighboring heredocs use the same complete-introducer structure and retain their parameter ordering: the initial message lookup binds three scope IDs, count query binds four, and per-attachment query binds attachment ID followed by four scope IDs. The change is proportional and avoids an unnecessary helper or abstraction. Its local values variables do not escape or alter callers. Malformed/missing scope, underlying constraints, storage cleanup, and complete fixture transaction semantics were not certified in this narrow syntax review.

Historical evidence is preserved: the earlier fleet fixture-unit attempt failed with SyntaxError at line116 before any cases ran, and REV935's static review missed that error. This successor is statically plausible repair, not proof that Ruby parses or that tests pass. Soren's exact-pin ruby-c and unit run remain required. ADV155's guard-test review covered a different bounded region and made no runtime PASS claim.

Coverage: tests/acceptance/qa816-attachments-seed.rb current 59–64 (6 LOC),105–127 (23 LOC),129–146 (18 LOC): 47 LOC; parent removed 109–110 and120 (3 LOC). Total 50 unique versioned source LOC. Unified-zero diff adds overlap current ranges counted once. Each source read below180 and total below200. No other code or tests read. SQL execution, schema compatibility, private transport, and fixture runtime excluded.
