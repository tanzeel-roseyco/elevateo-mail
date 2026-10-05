import { z } from 'zod';
import { envelopeSchema, type SendEnvelope, type SendOutcome, type SendProvider } from './ports';
import { providerRequest, type ProviderFetch } from './http';

// AIDEV-NOTE: Resend idempotency keys last 24h; the durable ledger owns retries and never replays unknowns.
export class ResendProvider implements SendProvider {
  constructor(private readonly token: string, private readonly verifiedFrom: string, private readonly liveEnabled = false,
    private readonly fetcher: ProviderFetch = fetch) {}
  async send(input: SendEnvelope): Promise<SendOutcome> {
    const e = envelopeSchema.parse(input);
    if (!this.liveEnabled) return { status: 'rejected', code: 'live_disabled' };
    if (e.kind !== 'campaign' || e.from !== this.verifiedFrom) return { status: 'rejected', code: 'route_forbidden' };
    // AIDEV-NOTE: Bounce receipts identify one message, so suppression requires exactly one recipient per send.
    if (e.to.length !== 1 || e.cc.length || e.bcc.length) return { status: 'rejected', code: 'recipient_shape_unsupported' };
    if (!/^[\x21-\x7e]{1,8192}$/.test(this.token)) return { status: 'rejected', code: 'credential_invalid' };
    const response = await providerRequest(this.fetcher, 'https://api.resend.com/emails', {
      method: 'POST', headers: { Authorization: `Bearer ${this.token}`, 'Content-Type': 'application/json', 'Idempotency-Key': e.id },
      // AIDEV-NOTE: Opaque immutable ID correlates signed receipts after a lost HTTP response; it grants no authority.
      body: JSON.stringify({ from: e.from, to: e.to, cc: e.cc, bcc: e.bcc, subject: e.subject, text: e.body,
        ...(e.resendReplyTo ? { reply_to: e.resendReplyTo } : {}),
        tags: [{ name: 'elevateo_intent_id', value: e.id }] }),
    });
    if (!response) return { status: 'unknown' };
    const parsed = z.object({ id: z.string().min(1).max(256) }).safeParse(response.body);
    if (response.status >= 200 && response.status < 300 && parsed.success) return { status: 'accepted', providerId: parsed.data.id };
    return [400, 401, 403, 422].includes(response.status) ? { status: 'rejected', code: `resend_${response.status}` } : { status: 'unknown' };
  }
  async reconcile(): Promise<SendOutcome> { return { status: 'unknown' }; }
}
