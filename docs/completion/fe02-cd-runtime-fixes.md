# FE-02 C/D runtime fixes (lint + TypeScript) — repair report

Dispatch `task_bc6698ee1afb` / `ctx_bcfe9243f4bb`. Target: `apps/web` on `review/ultra/frontend-reader`.
Input evidence: the frozen C/D Docker stage on fleet-02 (archive `57b2aef6…`, manifest `d4f0bd0a…`),
read from `ops/local/fe02-cd-stage-561fa71d811e467dad2c81c54ffe4c62/{unit-test.log,browser-test.log}`
in the Local Completion checkout. `check:api` passed; lint reported 27 errors; the browser build's
`tsc` exited 2 on one error before any visual test ran.

**Runtime status after this repair: NOT_RUN.** Nothing was executed on the host (coordinator ruling:
all application checks run only in root-owned containers). Root owns fleet-02 execution and cleanup;
authored test status stays NOT_RUN until root provides receipts. No completion of the FE gate is claimed.

## Failures and fixes

| # | Evidence | Cause | Fix (behaviour preserved) |
| --- | --- | --- | --- |
| 1 | `unit-test.log` lines 12–34: 23 × `@typescript-eslint/no-unused-vars` for `_cdError` … `_searchPage` in `src/data/contract-collaboration.test.ts` 64–86 | Compile-time `Mutual<>` type pins were declared but never referenced; `contract.test.ts` avoids this with a single `void [...]` reference | Added the same `void [ … 23 names … ]` reference after the pins. The pins themselves are unchanged, so the two-way generated-type check still runs at typecheck time |
| 2 | `unit-test.log` lines 35–37: `_dropped` (223), `_version` (244), `_v` (253) unused | Rest-destructuring used to drop one key left an unused binding | Added a typed `omitKey(value, key): Omit<T, K>` helper (built with `Object.fromEntries`, no dynamic delete) and used it in the three "required field missing" assertions. The assertions are identical in intent and strength |
| 3 | `unit-test.log` line 40: `no-control-regex` for `\x0b` in `src/data/contract.ts` 402 (`WHITE_SPACE_ONLY`) | U+000B written as `\u000B` inside the character class | Written as the named escape `\v` (same code point). The class still contains all Unicode White_Space members, so a whitespace-only query (including vertical tab) is still refused. Regression coverage added (see below) |
| 4 | `browser-test.log` line 5: `TS2345` at `src/domain/draftOperation.test.ts` 158 | The conflict fixture spread the *applied* record and overrode the discriminant, so the object carried `version` from the applied variant and matched no member of the `DraftOperation` union | Added an exact typed `conflict(operationId, code, expectedVersion, currentVersion): DraftOperation` builder next to `applied(...)`; each variant is constructed field by field, no casts. The test now also reconciles a `draft_consumed` conflict record |

No lint rule or TypeScript option was relaxed, no assertion was removed or weakened, and no source
behaviour changed except the lint-equivalent regex escape.

## Regression coverage added

`src/data/contract-collaboration.test.ts`, test "search text holds 1..256 code points and is never
whitespace-only":
- a `WS` table of White_Space members built with `String.fromCodePoint` (tab, LF, **VT U+000B**, FF,
  CR, NEL, NBSP, LS, NNBSP, MMSP, ideographic space) so no editor or tool can mangle escapes;
- each member alone is refused, all members together are refused, and `VT + 'a' + FF` is accepted,
  proving the control characters are still recognised as whitespace after the `\v` rewrite.

`src/domain/draftOperation.test.ts`, test "conflict surfaces the recorded code and current version":
- additionally reconciles a canonical `draft_consumed` ledger record (`state: 'consumed'`) and
  asserts the resulting conflict status.

## Files changed (SHA-256 of the final content)

| File | SHA-256 |
| --- | --- |
| `apps/web/src/data/contract.ts` | `6e8179015aa47f0afa540f9d5c7cae4872d0f25137b0230a45bce872f45b7d85` |
| `apps/web/src/data/contract-collaboration.test.ts` | `a5be9542ea02cd7ff76c28f8b455aa5fe6149f78d079fb41dc45d6c43749dd4c` |
| `apps/web/src/domain/draftOperation.test.ts` | `45558041e903b0cfd99b53bfa68b9ec280466ee12cb1bfa8da4481eb1850c6de` |
| `apps/web/README.md` | current-state entry updated (see below) |
| `docs/completion/fe02-cd-runtime-fixes.md` | this file |

Tests changed: `contract-collaboration.test.ts` (pins referenced, `omitKey`, whitespace regression),
`draftOperation.test.ts` (typed `conflict` fixture, consumed-record case). No other test, source,
contract, generated file, dependency, harness or backend file was touched. Nothing was committed.

## Out of scope, deliberately

- The design reviewer's draft-recovery findings (context-recovery text loss, consumed-rebase replacing
  local text, expired-operation fresh id) were announced by the coordinator as a separate bounded
  follow-up; nothing in those flows was changed here.
- The broad scenario/regression/GUI gate (Playwright, Puppeteer/Chromium, Selenium, real-backend E2E)
  is a root-owned harness lane; no duplicate harness was created.
