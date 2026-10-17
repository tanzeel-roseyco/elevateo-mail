# Nadia independent static review: consent replay fingerprint

Pinned source: `2d191f78e7ebb1f5b3f791c46fe46b29166d2eb1` (`completion-dorian-out804`). No tests, Docker, database, or live actions were run.

## Coverage

- `apps/server/lib/elevateo/campaigns/repository.rb` lines 140–205: 66 unique code LOC, including `replace` validation, fingerprint creation, replay branch, and ledger write.
- `apps/server/test/campaigns/repository_test.rb` lines 115–168: 54 unique code LOC, including same/opposite consent replay tests. Lines 105–114 were displayed as adjacent context (10 LOC).
- Prior parent of repository lines 145–155: 11 versioned context LOC, to check baseline fingerprint shape. Total displayed unique versioned code: **141 LOC**, one read of 132 current lines and one of 11 parent lines. This is within 180 lines per read and 240 assigned/350 absolute unique-line limits. No migration SQL, consent policy, or other repository methods were reviewed.

## Result

**No actionable defect established in this bounded static review.** Defect count **0 / 120 assigned LOC = 0 per 1,000 LOC** (0 / 141 displayed versioned LOC also 0/KLOC). Runtime status **NOT_RUN**.

The producer hashes `[kind, id, expected_version, sorted intent fields, actor, preserve_consent]` (`repository.rb:150–151`). The replay check compares the stored fingerprint before any update (`:153–158`). The test (`repository_test.rb:134–166`) first executes the actual producer for each boolean path, captures the fingerprint from the mutation-ledger INSERT call, then proves same-path replay returns the original result and opposite-path replay raises `operation_mismatch` in both directions. It asserts no lead UPDATE on the rejected replay. An older producer omitting the boolean would make the opposite path hash identically; the rejection assertion would fail. The witness does not rely on a hardcoded six-element substitute. The immediate pinned parent also contains the six-element fingerprint, so this review does not establish when that prior repair first landed.

The method requires a boolean flag, rejects `preserve_consent` on non-leads, validates integer version and actor UUID, and reuses the existing idempotency ledger. The two-path test covers the happy replay and likely opposite-path failure. This is a fake-connection unit witness: it cannot establish PostgreSQL constraints, transaction rollback, policy behavior, or execution on fleet. Dorian's relevant documentation appears in commit metadata but was outside this source slice. Styling is delegated to linters. Remaining work is Soren's fleet-only runtime validation and Ada's separate SQL/policy review.
