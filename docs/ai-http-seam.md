# AI context and draft HTTP seam

`src/data/http/aiGateway.ts` validates the existing authenticated context and draft endpoints. It has no AI-generation, approval, sending, credential or process methods. Use the shared account-bound HTTP client when mounting a consumer.

- Context requires a selected mailbox and 1–20 explicit message IDs. Responses retain the untrusted-email marker and a 100,000-character limit; email text is data, never instructions. Missing/deleted messages may be omitted by the server.
- Draft saving fixes kind to `ai`, validates recipients/content and requires a caller-owned idempotency key. No automatic retry or random-key replacement occurs. Saving a draft is not approving it.
- The caller must persist the key before submission and reconcile uncertain results using existing lookup/recovery. The adapter does not persist message content or keys.

The Assistant screen now lets an authorised user explicitly select mailbox context and review a manually prepared draft. AI-kind draft saving uses the account-bound submission and stable-key recovery path. Session expiry clears private context and draft state immediately. The screen clearly states that automatic generation is unavailable until the local CLI connection is implemented. Live Resend dispatch currently supports campaigns, not AI drafts. A functioning local CLI adapter and native containment remain separate gates described in `local-ai-bridge.md`. These HTTP methods do not prove any AI is connected, or that a generated draft can be sent live.

Gateway tests cover selected context, malformed/unsafe responses, normalization and stable-key retries, invalid content, and permission denial. Docker validation is performed by the integration task; no host tests were run for this slice.
