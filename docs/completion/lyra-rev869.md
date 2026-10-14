# REV869 — canonical V2 sequence contract static review

Independent static review by Lyra FE808, Codex worker in Orca terminal `term_e324d4a8-6f89-4c59-816b-19ff39caa104`. Exact reviewed source: `contracts/v2/openapi.json` at Cassian commit `251546499f6f3d72dcdcefeb08584f7607b6a97b`, blob `9811af7048fa03e8d5910e2c8fcde98c2da29aa0`; the sequence delta was introduced in ancestor `578baa6` (302 additions, two replacements). No Docker, application tests, host tests, generated-client checks, Rails requests or production operations were run. Formatting belongs to lint.

## Coverage

Three bounded reads inspected exactly `openapi.json:792-918` (127 LOC, sequence GET/PUT path), `:1792-1964` (173 LOC, step/draft/change/error schemas), and `:1-40` (40 LOC, document root and inherited security): **340 unique versioned LOC**. Each read was at most 173 source LOC and total coverage is below the 350-LOC target. The 300 added path/schema lines and the two replaced header lines fall within these ranges; overlapping lines are counted once. The task cap leaves no room for owner schema/code comparison. Excluded: owner Rails validation and persistence, V2 gateway/Zod implementation, route registry, generated declarations, tests, security-scheme definition, other OpenAPI paths, and all runtime evidence.

## Result

**Confirmed defects: 0 across 340 LOC, or 0 defects/KLOC.** This is a bounded contract-source result, not a claim that the endpoint works at runtime.

The document declares root session-cookie security, inherited by sequence GET and PUT because neither overrides `security`. PUT additionally requires `X-CSRF-Token` and a closed `OutreachSequenceChange` object; GET has only a UUID campaign path parameter. GET 200 and PUT 200/201 use the closed read draft shape, while write input separately requires `operation_id` and nullable `expected_version`. The latter is bounded to 1..2147483646 when nonnull; the returned version is 1..2147483647. The contract does not accidentally expose an enrollment, due-claim or send operation.

Steps are bounded to 1..20, with UUID IDs, position 1..20, delay 0..2592000 seconds, `HH:MM:SS` local time, and a nonempty label up to 120 characters/480 UTF-8 bytes. The prose requires positions to equal 1..N in array order; that cross-item invariant and IANA timezone validity are server-side obligations, not expressible by the displayed scalar schemas. Timezone string length is 1..128. The only sequence statuses are `draft` and `held`. Additional object fields are rejected by the displayed schemas. GET 404 and PUT 400/404/409 cite the closed sequence error shape, whose codes are `request_invalid`, `not_available`, `draft_conflict` and `operation_mismatch`.

Open verification items, **not counted as defects**: owner server and gateway must enforce ordered unique positions, actual IANA timezone validity, UTF-8 label byte limit, body-size/time budget and operation replay; they were outside the 340-LOC cap. The contract does not enumerate all infrastructure/authentication error responses (such as missing session, context change, rate limit or server error), but without the excluded common V2 convention and owner implementation this packet cannot establish a mismatch. Tests, runtime validation and no-live-send posture remain Soren/Cassian integration work.
