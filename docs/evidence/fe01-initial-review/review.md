# FE-01 initial static review evidence

Checkpoint: `frontend/fable/fe-01`, based on `ce95e89`, unaccepted authored source. The [source manifest](source-manifest.json) records checkpoint bytes; the [aggregate review ledger](../../../code-reviews.md) supplies findings from all reviewers. This document consolidates completed reviews, without another code audit, implementation-plan acceptance, or a claim that defects have been repaired.

## Method and limits

Every review assignment was at most 200 lines. Formatting was delegated to tooling. Reviewers applied the full user rubric reproduced below and checked applicable standards and the frozen read contract. This evidence is static: this compiling reviewer ran no application tests, browser checks, builds, or visual validation. Runtime evidence must be recorded separately against its tested revision. The dedicated design review was pending at this checkpoint; no Obsidian connection or connected tradeoff simulation is claimed.

The compiling reviewer directly covered the seven slices marked **direct** below (1,239 lines). Other reviewers' detailed results are represented by the aggregate ledger, not independently re-audited here. Generated API declarations (628 lines) and dependency lock contents are excluded from manual review coverage; their inclusion in the manifest does not imply manual audit. Regeneration, resolution and dependency-audit evidence have separate purposes.

## Coverage and density

| Slice | Unique lines | Code/test defects | Source of findings |
| --- | ---: | ---: | --- |
| Transport and HTTP gateway | 151 | 3 | Direct |
| Session and scope | 159 | 1 | Aggregate |
| Shell and Sidebar | 197 | 3 | Aggregate |
| Inbox and App | 187 | 2 | Direct |
| Thread reader and formatting | 181 | 2 | Direct |
| Runtime contract, gateway and errors | 169 | 0 | Direct |
| Fixture gateway, entries, Async and Badge | 162 | 1 | Aggregate |
| Conformance and browser tests | 175 | 0 | Direct |
| Session and contract tests | 180 | 1 | Aggregate |
| Thread tests, scope tests and CSS | 196 | 1 | Aggregate |
| Button, icons, Vite, Playwright and Docker configuration | 186 | 0 | Direct |
| TypeScript/package metadata, HTML, README and provenance | 190 | 0 | Direct |
| **Total** | **2,133** | **14** | |

Code/test defect density is **14 / 2,133 x 1,000 = 6.56 per 1,000 reviewed lines**. Two documentation defects and one lint acceptance gap bring the combined count to **17**, or **7.97 per 1,000 reviewed lines**. The denominator includes the reviewed non-generated source, tests, configuration and documentation; it is not a runtime reliability estimate. Two cursor findings represent separately affected implementations of the same root-cause pattern. Repeated documentation claims are counted once.

## Localized findings

Paths in this table are relative to `apps/web`. P1/P2/P3 correspond to high/medium/low review severity. All are checkpoint findings; no resolution is asserted here.

| ID | Severity | Location and finding | Evidence boundary |
| --- | --- | --- | --- |
| FE-R01 | P2 | `src/data/http/transport.ts:68-69`: registering an abort listener without checking an already-aborted signal still permits the request to start. | Direct static finding. |
| FE-R02 | P2 | `src/data/http/transport.ts:81-94`: normalization catches initial fetch failures, but later body-reader failures, aborts and deadlines escape as native errors. | Direct static finding. |
| FE-R03 | P3 | `src/data/http/transport.ts:89-91`: substring MIME matching accepts deceptive values such as `application/jsonp`. | Direct static finding. |
| FE-R04 | P2 | Session refresh relies on focus/visibility events; continuously visible usage lacks required authorization refresh within 30 seconds. | Other reviewer; summarized in aggregate. |
| FE-R05 | P1 | Shell retains mailbox state across session identity loss/replacement; a new actor's initial render can display old data before effect cleanup. | Other reviewer; summarized in aggregate. |
| FE-R06 | P2 | Mobile modal lacks initial focus, trapping, background inertness and focus restoration. | Other reviewer; summarized in aggregate. |
| FE-R07 | P2 | Mailbox pagination lacks the required single expired-cursor reset. | Other reviewer; summarized in aggregate. |
| FE-R08 | P2 | `src/features/inbox/InboxPage.tsx:55,63-64`: cursor recovery fetches the first page but retains outer append mode, keeping stale rows. | Direct static finding. |
| FE-R09 | P2 | `src/features/inbox/InboxPage.tsx:125,150-155`: an empty page hides continuation controls even with a non-null next cursor. | Direct static finding. |
| FE-R10 | P2 | `src/features/thread/ThreadPage.tsx:55,67-68`: message cursor recovery likewise retains append mode and stale messages. | Direct; shares FE-R08's root-cause pattern in separate code. |
| FE-R11 | P3 | `src/features/inbox/InboxPage.tsx:132` and `src/features/thread/ThreadPage.tsx:97`: opening a thread and returning loses the unread URL filter. | Direct static finding; one cross-file defect. |
| FE-R12 | P1, provisional | Fixture resolver returns a union of operation DTOs instead of preserving operation-specific return types. | Other reviewer; compiler reproduction pending at this checkpoint. Included in aggregate total, not represented as an executed compiler failure. |
| FE-R13 | P2 | Session test helper supplies status 401 for canonical `context_changed` status 409. | Other reviewer; test defect summarized in aggregate. |
| FE-R14 | P2 | Dark theme accent text `#7a6218` against `#25262a` has calculated contrast 2.58:1. | Other reviewer; calculation evidence, browser validation pending. |
| FE-D01 | P3 | `docker/test.Dockerfile:16-17` and `README.md:28-29` falsely claim a runtime production-fixture-isolation test exists in `src/data/conformance.test.ts`. | Direct; repeated claim counted once. |
| FE-D02 | P3 | `README.md:46` says supporting dependencies remain ranges although `package.json:25-38` uses exact pins. | Direct documentation drift. |
| FE-G01 | P2 acceptance gap | `package.json:7-17` has no lint command; `README.md:67` confirms lint configuration is absent. Mandatory lint verification cannot yet run. | Direct; separate from code/test defect total. |

