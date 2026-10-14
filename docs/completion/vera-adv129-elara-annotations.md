# ADV129 — cancel annotations and Drain mock loading

Exact commits 6af7df4e77528f1323d7593c3eabae6f91107154 and 2b310d13506b71bbebb522289f71b6b5fba9b202, verified in completion-elara-send811. Static only; no tests, Docker, edits to implementation or runtime PASS.

Coverage: at 6af7df4 send_intents_controller.rb 1–36 (36), write_controller.rbs 1–14 (14), write_controller.rb 1–53 (53); at 2b310d1 drain_test.rb 1–39 (39). Parent exact diff cancel controller 21–30 (10), Drain test 1–6 (6). Total 158 unique versioned source LOC; largest read 89, below 180. Defects 0; density 0/158, 0/KLOC.

Controller blob 6fd57324564a2cab7466cdc339e0c67aae5fd8a4; WriteController RBS blob 3eefe865d1a0926f23bb3c7fdc3d3b6f2010d806; Drain test blob 034fb43a14b9bf463199dded24a568c029a25af6.

All three added cancel annotations exactly match the protected_write yielded signature: WriteStatements connection, SessionIdentity identity and auth_object session. The actual wrapper authenticates identity, passes connection/session from SessionWrites.transaction, and yields the same values to the action. These are specific type declarations, without ignore/untyped casts or changed runtime branches. UUID/body/query checks, 4096-byte request bound, authenticated protected transaction, context/version/CSRF, session digest and epoch forwarding remain unchanged. Status serialization/error propagation in the wrapper remains unchanged. Authorization/service SQL and cancellation idempotency internals were not reviewed; no new authority or status behavior was introduced by comments.

Explicit minitest/mock require precedes DatabaseStore.stub usage, removing accidental dependency on another test loading that extension. Existing tests retain integer/Float sleeper checks and nil/string/zero/negative/out-of-range/nonfinite rejection cases. No assertion, timeout, mock scope or resource path changed.

Tradeoff: narrow comments are proportional where block keyword inference loses the declared yielded types; a new abstraction or blanket suppression would add scope without improving runtime safety. Explicit loading of the already-used test facility is preferable to implicit suite ordering. No new feature documentation or regression logic is required for a comment-only typing annotation; existing regression checks are unchanged.

Runtime limitations: root supplied earlier 211df76 mock-probe Drain 2 runs/13 assertions PASS, but neither exact successor was executed in this review. No Steep or exact-pin unit closure claimed. SessionWrites implementation, service cancellation outcomes, dependency signatures and broader application tests excluded. Full review rubric applied within scope; style owned by tooling.
