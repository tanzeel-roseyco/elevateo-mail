# Isolated S1/S2 actual HTTP fixture

Run ONLY in Soren's task-owned disposable pinned BE02 lifecycle after base/bootstrap-send/migration00007, actual Auth/Mailpit/API readiness and source review. Use one immutable integrated SHA:

```sh
bundle exec ruby /workspace/ops/tests/be03/http_s1s2.rb
```

API and fixture environment names: `ELEVATEO_MODE`, `ELEVATEO_OUTBOUND_HOLD`, `ELEVATEO_BROWSER_ORIGIN`, `ELEVATEO_SEND_API_ENABLED`; private fixture only: `BE02_ADMIN_DATABASE_URL`, `BE02_FIXTURE_SIGNING_SECRET`. Required values: local/true/http://api:3000/true. Server additionally needs `ELEVATEO_SEND_CONTROL_PATH` pointing outside database backups to task-owned readable JSON with canonical UUID epoch and `outbound_held:true`. Preserve existing closed recipe secret injection; never copy values into receipts. The canonical contract is `contracts/v1/openapi.json`.

The fixture reuses real Be02Http/Be02Fixture invitation, Mailpit token capture, Auth cookie acceptance and current session proofs. Admin SQL seeds synthetic capabilities and send policy only; all draft/review/approval/status actions use HTTP. A fresh database connection checks each committed scoped count. Expected durable result: exactly one intent, one job and one approved audit, consumed draft without version increment, same-operation immutable replay, queued status with zero attempts/no first-possible timestamp. Negative paths: false attestation, invalid Origin, stale version with same-key conflict replay, and logged-out approved replay. This is a prepared fixture, not runtime evidence until the exact integrated command passes.

No send driver/worker runs. No real transport, provider credential or network outside isolated service endpoints is required. Successful output contains assertion count only; failure output contains fixed codes only. Synthetic fixture rows deliberately retain immutable send history until Soren removes the exact disposable task project/resources, on success or failure. Do not run against persistent databases, truncate shared state or broad-prune resources. Soren owns the DB/heavy lease and independent absence receipt. Preserve sources86036/51ca and Lyra preview18140.
