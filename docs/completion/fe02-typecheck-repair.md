# FE-02 typecheck repair — draftOperation.test.ts TS2322

Date: 2026-10-14. Executed by Claude Code worker (model `claude-fable-5`), Orca task `task_2d3d8bd0d7a4`, dispatch `ctx_05aea8e8fd59`. Source-only change; no tests, Docker runs, or remote actions were performed by this worker. Root independently reviews and reruns Docker.

## Failure

Frozen fleet Docker rerun failed before unit/browser execution with TS2322 at
`apps/web/src/domain/draftOperation.test.ts` line 264:

```ts
const nonAdvancing: DraftOperation = { ...applied(attempt.operationId, 3), expected_version: 2, version }
```

The `applied(...)` helper was annotated to return the full `DraftOperation` union, so the spread
produced a union type (possibly the `conflict` variant), making the `version` override an invalid
excess property on non-applied members.

## Fix

The `applied` helper always constructs `outcome: 'applied'`; its return type was narrowed to that
union member. No casts were added; equal/lower-version regression semantics (CORE-01 test at
lines 257–280) are unchanged — only the type annotation and its explanatory comment changed.

Changed region (file is untracked on branch `review/ultra/frontend-reader`, so no git diff exists;
exact before/after):

- Before (lines 51–53):
  ```ts
  // Canonical ledger records, each built field by field for its own union member: a spread from
  // another variant would smuggle foreign fields past the discriminant and fail strict typing.
  const applied = (operationId: string, version: number): DraftOperation => ({
  ```
- After (lines 51–55):
  ```ts
  // Canonical ledger records, each built field by field for its own union member: a spread from
  // another variant would smuggle foreign fields past the discriminant and fail strict typing.
  // `applied` returns the narrowed 'applied' member (not the whole union) so tests may spread it
  // and override same-variant fields (e.g. a non-advancing version) without widening to a union.
  const applied = (operationId: string, version: number): Extract<DraftOperation, { outcome: 'applied' }> => ({
  ```

All other lines are byte-identical; the file grew from 359 to 361 lines. The `conflict` helper
still returns `DraftOperation` (no spread-with-override site requires narrowing it).

## Evidence

- Pre-edit SHA-256 (per dispatch brief): `701ffe0500913f960947c77f3d7dde28c39070e39c0eb9867ebc98c0a228d346c`
- Post-edit SHA-256: `9ace8db6acd9684d564aa9e70417eac658c33e035c2263889510f6acadee3328`
- Verification: source review only. `Extract<DraftOperation, { outcome: 'applied' }>` resolves to the
  `DraftOperationAppliedSchema`-derived member (`contracts` discriminated union, see
  `apps/web/src/data/contract.ts:266-292`), on which `expected_version` and `version` are declared
  number fields, so the line-264 spread-and-override now type-checks. No typecheck was run on this
  Windows host per task constraints; this does not claim any check passed.
