# Runbook: lost or stolen laptop

Use this for devices containing source, credentials, signing material or active sessions. Jeison and Tanzeel investigate together; Callum approves resulting production changes and public releases. This procedure grants no access to fleet hosts. Fleet-01 is read-only and off limits.

## Immediate response

1. Notify Callum and the second maintainer. Record when the device was last seen and inventory the accounts, files and signing material it could access. Keep sensitive details in the approved private incident store.
2. Ask the relevant account administrators to revoke the device's sessions and credentials. Current application identity is Authentik; Google Cloud is not a prerequisite. Revoke other provider access only when that account was actually present.
3. If the affected user retains a valid application session, global logout is available at `POST /v1/auth/logout` with `scope: global`, the cookie, CSRF proof and allowed Origin. It revokes that session's user, not an arbitrary target user. Check pending upstream revocation. Otherwise use the approved administrator recovery path; see [incident response](incident-response.md).
4. Remove the lost device's authorized access from the actual company infrastructure and source accounts through their administrators. Confirm the inventory first; do not assume fleet-02, Cloudflare or any named provider is the production destination.
5. Rotate exposed secrets using a reviewed plan. Environment changes alone do not rotate SQL passwords. `ops/supabase/stack.sh init` refuses an existing credential file; it is not a rotation tool. Use [credentials-last](../credentials-last.md) to identify application, Authentik, database, storage, mail and backup authority.
6. If signing keys were exposed, ask the signing-account administrator to revoke/replace them. Callum must approve any replacement public release. Coordinate device recovery or remote wipe through the company's approved process.

## Verification and recovery

Review restricted audit records and transport evidence for unauthorized activity. Confirm the revoked principal and connector grants cannot read mail or attachments. Do not automatically resend ambiguous attempts. Follow [disaster recovery](disaster-recovery.md) if data restoration is needed; a recovered old session must not become usable again.

## Baseline to approve before go-live

Record company policy and evidence for full-disk encryption, screen lock, password-manager use, MFA, recovery-key custody, secret retention and two-person account administration. Exact intervals and provider owners are TO CONFIRM with Callum and the company account administrators; the repository does not establish a deployed device-management policy.

Keep secret values, backup archives and exported mail out of source control. Confirm whether laptops may hold any recovery material and how it is protected. Use the [handoff prerequisites and confirmation register](../handoff/README.md) for the actual account inventory; previous lists of Google Cloud, enrichment providers and fleet hosts were proposals, not proof those services are required.
