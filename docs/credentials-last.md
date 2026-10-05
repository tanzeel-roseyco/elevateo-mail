# Final configuration checklist

Do this only after the relevant implementation and acceptance gates in [completion-matrix.md](completion-matrix.md) are satisfied. No credentials have been requested, installed or verified during the takeover. Passing local tests does not enable production.

| Who supplies it | Needed for | Where it belongs |
| --- | --- | --- |
| Operator | Cloudflare account, staging HTTPS domain, D1/queue/storage bindings | Deployment tooling; replace placeholder resource IDs deliberately |
| Operator | Google OAuth web client ID/secret, registered callbacks and ten approved Google subject IDs | Server configuration and secret manager; see [app login](app-login-configuration.md) |
| Operator | Gmail OAuth configuration and a separate stable encryption key | Server only; see [Gmail configuration](gmail-configuration.md) |
| Each user | Google mailbox consent, with sending authorised separately | Google's OAuth screen, never a password form in this app |
| Operator and each user | Resend encryption key; user-owned Resend API key and verified sender | Encryption key on server; API key through private Connections; see [Resend credentials](resend-credentials.md) |
| Operator | Dedicated approved receiving subdomain and Resend event/reply signing secrets | Server endpoint maps; see [events](resend-events.md) and [receiving](resend-replies.md) |
| Each user, optionally | Hunter API key | Private Connections; operator supplies a separate encryption key; see [Hunter](hunter.md) |
| Each Windows user | Existing Claude login and reviewed executable/profile configuration | Local companion configuration; never upload subscription tokens; see [desktop](desktop.md) |
| Release owner, later | Windows signing and Apple signing/notarisation credentials | Restricted release environment, never frontend assets |

Generate independent cryptographic keys for each documented purpose. Back them up separately from the database. Key replacement is a migration, not a routine restart setting. Never paste secrets into chat, commit them, expose them as `VITE_*` variables, or include them in screenshots/logs.

Start with dispatch paused and live sending disabled. Validate sign-in/isolation, one mailbox read, explicit send authorisation, one reviewed test send, unsubscribe, signed events, reply stopping, revocation and uncertain-outcome recovery in staging. Enable each capability separately only after its evidence is recorded. The database pause and deployment pause are independent controls.

Never change the root MX for elevateoco.com, boltloop.co or flooda.co. Existing `in.elevateoco.com` is protected too. Receiving needs a separately approved subdomain. DNS write access is not needed for the implemented read-only planner and must not be granted to the mail Worker.

Codex primary execution, macOS native AI, self-hosted inbox adapters and DNS mutation are implementation gaps, not missing credentials. AMF needs an identified product/API contract first. No key can make an unsupported feature operational.
