# V2 isolated integration contract

V2 adds organization administration and inert Outreach interfaces without changing frozen V1 session, read, collaboration or send schemas. `openapi.json` marks each operation as an isolated candidate or disabled proposal. Source-registered candidates use the existing authenticated session, current context/CSRF and tenant transaction boundaries; fleet SQL/HTTP/browser acceptance remains pending. No V2 operation can dispatch mail or connect a provider.

Organization grant GET returns a bounded redacted page with seven effective roles and per-row revisions. PUT cannot assign owner; verified enrollment and owner transfer are separate workflows. The roster GET projects unbound display configuration only, with no email, Auth UUID or mailbox content. Outreach campaign/lead operations remain draft or paused; guarded draft writes are source-registered for isolated fleet verification. Account, consent/suppression, worker and native interfaces are withheld pending owner review.

AIDEV-NOTE: No-live-send is a contract boundary, not a UI toggle. Reject unknown request fields and stale revisions. Authorization must be rechecked inside the transaction after waits.

Runtime browser schemas live in `apps/web/src/data/v2Contract.ts`. Generate OpenAPI declaration types only inside Soren's fleet Docker lane with `npm run generate:api:v2` from `apps/web`; pin output to the exact canonical source and verify schema agreement before adoption. The V2 browser adapter is source-committed but production shell injection awaits fleet checks.

The `contracts/tooling/generate-v2.sh` wrapper delegates to the web package generator. Run it only in Soren's fleet Docker lane, commit the generated declaration with its exact source hash, then run `npm --prefix apps/web run check:api:v2`.

The browser account port reserves `listAccounts(ctx, campaignId, query, signal)` and `getAccount(ctx, campaignId, accountId, signal)`. Both methods reject with `temporarily_unavailable` before network dispatch until campaign-scoped backend authorization is implemented and tested.
