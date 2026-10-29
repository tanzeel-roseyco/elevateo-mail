# Final OIDC repair review

Review performed 2026-10-24 for task `task_092feeb4f873`, dispatch `ctx_509f85ff1066`.
Read-only source review; only this report is written. No tests, builds, provider calls, production actions, commits or nested reviewers.

Verdict: **repairs materially improve the harness, but the earlier R1 attribution defect remains partially open (HIGH)**. Earlier R2's unusable-fallback defect is repaired at source level. This is a harness evidence finding, not evidence of a production authentication bypass.

## Frozen packets

| Packet | File | Lines reviewed | Physical LOC | SHA256 |
| --- | --- | --- | ---: | --- |
| A | `ops/production/authentik/oidc_fixture.py` | 1–96 (entire file) | 96 | `25569a9d401af1922568fa7b2d66d00ed8b5172c96940c862edb56f0bdb0a56b` |
| B | `ops/production/authentik/test_oidc_runtime.py` | 1–101 (entire file) | 101 | `4c3a7d75d31b56666f9582444db1932b471a46ab3efaf42ac0382dc22fc751e9` |

Each packet is below 200 lines. Total unique source coverage is 197 physical lines, including blanks/comments; repeated analysis is nonadditive. **One remaining confirmed evidence defect / 197 LOC = 5.08 defects/KLOC; zero newly introduced independent defects counted.** This report supersedes no historical frozen findings and does not cover other application code.

Project instructions, README, state, documentation and `.planning/STANDARDS.md` informed the restrictions. `launch-authentik-20261023.md` and `launch-authentik-oidc-runtime-review-20261023.md` were evidence context only. Runtime scripts, GoTrue implementation/configuration, private logs and network resources were not reviewed. The implementation document reports v9 passing three tests and private cryptographic diagnostics; that report is not independently inspected log evidence in this review.

## Required review prompt applied verbatim

> Does this code work? Verify that the code actually fulfills the purpose of the feature or bug fix. Check if the author considered null inputs, empty lists, and max limits. Ensure that changes to state or data structures don't inadvertently break other parts of the entire system. Ensure the developer isn't over-engineering or building things they might need in the future but don't actually know they need now. Check that new classes or functions aren't trying to do too much. Look out for duplicated logic that should be extracted into a shared utility or service. Ensure variable, function, and class names communicate their intent clearly. Check that comments explain why something exists, not just what the code does. Look for deeply nested loops or convoluted conditionals that could be simplified to help future developers read it easily. Confirm that unit and/or integration tests are included and directly cover the changed logic or new feature. Ensure the tests cover both the happy path and failure scenarios. Check if the author has updated relevant documentation. Make sure external inputs are sanitised and permission/authorisation checks are properly enforced. Watch out for unnecessary loops, repeated database queries in hot paths, or operations that could cause bottlenecks.

## Remaining finding

### R1 residual — HIGH: collapsed callback error still cannot attribute token rejection

Location: `test_oidc_runtime.py:76–87`, especially 82–84; fixture validation modes originate at `oidc_fixture.py:22–36,69–78`.

Missing token, corrupted signature, wrong issuer and wrong audience all require the same `unexpected_failure` and `Error getting user profile from external provider`. These are now exact assertions, and every attempt must leave the session count unchanged. This excludes arbitrary status/error redirects and accidental persisted sessions, but a token/JWKS/profile failure mapped to the same public error also satisfies the oracle. For example, an implementation that skips issuer validation but suffers a JWKS/profile failure on the issuer case could still pass. The positive control's earlier success does not exclude an individual subsequent request failing for an unrelated reason.

The earlier review explicitly required expected public errors together with private stage evidence where errors collapse. Neither a request ledger nor an asserted private diagnostic exists in these packets. The context's reported logs may support a manually accepted exact run, but their actual contents/source binding were not inspected here, and these tests do not assert them. Preserve the safe public error; add bounded private evidence for the intended rejection stage and a counterexample demonstrating that an unrelated failure cannot pass the security case. State should also be shown to reject before token exchange. Do not broaden public error detail to solve a test-evidence problem.

## Repair checklist