The coordinator retracted a suspected navigation/session-generation finding after inspecting actual invalidation call sites; it is excluded from all counts. Importing `defineConfig` from Vite rather than Vitest was not established as a compile defect and is also excluded. The reviewed Playwright configuration explicitly includes a 390px project and a reduced-motion project.

## Coverage gaps and required evidence

These are gaps in the reviewed test files, not claims that equivalent coverage can never exist elsewhere. They are not additional counted defects.

- `conformance.test.ts:97-109` checks a stalled initial fetch, but not post-header body timeouts, body-read rejection, abort during streaming, or pre-aborted caller signals.
- `conformance.test.ts:87-92` lacks deceptive MIME, incremental oversized-body, dishonest Content-Length and separate 4 KB error-body cases. `:119-126` checks one GET but not encoded paths/query values, context headers, credentials, cache and redirect options. The error-code cases at `:61` omit `request_invalid`; Retry-After handling is not asserted there.
- Runtime schema checks need exact-limit and limit-plus-one pairs, Unicode boundaries, unknown properties, malformed identifiers/timestamps, nullable fields and deeper malformed DTOs. The direct schema review found no confirmed contract drift; that is not proof of runtime library behavior.
- `e2e/read.spec.ts:13-20` uses clicks and programmatic focus rather than actual Tab/skip-link/arrow-key traversal. `:29-33` measures overflow before proving populated content is ready and does not assert its named empty state. Configuring reduced motion does not assert that animations respect it.
- Browser cases must demonstrate Inbox and Thread expired-cursor replacement, empty pages with continuation, unread-filter round trips, session invalidation and delayed response rejection. Page-level state clearing and request abortion need real delayed promises and rendered-state assertions, not only direct calls to an error handler.
- Thread tests do not establish actual browser resource blocking, continuation behavior, or both unavailable cases separately. The fixture adapter's ignored arguments prevent it alone from proving pagination and authorization fidelity.
- `docker/test.Dockerfile:18` runs unit/type/build checks, not Playwright or actual visual QA. Production fixture exclusion needs evidence beyond the static grep and the inaccurate test claim. Real Rails conformance, populated narrow-screen overflow, reduced motion, keyboard accessibility and the 50-row interaction baseline remain distinct acceptance evidence.

## Full originating review rubric

> Does this code work? Verify that the code actually fulfills the purpose of the feature or bug fix. Check if the author considered null inputs, empty lists, and max limits. Ensure that changes to state or data structures don't inadvertently break other parts of the entire system. Ensure the developer isn't over-engineering or building things they might need in the future but don't actually know they need now. Check that new classes or functions aren't trying to do too much. Look out for duplicated logic that should be extracted into a shared utility or service. Ensure variable, function, and class names communicate their intent clearly. Check that comments explain why something exists, not just what the code does. Look for deeply nested loops or convoluted conditionals that could be simplified to help future developers read it easily. Confirm that unit and/or integration tests are included and directly cover the changed logic or new feature. Ensure the tests cover both the happy path and failure scenarios. Check if the author has updated relevant documentation. Make sure external inputs are sanitised and permission/authorisation checks are properly enforced. Watch out for unnecessary loops, repeated database queries in hot paths, or operations that could cause bottlenecks.

## Direct-review file identities

The following SHA-256 values match the recorded direct-review checkpoint and the source manifest. They identify the reviewed bytes, not subsequent repairs. Paths are relative to `apps/web`.

