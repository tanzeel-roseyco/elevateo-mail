# Optional Hunter enrichment

Hunter supplies contact details. AI personalisation is separate. No enrichment happens automatically and no contact's consent or suppression changes.

The user supplies their own key. Server configuration defaults off; enable `HUNTER_ENABLED=true` and a canonical base64url 32-byte `HUNTER_ENCRYPTION_KEY` only at final credential setup. One AES-GCM encrypted key per user is stored with revision checking; metadata and removal work even when configuration is disabled or broken.

API (authenticated, account-bound, CSRF-protected):

- `GET /v1/hunter/status`: `{enabled}`.
- `GET /v1/hunter/connection`: `{connection:null|{revision,revoked:0|1}}`.
- `POST /v1/hunter/connection`: `{apiKey,revision:null|number}`; null creates, current revision replaces or reconnects. Returns metadata wrapper.
- `POST /v1/hunter/connection/revoke`: `{revision}`; returns metadata wrapper.
- `POST /v1/hunter/enrich`: `{email,acknowledgeCreditUse:true}`. Email must already belong to the user's contacts. Returns `{source:'hunter',profile:null|{fullName,title,company,companyDomain,location}}`; every profile field is nullable. Results are transient, not automatically persisted.

The server calls only `GET https://api.hunter.io/v2/people/find?email=...`, using a Bearer header. It makes one request, without retries, with a ten-second timeout and 64 KiB streamed response cap. Missing profiles return null; processing restrictions, rejected keys, rate limits and service failures are explicit safe errors. Revoked credentials, removed contacts and expired sessions discard late responses. Keys and complete provider payloads are never returned to the browser.

As documented on 6 October 2026, enrichment costs 0.2 credits on All-in-one plans or 1 Search credit on Data Platform plans per enriched email/domain. Repeated clicks may spend additional credits; the app does not promise free repeats. No live key or paid lookup was used during implementation.

Sources: [Hunter API](https://hunter.io/api-documentation/v2), [Hunter credit accounting](https://help.hunter.io/en/articles/1911617-how-do-credits-work-in-hunter).

AMF remains unsupported until its identity and API contract are established. No domain or DNS permission is granted by this feature.