| Area | Source result | Limit |
| --- | --- | --- |
| Exact callback errors | Lines 80–84 require redirect status, exact error code and exact description; state has its own category | Collapsed token failures retain R1 above |
| Session counts | Lines 70–75 establish a nonempty signed-control baseline; line 87 checks it after every denied callback | Disposable single-run/order assumption; global count is not a concurrency-safe identity/session oracle |
| Positive flow | Lines 55–67 require a signed callback code, wrong verifier `400/bad_code_verifier`, then successful correct exchange with access-token field | Token identity/subject not inspected; no provider-side PKCE proof |
| Missing-token ordinary userinfo adversary | Fixture lines 50–58 advertise a separate fallback discovery; 64–65 serve matching verified identity; 75–78 omit ID token for missing mode. Test lines 89–97 require usable fallback code and token exchange | Strict and fallback provider configuration is external; claimed only conditionally on correct configuration |
| Strict discovery | Fixture lines 50–58 omit userinfo on strict discovery while fallback adds it | Distinct fallback issuer deliberately avoids reported issuer-cache collision; it does not validate actual production discovery |
| Signature/issuer/audience | Independent fixture modes modify exactly those values while sharing key/subject/email | Rejection attribution remains R1 |
| State | Issued state is altered at line 53 and exact state error required at lines 82–84 | No token-call assertion, expiry or replay coverage |
| Null/empty/limits | Body cap 8192; response cap 65536; client and SQL timeouts 10s | No explicit empty/null/alg:none ID-token cases; malformed Content-Length/UTF-8 and slow bodies remain fixture limitations, not production parser findings |
| Isolation/authorization | Both entrypoints require disposable opt-in; fixed internal origins and disposable claims | Opt-in is an intent guard, not independent proof of Docker isolation or cleanup |
| Documentation | Context explicitly documents strict discovery, distinct issuer, failed history and runtime limitations | Reported results are not a fresh execution of the frozen source |

The misleading `unsigned` test name at line 69 still describes omission rather than an explicit unsigned JWT; this is recorded as a coverage/naming limit, not an additional defect. Test ordering currently places the signed positive test before the negative test under default unittest discovery. Running the negative method alone intentionally fails its nonempty-baseline prerequisite; no standalone-method independence is claimed.

No new domain abstraction, duplicated business logic, unbounded database hot path or overly complex branching was found. Tiny duplicated base64 encoding in separate disposable executables does not warrant a shared module. Formatting is left to linters. No Python typecheck/lint result was independently established here.

## Dedicated design-tradeoff analysis and counterexamples

1. **Private stage proof versus public detail:** generic safe callback errors avoid leaking identity validation internals. Counterexample: a JWKS outage and wrong-audience rejection produce the same public response; unchanged session counts prove denial, but not the cause. Retain generic responses and correlate bounded secret-free private diagnostics/request evidence rather than exposing token claims publicly.
2. **Strict discovery versus compatibility:** omitting userinfo blocks the missing-ID-token fallback by configuration. Counterexample: reverting to ordinary discovery produces an apparently successful login without a signed ID token; the repaired fallback positive control now demonstrates this alternative is usable. A legitimate OAuth-only provider would also fail strict discovery, which is consistent with this integration's signed-identity requirement.
3. **Distinct issuer versus identical control:** separate fallback issuer avoids the reported discovery-cache collision. Counterexample: reusing one issuer could cause cached strict discovery to make the fallback control fail for the wrong reason. The distinct issuer is justified, but exact external client/provider configuration must still be bound to runtime evidence.
4. **Minimal fixture versus realistic provider:** fixed code modes and permissive userinfo keep token-validation cases small. Counterexample: a provider that accepts every verifier would not be detected here because the fixture never validates an upstream code challenge, verifier, client credential or code consumption. The wrong-verifier test covers client-to-GoTrue PKCE only; **no provider-side PKCE coverage is established**.
5. **Global session count versus per-flow identity:** independent SQL counts catch accidental persisted-session creation cheaply in an isolated serial run. Counterexample: concurrent deletion and creation could preserve a global count. Preserve serial disposable execution or assert flow/user-specific session identifiers if concurrency is introduced; do not build a general test framework preemptively.

Obsidian is unavailable: tool discovery exposed no Obsidian connection. These are static counterexamples, not an Obsidian simulation, measured experiment or vault synchronization.

## Scope and handoff

No frontend edits, local application execution, Docker mutation or production changes occurred. No resources were created requiring Docker cleanup. Only this report changed; central `code-reviews.md`, README and state integration belong to the coordinator under the explicit single-file restriction. Full acceptance, actual provider behavior, pinned-image/source binding, fleet cleanup and deployment remain coordinator-owned. Residual R1 requires owner disposition or narrowly bound private evidence before claiming that every negative specifically exercised its intended validation failure.