| File | Lines | SHA-256 |
| --- | ---: | --- |
| src/data/http/transport.ts | 108 | `e54951c2c80028197499f67de1fe40ba4c465a68effc4b4387d4056915afbc69` |
| src/data/http/httpGateway.ts | 43 | `afef45bc4eba42f185ebcfd646684121ac32e12b825fc747cc8311745868d8c8` |
| src/features/inbox/InboxPage.tsx | 161 | `0cf49e174cdc9a9b22ffe6ad2c105316216e98bab5205b28325e22763bfecac9` |
| src/app/App.tsx | 26 | `309b883b07f1b1293618eafdb871aa244f2e440e084be31685a92cc0e0173804` |
| src/features/thread/ThreadPage.tsx | 156 | `a2716bafc06b2265db17f1f1b1bf72655b354cbcbabef77d9b4d45a66f9bc9ca` |
| src/lib/format.ts | 25 | `1df91b4ba60277c9236eac72310d405a9c33de477f67b69ed686354aa594a15e` |
| src/data/contract.ts | 111 | `5be1a01b35fa9a7fcd43b82dba8ce89fe42ce6c560a3a4cba3e07a9ae2fc54f9` |
| src/data/gateway.ts | 22 | `00ba496e845bdc804a49163a0a189c8a94c48e6626a41061ef7e22e8ca5ce26e` |
| src/data/errors.ts | 36 | `b05e8a230cac33f7b62c7126ccf8d5b748d4468b154457cff5c599cd21d1b7fd` |
| src/data/conformance.test.ts | 128 | `c9c1136bf5ebdb15c621dd1c97bebe30709c04f35d37c28b705ae19f74aa0a97` |
| e2e/read.spec.ts | 47 | `a390546c06b9dd75f37afd4fac11cdf880b6c045f3dd9c10339263aceaffcc35` |
| src/ui/Button.tsx | 53 | `ca08a7d27aff9fc70cc56b76e1a1d780020696a412e256507a4e9cccd69d44ae` |
| src/ui/icons.tsx | 58 | `c24179e0eef2fe354dfb27c2632d473c4e044cdd26bb115ac16473e6ec7c0353` |
| vite.config.ts | 31 | `8673adabec73b526208bf175093589061c3bdb492784a04179968a92546120ce` |
| playwright.config.ts | 26 | `8fd383b7fa802e1e9ff94e28cec0db29fac8bbd2d9b9dae860d74b857a074ef8` |
| docker/test.Dockerfile | 18 | `1a01a210dfaa134c0a456bffd4d7aafeb51200989100363cc8112d81319d9647` |
| tsconfig.json | 24 | `77c5d7b4c9545e373c84262cd56dcca5c91c6ea5ae4d572634ac50646ebe6508` |
| package.json | 40 | `f5221df32863519d05a62ea5fce365a96dac33d2c3bfab6d3c53bfd5983ad953` |
| index.html | 13 | `4feee5c2172dda95254b7b312d0d549f8741a6f9de4b2c2b8374f48d33de47ae` |
| dev-fixtures.html | 14 | `61ff20cd39bed0d5a8ab975db1c4a671ce240ee2d91e0eedc305989f40533374` |
| README.md | 75 | `d597930a6a4aeba40bcce1d2e08fe260020f41923685dae761e0b48f48657673` |
| PROVENANCE.md | 24 | `a19591d14d725b5d8feb55ee784d9f55b6ab6a33d241de3bde144a97a611a41b` |

## Follow-up reported during evidence assembly

The coordinator subsequently reported an actual Docker run: API regeneration passed, then TypeScript compilation failed with TS2322 at `fixtureGateway.ts:56-59`, confirming FE-R12, and TS2307 at `vite.config.ts:1` for missing `node:url` declarations (`@types/node` absent). No error concerning the Vite `test` property was reported. This compiling reviewer did not execute that run; the coordinator owns its retained log and expanded defect ledger. These failures do not constitute passing unit, integration, build or browser evidence.

The coordinator also reported a new P2 design-review finding: focus-triggered refresh can bypass the exhausted recovery state (`session.tsx:83-86,61,113-116`). That overlapping 181-line design assignment adds no unique coverage to the 2,133 lines above. The new compiler-declaration and recovery findings are follow-up findings outside the frozen initial 17-finding count; the coordinator's updated aggregate is authoritative for subsequent totals. Neither finding was independently re-audited for this document.


### FE-01 Docker diagnostic results

API regeneration passed. Strict compilation failed on FE-R12 and FE-R15. Unit tests: 63 passed, 3 failed out of 66; all failures are retained DOM from previous SessionProvider tests (FE-R17, missing Testing Library cleanup with Vitest globals disabled and no setup hook). These failures prevent validation of the affected session assertions. The separate diagnostic Vite bundle succeeded (148 modules; JS 373.92 kB / gzip 115.76 kB), but does not constitute a passing production build because typechecking failed. Lint, browser/visual checks and real backend integration remain outstanding. See `docs/evidence/fe01-initial-review/unit-bundle.txt`.

All task test containers were automatically removed. The task-owned Node image (332 MB reported image size) was removed; Docker reports zero containers and zero build cache. Pre-existing Playwright/Python images and nine persistent volumes were preserved. Host free space was only 1.42 GB after cleanup; virtual-disk reclaim remains under investigation, so no host-space recovery is claimed.

FE-R17 adds one confirmed test defect. Totals: 17 code/test, two documentation, one lint gap; 20 combined findings across 2,133 unique reviewed lines.
