# Nadia OFF406 INV406 R15 / issue 15

Source-only repair of ADV850 over sole parent `07a055263d11851b826719dc222ca6ecb3b8635d`, clean isolated clone `nadia-r15-invitation-deadline`, branch `fix/nadia-r15-invitation-deadline`. Runtime, authored tests, lint and strict typing **NOT_RUN**. BE02 remains unaccepted; BE03 closed and observer OFF. Application completion is primary; root owns integration/acceptance and actual vault. No runtime resources, paid sessions or outbound activity used. Requested gpt-6.1-sol LOW/Fast/YOLO; effective identity/tier/spend unverified.

The approved BE02 decisions, gate disposition and implementation brief bind the unchanged fixture authority. Existing anchors were searched. Only transport, its matching RBS declaration and a dedicated test are changed sources. The deadline helper uses the existing monotonic delivery deadline: reject at equality or later before accumulating each yielded chunk, before JSON parsing, after parsing/object validation, and after link validation immediately before returning the delivered capability. The original byte cap, initial open/read/write timeout calculation, retry policy and outer 90-second watchdog remain intact. Auth issuance without a delivery deadline retains its existing operation bounds. No body or exception detail is added to failures; timeout remains `invitation_delivery_timeout`.

This enforces result acceptance rather than hard interruption at 25 seconds. If time expires in a blocking read, rejection occurs when control returns to a chunk/check; Net::HTTP per-read timeouts do not impose a total request bound. Parsing/link validation likewise run synchronously and are checked after completion. The unchanged outer 90-second watchdog remains the coarse process bound, subject to scheduler and termination latency. No claim of a 25-second hard interrupt is made.

Deterministic authored regressions replace only HTTP/clock/parser boundaries: simulated one-second chunk reads trickle a valid body beyond 25 seconds and must fail before JSON parsing; JSON parsing finishing at equality must fail; final valid-link validation finishing at equality must fail before capability return. On-time valid JSON and the existing byte cap are also checked. No real clock waits or sleeps in the tests. Doubles establish boundary behavior only; real Mailpit/GUI evidence remains pending.

Soren-only commands inside the authorized frozen-source fleet Docker server container, working directory `/workspace/apps/server`:

```sh
bundle exec ruby /workspace/ops/tests/be02/acceptance_invitation_transport_test.rb
bundle exec ruby /workspace/ops/tests/be02/acceptance_invitation_test.rb
bundle exec ruby /workspace/ops/tests/be02/acceptance_invitation_fixture_test.rb
bundle exec steep check --steepfile=/workspace/ops/tests/be02/Steepfile.invitation
bundle exec rubocop --lint --format simple /workspace/ops/tests/be02/acceptance_invitation_transport.rb /workspace/ops/tests/be02/acceptance_invitation_transport_test.rb
```

Existing R14 runner/browser commands, private pairing contract and disposable cleanup policy remain in the R14 handoff. No provenance, permission, oracle or runtime selection change. No local application checks executed. Metadata-only Git diff/bundle verification is separate from application verification.

Reports in wave `reports/nadia-r15-invitation-deadline` include focused diff, concise receipt and parent-prerequisite source bundle. Packet A: whole transport 115 lines; B: dedicated test 88 lines; C: whole RBS 67 lines. Each packet <=200 including packet header; total assignment 276 lines including headers, <=400. Dedicated design assignment combines these clearly divided packets. Root assigns independent full-rubric source and dedicated design reviews; R15 defects/density PENDING, not zero. Author assessment covers correctness, malformed/max boundaries, unchanged authorization/state, limited scope and naming, simple control flow, meaningful regressions, docs/privacy and bounded performance. Formatting belongs to Soren's linter.

Prior independent findings: ADV850 354 unique LOC, one LOW (2.82/KLOC); ADV851 design 380 LOC zero new; ADV852 IO/tests 348 unique LOC zero new; ADV853 runner/cleanup 376 unique LOC zero new. Root's latest inbox accepts ADV854 cleanup/policy: 362 unique LOC zero new (0/KLOC). Coverage overlaps are nonadditive. ADV850 repair is authored and awaits independent re-review/runtime. Consulted Nadia inbox before finalization; no new unresolved finding beyond this repair was present. Original checkouts, frozen source/artifacts and vault preserved.
