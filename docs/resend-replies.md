# Resend reply correlation

Optional deployment configuration `RESEND_REPLY_ENDPOINTS` maps an opaque 24–128 character endpoint ID to `{owner, credentialId, domain, secret}`. Configure only a dedicated receiving subdomain you own and have explicitly approved. Existing root MX records must remain untouched. The shared `in.elevateoco.com` is blocked. Validation requires at least three DNS labels; operators must still verify the domain is a subdomain rather than a registrable public-suffix domain.

Campaign creation resolves this trusted channel from the mailbox credential. The immutable approved message gains a random 256-bit Reply-To address. Only its hash is indexed; the actual address remains in the immutable message envelope. Identical idempotency retries retain the original address. The Resend transport includes `reply_to`.

POST `/v1/resend/replies/:opaqueEndpoint` receives the original signed Resend webhook bytes. The endpoint checks the signature, bounded payload, configured owner and credential, original campaign recipient, immutable token/address, and evidence that dispatch started before the received timestamp. Receipt insertion, campaign stop, and cancellation of waiting sends commit together. Replays are idempotent; changed payloads under the same event ID are rejected. Already in-flight messages cannot be recalled.

A signed provider receipt proves delivery to the channel, not the identity of the sender. Someone knowing the secret reply address and spoofing the original sender can stop that campaign recipient, but cannot send mail, mutate consent, or access account data through this endpoint. Never log correlation addresses or webhook secrets.

This slice does not populate an inbox, fetch attachments or message bodies, configure DNS, or activate live multi-step sequences. Real sequence activation remains disabled pending full operational reply-channel setup and acceptance testing. Configuration and test transports require no live credentials.

Official references: [receiving custom domains](https://resend.com/docs/dashboard/receiving/custom-domains), [receiving webhook metadata](https://resend.com/docs/dashboard/receiving/create-receiving-webhook), [send API reply_to](https://resend.com/docs/api-reference/emails/send-email).
