# ATT823 strict Steep repair packet

Source evidence: Soren's `backend-cb1ec5be4546/028-ruby-suites.txt` in the `completion-soren-qa815` worktree, exact integrated source `cb1ec5be4546` as named by the receipt. The overall backend run failed with 270 Steep problems across 13 files; cleanup passed. This is a source-only repair candidate, not a verified Steep or application PASS.

## Owned repair

`sig/attachments.rbs` declares the service, repository, scanner, storage/authorization/query/socket ports and errors with exact methods and nullable claim/find boundaries. It deliberately does not declare Corin's `PrivateStorage` class or Cassian's gateway/controller. Ruby source narrows database scan claim attempt, SHA, key and size before byte reads/verdict writes; rejects a nonstring due ID; handles nil `byteslice` and closes a socket on all framed reply paths; and uses definite nonnil cursor and counter operations. The malformed-claim regression holds the object before scanner invocation, and the protocol-error regression requires socket close. These changes do not alter scan-state SQL, clean verdict acceptance, grants, routes or mail sending.

Packets for independent source review: `sig/attachments.rbs` lines 1–current end (<150), `lib/elevateo/attachments_scan.rb` lines 1–current end (<130), `lib/elevateo/attachments.rb` lines 1–current end (<90), `lib/elevateo/attachments_repository.rb` lines 1–current end (<70), `test/attachments/service_test.rb` affected malformed-claim section and `test/attachments/clamd_scanner_test.rb` lines 1–current end (<75). Split these into <=200 LOC assignments; overlapping evidence is not additive. No independent review was performed by Nadia on this successor, so no defect count or density is claimed.

## Handoff and limits

Corin owns `PrivateStorage` and IMAP Sync type/source diagnostics; Cassian owns gateway/controller/shared contract and the shared Steepfile library list. `Socket.tcp` may need Cassian to register stdlib `socket` in Steepfile if the next strict run reports it unresolved. Rejected metadata should remain visible with `scan_status=rejected`, `byte_size=0` and no private rejection reason; it is never downloadable. Central README/state/documentation integration belongs to Cassian for this dispatch; Nadia did not edit those shared files.

Soren only, from an integrated exact SHA under the fleet Docker lease: `cd /app && bundle exec steep check`; `cd /app && bin/rails test test/attachments/service_test.rb test/attachments/clamd_scanner_test.rb`; affected RuboCop. Capture exact Steep diagnostics by owner/file and test exits; none were run by Nadia. No host app test, local Docker, live service, credentials, DNS, mail or spend.
