# BE-02 pinned Auth research delta

2026-10-12; primary-source inspection only. Runtime claims below remain unverified against our image. No Docker or consultation launched.

<!-- AIDEV-NOTE: Tagged upstream source guides experiments; it does not attest the deployed image binary or config. -->

## Local pin and configuration

`compose.yaml` pins `supabase/gotrue:v2.196.0@sha256:c0c25187a6b835e65a6f6e6c6b39d090e832d40e6de5186f2c038e0411944232`. Rails internal Auth URL is `http://auth:9999`; JWT audience is authenticated, configured issuer `http://localhost:9999`, lifetime 3600 seconds and shared secret from environment. Signup is disabled; email enabled, autoconfirm false; SMTP is Mailpit. No credentials were read or copied. Verify effective image/config in future Docker evidence, including session/rotation defaults not explicitly overridden by Compose.

## Evidence and implications

| Primary source | Inspected behavior / bounded conclusion |
| --- | --- |
| [v2.196.0 routes](https://github.com/supabase/auth/blob/v2.196.0/internal/api/api.go#L247-L262) | `/token` is separate from authenticated `/user` and `/logout`. Direct Auth paths lack the gateway `/auth/v1` prefix. Local mail paths configured with that prefix require an actual proxy/facade routing decision and integration test. |
| [Password/token handler](https://github.com/supabase/auth/blob/v2.196.0/internal/api/token.go#L36-L195) | Supports password, refresh_token and PKCE grants; password path checks provider, credentials, ban and confirmation, then issues tokens. Candidate login is Rails-to-Auth password exchange for legitimately provisioned confirmed invite-only users. Onboarding/recovery must also work; provisioning a confirmed test user alone does not prove that browser flow. |
| [Authentication middleware](https://github.com/supabase/auth/blob/v2.196.0/internal/api/auth.go#L17-L151) | Parses bearer JWT, loads user and rejects banned users. If session_id is supplied and non-nil, missing session is rejected. Absent/nil session_id skips lookup. This source does not establish that every JWT accepted by middleware represents a live session; Elevateo must reject absent session identity. The shown parser config does not itself request issuer/audience validation; define explicit Elevateo checks. |
| [User handler](https://github.com/supabase/auth/blob/v2.196.0/internal/api/user.go#L58-L73) | GET checks audience against request audience and returns user. With middleware it is a candidate online revocation check for normal issued session tokens. It does not return a complete expiry-policy decision. Do not claim generic SDK getUser semantics establish all local policies. |
| [Logout handler](https://github.com/supabase/auth/blob/v2.196.0/internal/api/logout.go#L18-L68) | Default scope is global; local and others are explicit alternatives. Success is 204 after transaction. Browser contract must select scope deliberately and handle uncertain upstream response; cookie deletion is not evidence all remote sessions were revoked. |
| [Session model](https://github.com/supabase/auth/blob/v2.196.0/internal/models/sessions.go#L201-L217), [deletions](https://github.com/supabase/auth/blob/v2.196.0/internal/models/sessions.go#L332-L342) | Model validity includes not_after, timebox, inactivity and low-AAL policy. Logout deletes the selected session rows. Row existence alone is insufficient to assert all expiry constraints. Direct auth-schema access would introduce a new privilege/coupling boundary; it is not authorized merely because these fields exist. |
| [Token service](https://github.com/supabase/auth/blob/v2.196.0/internal/tokens/service.go#L172-L265) | Refresh checks banned/missing-session/validity state and serializes token access with bounded retries. The service also exposes an access/refresh-token fragment response helper (lines129–140), so onboarding must explicitly avoid an implicit token-fragment browser flow. No provider token belongs in browser storage. |
| [Official sessions guidance](https://supabase.com/docs/guides/auth/sessions) | JWT expiry and server session lifetime are distinct. Offline JWT validation can outlive logout. Refresh reuse exceptions exist for concurrency/lost responses; documented default reuse interval is 10 seconds. These are guidance, not verified effective settings of our pinned container. Avoid unbounded retries or relying on the reuse interval as a distributed lock. |

## Research delta for consultation

The initial foundation principal/tenancy design does not implement HTTP sessions. The new evidence supports evaluating online `/user` checking, but narrows the claim: require session identity and separately settle session-policy expiry and issuer validation. Prefer application-owned opaque session state as a candidate to hold refresh credentials, context, CSRF and local revocation; do not accept it without resolving refresh serialization, outage recovery and remote revocation races.

There is no atomic transaction across Auth HTTP and Rails application reads. Synthesis must define what immediate revocation means for requests already in flight and prove the chosen consistency boundary. A second check reduces a race but does not eliminate it. Membership/version checks need a coherent database snapshot/locking protocol, not independent cached reads. Do not grant broad Auth-table access to make a test pass.

## Required pinned-image experiments (not run)

1. Provision synthetic users through supported Auth admin API; reject signup; complete invite/recovery through Mailpit and the real browser callback path. Record version/digest/effective nonsecret policy.
2. Issue real tokens; check `/user` before/after local/global/others logout, ban and expiry; test missing/nil/foreign session identity under an isolated controlled signing fixture. Assert Rails issuer/audience/algorithm/expiry checks independently. Never log tokens.
3. Refresh concurrently and after a lost response; replay within/outside effective reuse policy; race logout and refresh. Assert no resurrected local session and bounded recovery. Inspect both upstream state and Rails durable state.
4. Expire not_after/timebox/inactivity using supported configuration/controlled clock or documented fixture mechanism; compare `/user` and refresh results. Do not mutate Auth internals as normal application behavior.
5. Revoke membership during mailbox/detail/search reads and operation lookup; switch org during in-flight responses; verify generic errors, context/version rules, no stale serialization and FE invalidation.

Upstream tag inspection is not a source-to-image provenance attestation. Capture image-reported version and platform digest during execution; any source/runtime discrepancy blocks acceptance. Exact refresh reuse branches/default config and invite/PKCE callback details need targeted inspection and experiment when synthesis selects that flow; they are not silently considered resolved here.
