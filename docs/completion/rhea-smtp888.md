# SMTP888 pinned net-smtp type repair

Status: source candidate on `completion/rhea-smtp888`, based on exact integrated `c5a873765a0c29d03f90f2058e17df80ae0b1e8d`. Fleet runtime NOT_RUN for this repair; Soren alone may run Docker on fleet-02 after the auth witness. Commit SHA is recorded in the shared Rhea outbox after commit.

## Evidence and decision

- Soren's exact `651b63a9fdb2` backend Steep receipt (`docs/completion/qa815-evidence/backend-651b63a9fdb2/029-ruby-suites.txt`, lines 1050-1059) reports missing `Net::SMTP#disable_tls` and `#disable_starttls` at `apps/server/lib/elevateo/send_worker/smtp_transport.rb:49`. That call belongs only to `LocalMailpitClient` and occurs before connection. `SmtpTransport#submit` holds remote profiles before constructing this client.
- `apps/server/Gemfile.lock` pins net-smtp 0.5.2 and RBS 4.2.0. [Pinned net-smtp runtime source](https://github.com/ruby/net-smtp/blob/v0.5.2/lib/net/smtp.rb) implements both toggles; [upstream RBS net-smtp signature](https://github.com/ruby/rbs/blob/master/stdlib/net-smtp/0/net-smtp.rbs) omits them and declares only positional constructor arguments. An earlier keyword-constructor attempt produced Steep mismatch. The narrow supplemental RBS therefore matches the actual runtime API without changing transport behavior or weakening remote TLS.
- A default-factory unit test constructs `Net::SMTP` without calling `start` or sending bytes, and asserts both TLS modes are disabled for the isolated Mailpit profile. Existing tests cover synthetic acceptance, ambiguous response without replay, invalid snapshot and remote hold, factory failure, and deadline uncertainty.

## Scope and limits

Files: `apps/server/sig/send_worker/net_smtp_local.rbs` and `apps/server/test/send_worker/smtp_transport_test.rb`; source transport unchanged. No gateway, IMAP, attachment, credential, DNS, external SMTP, or production activation change. The source does not establish a complete remote transport or application acceptance.

Requested Soren gate on a coherent exact integrated candidate: in fleet-02 Docker only, run the existing backend Steep check and focused `test/send_worker/smtp_transport_test.rb` suite; return command, immutable candidate SHA, exit codes, output paths, and task-owned cleanup/absence receipt. Check that the two exact method errors disappear and that the factory regression plus existing happy/failure cases pass. No host test or Docker command was executed by Rhea. Redacted fallback-any warning filenames were requested from Soren; scope remains unresolved until the actual diagnostic is available.

## Review packet

For independent review, read `smtp_transport.rb` lines 1-90 plus new RBS lines 1-8 (98 source LOC) in one packet, and `smtp_transport_test.rb` lines 1-124 (124 test LOC) in a second packet; each is under 180 lines and total is 222 unique versioned LOC. Examine whether the extension merges cleanly with bundled RBS, whether default-factory assertions match pinned runtime flags, and whether local-only profile/remote hold remain intact. Author inspection is not independent review; defect count and density remain unclaimed until reviewer receipt. Formatting belongs to fleet linters.
