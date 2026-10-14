# REV868 bounded static review: Cassian V2 sequence browser adapter

Reviewed exact Cassian `251546499f6f3d72dcdcefeb08584f7607b6a97b` in `completion-cassian-int801`. The worktree had moved to `310564c9adbd9bec9d0f40d477d1f28692fded5f`, so every numbered source read used `git show` at the requested commit. Reviewer runtime identity: Codex `gpt-6-sol`, task `task_a70da6a6c866`, dispatch `ctx_656af8c77d73`. Static review only; Felix ran no application test, Docker, browser, benchmark, or live operation.

## Exact source coverage

| Source at 2515464 | Lines read | Unique LOC | Git blob |
| --- | --- | ---: | --- |
| `apps/web/src/data/v2OutreachGateway.ts` | 1–98 | 98 | `b2486f622ff2288fd52870981366919d94a53684` |
| `apps/web/src/data/v2SequenceGateway.test.ts` | 1–59 | 59 | `0dce0a47cc8622c6f348ea88237aeebcdc61abf6` |
| `apps/web/src/features/outreach/sequenceContract.ts` | 1–35 | 35 | `b9c61c93222dbad38549b38659b08f2089f00b66` |
| `apps/web/src/data/http/transport.ts` | 73–105, 126–208 | 116 | `1a114b31003fb27ce625eb11ddd3d4781ba5f3db` |
| `apps/server/app/controllers/v2/outreach/sequences_controller.rb` | 10–30 | 21 | `895caba146048f41fa5e3e90cbd17643f0965c43` |
| `apps/web/src/data/v2Contract.ts` | 1–5 | 5 | `3bce0b224879fc3988f6b8d675b6dde18ea2a14c` |
| `apps/web/src/data/contract.ts` | 214–222 | 9 | `a1f2f0f4be9373077fec215ccef67b87e2666a36` |

Three bounded source reads: 157, 151 and 35 LOC; **343 unique versioned LOC**, below the 350 cap and 180/read maximum. Excluded: transport lines 1–72 and 106–125, V2 error-code definition, remaining server controller/repository, FE864 wrapper pass-through, UI callers and other tests. The small `rg` inventory overlapped these numbered ranges; no additional versioned source was reviewed. **One confirmed static test-oracle defect / 343 LOC = 2.92 defects per 1,000 reviewed LOC**. Runtime defect count and performance are unknown.

## Finding

**MEDIUM — current-context sequence test does not assert either context header.** `v2SequenceGateway.test.ts` lines 15–27 labels the happy path as using current context and CSRF, but verifies only the CSRF token. `v2OutreachGateway.ts` lines 15–19 and 35–43 currently set `X-Session-Context` and `X-Authorization-Version` for both GET and PUT, yet the test would pass if either were omitted or stale. **Fix:** inspect `fetchImpl.mock.calls` for both requests and assert exact fixture context ID and authorization version, retaining the existing path and CSRF checks. Cassian/root were notified immediately in `msg_9897dc881c25` and `msg_7c6294a78dfc`. This is a proven oracle gap, not a runtime header failure.

## Contract and behavioral assessment

The GET and PUT paths encode a UUID campaign segment, use the shared context headers, and return a `sequenceSchema` parsed value. PUT strictly parses `sequencePutSchema`, rejects a mismatched campaign before dispatch, sends the CSRF proof, and caps the serialized UTF-8 request at 16,384 bytes (gateway lines 35–43; transport 149–155). Contract fields enforce UUID IDs, positive bounded versions, one to twenty consecutive steps, bounded Unicode labels, time, delay, timezone and `draft`/`held` status (sequenceContract 6–28). The 20-step Unicode case proves a legal request above 8 KiB and no more than 16 KiB is dispatched (test 44–58); the server controller uses a 16 KiB body budget (controller 22–30). The response reader also caps bytes at 16 KiB, rejects non-JSON/redirects, maps error envelopes including the 404 `not_available` test, and rejects malformed successful responses (transport 181–198). The test covers happy path, cross-campaign rejection and 404, but does not directly exercise malformed response, bad version, empty/21-step input or an over-16-KiB payload; other suites were outside this packet.

The adapter keeps optional fetch injection isolated and the account ports explicitly unavailable; FE864 optional wrapper semantics were outside this review. No new send/provider activation, unbounded hot-path loop, repeated query or secret exposure appears in the reviewed browser packet. Shared transport and contract parsing avoid duplicate sequence-specific request code. Method and variable names communicate intent; comments explain the inert sequence and byte cap. Runtime context validity depends on the caller's `ReadContext` boundary, and server authorization/version persistence depends on excluded controller/repository lines; no end-to-end acceptance is claimed. Documentation changed in the exact commit, but acceptance still needs Soren's integrated run.

**Soren request:** execute affected frontend sequence adapter tests and type/lint gates on the exact integrated SHA after Cassian's header assertion repair; include boundary cases for response shape, version, 20-step Unicode maximum and over-cap rejection, plus actual context/CSRF headers. Record observed cases and limits; no Felix runtime or measured budget is claimed.

## Bounded repair rereview

Cassian supplied test-only repair `a771017a917f63604d357e622da450d3f2f58012`. I read its exact five added source lines at `apps/web/src/data/v2SequenceGateway.test.ts:26–30` (final blob `550b9cfb3829efa5638bc48455a321d63903a4c8`) with zero-context diff and no other code. The repair iterates both fetch calls and checks `X-Session-Context` and `X-Authorization-Version` against the fixed `context` fixture; the earlier CSRF assertion remains. The original oracle defect is **statically closed**, with zero new confirmed repair defects (0.00/KLOC over five changed lines). Total original-plus-repair coverage is **348 unique versioned LOC** in 157/151/35/5-line reads, still below the 350 cap; original 1/343 (2.92/KLOC) remains historical and is not a current defect claim. Soren's frontend runtime is still NOT_RUN by Felix.
