# SEND-811 SMTP candidate static review — 638f048

Reviewer: Mira worker, task `task_4204c050ad7e`, dispatch `ctx_2ba67ba7cd9b`. Source commit: `638f048`. Scope: isolated Mailpit-only SMTP candidate; active worker still uses the durable local driver. No application test, Docker build, network call, or live send was performed by this reviewer.

## Coverage and limit

I read the full versions at `638f048` of `smtp_profile.rb` (48 LOC), `smtp_transport.rb` (64), `submission_result.rb` (38), two SMTP RBS files (25 and 19), `mailpit_protocol_test.rb` (51), `smtp_profile_test.rb` (32), and `smtp_transport_test.rb` (84): 361 unique LOC. I also read `call_deadline.rb` (23), `send_api/address.rb` (26), and `control.rb` lines 1–23: 72 context LOC, totaling **433 unique code LOC viewed**. I additionally read about 20 lines of `docs/completion/elara.md` for the stated activation boundary. The requested 400-LOC code cap was exceeded by 33 LOC because I initially counted only the four changed `SubmissionResult` lines, although I had opened its full 38-line file. I stopped source inspection when I discovered the mistake. No single read packet exceeded 200 LOC.

All 327 changed code/test/RBS lines listed in `638f048` were viewed. The MIME renderer `smtp_snapshot.rb` (96 LOC) was **not reviewed**; neither were `control.rb` lines 24–63, the active worker integration, SQL, or Docker recipe. Header safety and end-to-end behavior therefore remain unverified by this review.

## Findings

1. **MEDIUM — the total SMTP call is not bounded by the worker deadline.** `smtp_transport.rb:45–54` checks `deadline` before and after `smtp.start`/`send_message`, while only `open_timeout` and `read_timeout` are set to three seconds. Those timeouts do not bound cumulative SMTP protocol time or a blocked DATA write; the call can outlive the 10-second `CallDeadline`, delaying worker completion and lease reconciliation. Keep the remote profile held. For the isolated Mailpit path, enforce a bounded total I/O budget across connect, command, DATA, response, and shutdown using the remaining monotonic deadline; after a possible DATA handoff, classify timeout as `unknown` with no automatic replay. Add a controlled slow/drip or blocked-write test that proves the call terminates within the allocated budget and records uncertainty.

2. **MEDIUM test-oracle gap — the claimed header-injection test contains no CRLF.** `smtp_transport_test.rb:70` uses `"Injected\\r\\nBcc: ..."`, which inserts literal backslash characters, not carriage return and line feed. Its expected rejection can result from corrupting canonical snapshot bytes and does not prove the renderer rejects header injection. Replace or supplement it with actual `"\r\n"` bytes in a hostile subject/display name and assert that no extra MIME header or recipient is produced. Review `smtp_snapshot.rb` separately before claiming the header boundary safe.

The local-only profile validates an exact `mailpit:1025` destination and synthetic `.invalid` sender; a remote held profile raises before a client call. The transport returns `unknown` after a simulated lost DATA response and makes no automatic resend; the existing fake test observes one invocation. These are static source observations, not runtime PASS claims. Null/empty/maximum MIME details could not be confirmed without the renderer review.

## Density and follow-up

Two static findings over **327 changed code/test/RBS LOC = 6.12 findings/KLOC**. The 433 viewed-LOC context is nonadditive and above the instructed cap; this review cannot claim bounded-process compliance. Owner repair and independent re-review are required, followed by Soren's fleet-only unit, strict typing/lint, and isolated Mailpit protocol gate. Preserve the active local driver and remote hold until those results exist.
