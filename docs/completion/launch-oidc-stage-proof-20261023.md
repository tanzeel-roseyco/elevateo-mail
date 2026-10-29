# OIDC exact-run private stage proof

Examined 2026-10-24 for task `task_39f2f9268e70`, dispatch `ctx_b66d1c215bbc`.

Disposition of R1 in `launch-oidc-final-repair-review-20261023.md`: **the existing v9 run supports the intended four token rejection causes; state-before-exchange is supported by the pinned upstream control flow, not a measured fixture call count.** This closes the missing inspection/attribution gap for this bounded historical run. It does not repair the reusable test oracle: future executions still require private-log inspection. No new automated stage assertion or counterexample test is claimed.

## Evidence integrity and binding

Read README.md, state.md, documentation.md, .planning/STANDARDS.md, the Authentik completion report and R1 review. Recomputed SHA-256 locally, without executing application code; these match `launch-authentik-20261023/evidence-sha256.json`:

| Artifact in that directory | SHA-256 |
| --- | --- |
| oidc-v9.log (23,685 bytes) | c492ba1d93a3e359315f2cdc341f8f4115985d72884514c02f4d535238722c79 |
| fleet-oidc-harness.sh | 4364889db308ffeb9098869fe4a7d8f8698616678811c5e299089bf54bcef7d8 |
| source-manifest.json | defd92ea04450b91ed4cb4f5d403a7499495c325b8cb8018444640faf0143176 |

Current fixture and test bytes also match the source manifest and earlier review:

| Review packet | Complete file | Physical LOC | SHA-256 |
| --- | --- | ---: | --- |
| A | ops/production/authentik/oidc_fixture.py | 96 | 25569a9d401af1922568fa7b2d66d00ed8b5172c96940c862edb56f0bdb0a56b |
| B | ops/production/authentik/test_oidc_runtime.py | 101 | 4c3a7d75d31b56666f9582444db1932b471a46ab3efaf42ac0382dc22fc751e9 |
| C | evidence fleet-oidc-harness.sh | 34 | 4364889db308ffeb9098869fe4a7d8f8698616678811c5e299089bf54bcef7d8 |

231 unique local source lines inspected in separate packets below 200 lines; no source changes. Zero additional implementation defects found, 0/231 = 0 defects/KLOC. The previously reported automated-oracle limitation is retained, not counted as newly discovered. Central code-reviews.md and state integration remain coordinator-owned under this task's file ownership.

The harness mounts the staged fixture/test read-only, invokes `/source/test_oidc_runtime.py`, installs two explicit OIDC providers, and pins GoTrue to `supabase/gotrue:v2.196.0@sha256:c0c25187a6b835e65a6f6e6c6b39d090e832d40e6de5186f2c038e0411944232`. Strict discovery omits userinfo; fallback discovery uses a distinct issuer and advertises userinfo. Both use the fixture client audience. The manifest binds the retained source files; it is not an execution-time hash attestation of the remote staged mount. No container image binary-to-source reproducible-build attestation is supplied. These provenance limits prevent a stronger independently reproduced execution claim.

## Exact v9 observations

Line numbers are one-based physical lines in the hash-verified private log. Only secret-free cause descriptions and request identifiers are reproduced; no callback states, codes, tokens, credentials or full log dump are included.

| Case, in serial test order | Log line | Private cause | Request ID |
| --- | ---: | --- | --- |
| Missing ID token | 104 | No ID token or userinfo endpoint available | c9a2d567-061e-41ad-b853-3e6ce1d23684 |
| Corrupted RS256 signature | 108 | ID-token signature verification failed | 73689492-2dac-43ed-987b-2652122be333 |
| Wrong issuer | 112 | ID token issued by a different provider | 01223027-666a-4ed6-bc55-4641dafa46b7 |
| Wrong audience | 116 | Token audience does not match an acceptable client ID | f6cc2c40-d638-4204-aff0-523d5ff7f246 |
| Altered state | 120-121 | Invalid OAuth state; callback completed with 303 | 28b506a6-110c-433b-ab0c-7915585fbd92 |

