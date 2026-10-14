# ADV127 — gateway strict successor

Exact commit 8c58bc69e4913d878a87e7d3e32771a91b33a868. Static only; no tests/Steep/Docker or implementation edits.

Coverage: successor attachment_gateway_client.rb 24–83 (60); RBS 8–19 (12, including diff context); gateway_client_test.rb 9–51 (43),107–122 (16). Parent diff Ruby 29–38,63–68,70–78 (25); RBS 14–19 (6); test 9–16,107–113 (15). Total 177 unique versioned source LOC. Largest read 126; all below 180. Metadata not source. Successor blobs: Ruby 6018cb8686e63775a6b606ddfc0f12d66830e8e6; RBS fd6c7ae070fc20cdeae24c253006ee09378a5a17; test 6107f274147f1efe91bab24a581c1b9f21ff014c.

Confirmed new defects: 0; density 0/177 LOC, 0/KLOC. ADV126 constructor trigger statically closed: SlowHttp.new now passes the required host/port to inherited Net::HTTP factory, and initialize(host,port) forwards to superclass. Prior failed runtime remains historical evidence, not a successor execution receipt.

Optional transport is captured once locally, allowing reliable nullable refinement without a second instance-variable read. Injected callback still receives the original Numeric timeout. Conversion to Float affects only exchange/socket settings after positive and <=5 validation; original Numeric aggregate Timeout and monotonic deadline remain outside conversion. No timeout bound is increased or response-byte path introduced by the typing repair. Exotic Numeric conversions and precision were not runtime exercised; Float representability does not remove the original aggregate guard.

The response tuple is assigned only after complete bounded body consumption. Exceptions leave the local result nil and propagate through http.start cleanup; no-response explicitly raises Unavailable. Normal tuple now returns after the start block completes, so response validation and byte release occur after connection cleanup. MAX_BYTES check remains before each append; status/header/declared-length checks remain before final frozen binary return. Empty bodies remain rejected by length and size validation. Exact private URL/key guard, no retries and caller fresh-authorization responsibility are unchanged.

The fake's consumed protocol stays in process: start yields self with ensure close, request creates its Net::HTTPResponse subclass without network, read_body yields timed strings. Its preliminary response assertion does not consume chunks. Timeout regression retains at least one but fewer than twenty chunks, closed flag and elapsed time bound; no assertion weakened. Focused new nil/no-response and socket conversion regressions were not added in this patch, so those branches have source proof only within this review.

Tradeoff: local refinement and a typed nullable tuple are smaller than introducing a transport abstraction solely for checker inference. Keeping concrete subclasses requires correct inherited factory/constructor semantics; those are now explicit for the consumed test path. Full unused Net::HTTP emulation is unnecessary. No new untyped mask or changed security policy.

Excluded: dependency signatures/implementation, actual six-diagnostic closure, full successful socket integration, outer constructor/constants lines omitted from this assignment, authorization/signing internals and broader tests. No runtime, visual, unit or Steep PASS claimed. Full review rubric applied within scope; formatting delegated to tooling.
