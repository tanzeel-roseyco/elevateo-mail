# REV883 independent static review: private Storage response regressions

Reviewed Nadia exact `518fd712e497d087125cab3b78bffc2ef44beb98` in `completion-nadia-send810`; Cassian import `651b63a` has identical test and production Git blobs. The regression packet in `docs/completion/nadia-adv115-storage-regressions.md` named the exact ranges. Reviewer runtime identity: Codex `gpt-6-sol`, task `task_5d3e553ab348`, dispatch `ctx_8ccdbdd6bf5a`. No Felix application test, Docker, network call, benchmark or live operation was run.

## Coverage and density

| Versioned source | Numbered lines | Unique LOC | Git blob |
| --- | ---: | ---: | --- |
| Nadia `apps/server/test/attachments/service_test.rb` | 68–86, 292–324 | 52 | `fd0d8c9bddffe76aaecf568ef09b670e8e91ceb6` |
| Nadia `apps/server/lib/elevateo/attachments_storage.rb` | 62–106 | 45 | `23c1dab1c2b793d9246a6ed1a5a7cac6f1427d74` |
| Historical production before `8192bbc98af9ee017f1d09e08abba89dddb5582a` | 70–77, 89–103 | 23 | `a8ecb04e343100081390cd1b33a5c5e2d8cde740` |

Current packet: **97 unique versioned LOC** in one 97-line read. Historical comparison: 23 additional versioned LOC in a separate read, **120 total unique versioned LOC**, each read below 180 and aggregate below 350. The `518fd71` parent production blob is identical to the current production blob, so its 22-line confirmation was not added again. The zero-context test diff repeated lines in the current test packet and likewise was not double-counted. **Zero confirmed static defects: 0.00 defects per 1,000 reviewed LOC**. Excluded: rest of `service_test.rb`, Storage constructor/key validation, HTTP server and real private-bucket integration. Runtime status: **NOT_RUN by Felix**.

## Result

The fake `StorageHttpExchange` implements the two Net::HTTP forms the adapter uses: `request(req)` returns a bucket response, while `start { |session| session.request(req) { |response| ... } }` yields the object response (test 70–85; production 65–75 and 80–101). `Net::HTTP.stub(:new, ...)` confines the replacement to each test block, and `paths` records whether the object endpoint was reached. There is no shared fake network state outside those blocks.

The nil-body test supplies a real status-200 `Net::HTTPOK` whose `body` is nil and asserts `PrivateStorage::Unavailable` plus only the bucket path (test 294–306). Current production checks `body.is_a?(String)` before parsing and stops at `private_bucket?` (production 73–77). The older implementation before `8192bbc` used `response.body.to_s` for size but then `JSON.parse(response.body)`; `JSON.parse(nil)` would raise `TypeError`, outside its rescue list, so this test would fail that prior behavior. It specifically covers the nil branch, not merely a generic unavailable response.

The 403 object test supplies a private bucket response, then a real `Net::HTTPForbidden` with an instrumented `read_body` method (test 308–324). Current production checks `expected.include?(response.code.to_i)` before `read_body` (94–98), so it raises a generic `Unavailable` without buffering. The older implementation read the object body before checking the saved status (historical lines 91–100); its instrumented method would record a call, making `assert_empty reads` fail. The object path assertion proves the request reached the object branch, while the empty read record proves it stopped before body access. The fake does not silently rescue unexpected exceptions; `assert_raises` requires the specific adapter error and both tests inspect its message.

The production packet still uses fixed timeouts, disables retries, bounds bucket metadata and object response size, and does not include tokens or object bytes in errors. These tests do not establish real Supabase Storage behavior or gateway authorization, and they do not add happy-path coverage; those remain with prior suites and Soren's fleet runtime. The small fake has a present purpose, clear names, and no new unbounded loop or hot-path query. Documentation labels the work test-only and runtime pending. No measured latency/memory claim is made.

**Soren request:** execute the affected `test/attachments/service_test.rb` in fleet-02 Docker on exact integrated source, with case/assertion counts, exact SHA, exit status and cleanup. Preserve private-bucket nil and object-403 assertions and the existing happy path. No live Storage request.
