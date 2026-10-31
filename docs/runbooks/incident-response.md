# Runbook: incident response

Jeison and Tanzeel handle upkeep and incident investigation together. Callum decides updates and approves production changes, external notifications and recovery cutover. Record an incident owner and second operator before go-live; business-hours and on-call coverage remain to be confirmed. See [the handoff](../handoff/README.md).

## Triage

| Severity | Examples |
| --- | --- |
| SEV1 | Cross-tenant access, credential compromise, mail leaving without approval |
| SEV2 | Service outage, database disk exhaustion, stalled workers |
| SEV3 | Degraded search or one mailbox failing synchronization |

Record UTC time, reporter, affected services and evidence before changing state. Keep logs, private audit exports and mail data in a restricted company incident location, never Git or chat. The location and retention need company approval; do not use a fleet host by default. Fleet-01 is read-only and off limits.

## Containment

The checked-in [production Compose](../../ops/production/compose.yaml) forces outbound hold and [deployment admission](../../ops/production/deployment_settings.py) rejects releasing it. If a future authorized live deployment exists, use its reviewed containment procedure; do not assume editing a shell variable changes running containers. Pause affected workers through the approved operator path and verify effective hold before resuming them.

For a user who still controls a valid session, `POST /v1/auth/logout` accepts `scope: global`, with the required session cookie, CSRF proof and allowed Origin. This is not an administrator endpoint accepting another user's UUID. Inspect `local_revoked` and `upstream_status`; upstream revocation can remain pending. These semantics are implemented in [AuthController](../../apps/server/app/controllers/v1/auth_controller.rb) and [Sessions](../../apps/server/lib/elevateo/sessions.rb).

For compromised access without a usable session, involve the Authentik and application administrators. Do not invent direct SQL revocation or credential-version updates: use a reviewed operation and verify the compromised principal is denied. Mail credential binding includes account, organization, mailbox, version, reference and protocol; changing only one field is not a documented rotation procedure ([binding](../../apps/server/lib/elevateo/mail_credentials/binding.rb)).

## Credentials and provider incidents

Inventory the credentials actually exposed using [credentials-last](../credentials-last.md). Coordinate revocation/replacement with each account administrator. Changing database passwords in the environment does not rotate existing SQL role passwords. The historical `stack.sh init` refuses existing credentials and is not a rotation command. Preserve access for the second operator before rotating shared keys.

For transport abuse warnings, keep sending held, preserve provider evidence, review suppressions and consent, and ask Callum to approve any resumption. Resend is optional; no Gmail, Hunter or AnymailFinder account is implied by the current production assembly. Do not reroute a rejected queue to evade a provider restriction. Treat `unknown` sends as unresolved until reconciliation proves the outcome.

## Recovery and follow-up

Use [disaster recovery](disaster-recovery.md) for an isolated restore. No automatic production cutover or data rollback is authorized. Data access/erasure requests need a verified requester and a reviewed retention/legal process; the repository does not establish that a manual deletion of lead columns preserves all required references and suppression history.

After resolution, record impact, UTC timeline, cause, evidence, containment, recovery and follow-up owners. Jeison and Tanzeel propose the fixes and tests; Callum decides which updates proceed and signs off on the result.