Each token rejection has a distinct request ID and its intended private cause, despite the identical safe public callback error. These are positive diagnostics, not an inference from absence of sessions or log entries. Mapping to cases uses the serial loop order and unique diagnostics; the fixture does not emit a per-case correlation ledger. Lines 8-10 report three tests passing in 0.591 seconds. The retained test requires a nonempty signed-control session baseline, an unchanged count after every rejected callback, exact public errors, a wrong-verifier failure followed by successful correct exchange, and a usable ordinary-userinfo fallback. Those assertions support denial and control usability, not cryptographic attribution by themselves.

## State ordering and its limit

Inspected official version-tagged upstream sources over HTTPS, without running them:

- [api.go](https://raw.githubusercontent.com/supabase/auth/v2.196.0/internal/api/api.go), lines 210-216: callback routes install `loadFlowState` before the callback handler.
- [external_oauth.go](https://raw.githubusercontent.com/supabase/auth/v2.196.0/internal/api/external_oauth.go), lines 31-58: state-load failure redirects and returns the error. Lines 115-126 place provider token exchange in the later OAuth callback path.
- [external.go](https://raw.githubusercontent.com/supabase/auth/v2.196.0/internal/api/external.go), lines 525-542: malformed UUID state returns the invalid-state error before database state loading. Lines 160-170 enter OAuth handling only inside the callback handler.

The local test appends a character to the issued UUID state, matching that malformed-state branch. Thus the observed state diagnostic plus the version-tagged route/control flow support rejection before provider token exchange. **The v9 log alone does not measure zero outbound token calls.** Its `/token` request entries concern GoTrue's client token API, not an IDP request ledger, and must not be used as that proof. This is source-supported ordering conditional on the recorded pinned image/configuration, with the provenance limits above.

Fetched UTF-8 source-content SHA-256 (for reproducibility; no source copy added): api.go `1f5f067546f6b7dc472705d4c8e7f45dd1b0b2421339a780fc5f23162e977222`; external_oauth.go `07155c602d2670874294c830bc0f98436fb6722ea3b7687533f63a140f4d7ccd`; external.go `0f28c02b0f6bc96c87c9582b7520f8e884528501f7d20e89acee29b5b500d999`. Only the specified source slices informed ordering; no whole-upstream audit is claimed.

## Counterexample and design disposition

An unrelated token endpoint outage or JWKS failure can satisfy the current generic public-error/session-count assertions. It cannot satisfy this exact-run manual evidence criterion for issuer or audience: the matching private diagnostic must identify that expected cause. An outage diagnostic, missing diagnostic, wrong sequence or ambiguous parallel execution would leave attribution unproved. This is an analytical counterexample, not an executed mutation test. The observed explicit signature, issuer and audience diagnostics exclude that counterexample for these recorded requests.

Retaining safe public errors and accepting the bounded private evidence avoids changing production behavior or adding fixture machinery solely to rerun an already informative serial test. If automated repeatability or directly measured state zero-call proof becomes required, add a private allowlisted request counter plus per-case diagnostic assertions and an unrelated-failure regression; the present tests do not provide those guarantees. No provider-side PKCE, expiry/replay, alg:none, null-token or concurrency coverage is added by this inspection. Global session counts retain their serial-disposable-run assumption.

Obsidian was not used; no connected-vault simulation or synchronization is claimed. This report provides static tradeoff/counterexample reasoning only.

## Execution, cleanup and activation

No tests, builds, dependency installs, Docker mutations, provider calls, live production changes or mail sends were performed by this task. The existing harness acquires the specified fleet Docker flock, uses an internal task network and tmpfs database, inspects mounts before exact container removal, and checks exact container/network absence. v9 line 133 records `CLEANUP_EXACT_ABSENCE_PASS`; that is historical cleanup evidence, not a fresh fleet inspection. This task created no disposable Docker resources and reclaimed no Docker space; shared resources were untouched.

Only this report was written. Production SSO is not activated or accepted by this report; identity/provider configuration, deployment and coordinator acceptance remain separate.
