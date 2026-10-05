import { z } from 'zod';
import { envelopeSchema, type SendEnvelope, type SendOutcome, type SendProvider } from './ports';
import { providerRequest, type ProviderFetch } from './http';

// AIDEV-NOTE: Gmail has no send idempotency contract; reconciliation never resends or infers rejection from search.
export class GmailProvider implements SendProvider {
  constructor(private readonly token: string, private readonly liveEnabled = false, private readonly fetcher: ProviderFetch = fetch) {}
  async send(input: SendEnvelope): Promise<SendOutcome> {
    const e = envelopeSchema.parse(input);
    if (!this.liveEnabled) return { status: 'rejected', code: 'live_disabled' };
    if (!this.token || /[\r\n]/.test(this.token)) return { status: 'rejected', code: 'credential_invalid' };
    // AIDEV-NOTE: Loop over bytes to avoid exceeding the JS argument limit on long UTF-8 bodies.
    const encode = (text: string) => btoa(Array.from(new TextEncoder().encode(text), byte => String.fromCharCode(byte)).join(''));
    // AIDEV-NOTE: Encode small Unicode chunks and fold between encoded words/addresses to meet MIME line limits.
    const characters = Array.from(e.subject)
    const words: string[] = []
    for (let i = 0; i < characters.length; i += 10) words.push(`=?UTF-8?B?${encode(characters.slice(i, i + 10).join(''))}?=`)
    const message = [`From: ${e.from}`, `To: ${e.to.join(',\r\n ')}`, `Cc: ${e.cc.join(',\r\n ')}`, `Bcc: ${e.bcc.join(',\r\n ')}`,
      ...(e.reply ? [`In-Reply-To: ${e.reply.inReplyTo}`, `References: ${e.reply.references.join('\r\n ')}`] : []),
      `Subject: ${words.join('\r\n ')}`, 'MIME-Version: 1.0', 'Content-Type: text/plain; charset=UTF-8',
      'Content-Transfer-Encoding: base64', '', encode(e.body).match(/.{1,76}/g)?.join('\r\n') ?? ''].join('\r\n');
    const raw = encode(message).replace(/\+/g, '-').replace(/\//g, '_').replace(/=+$/, '');
    const response = await providerRequest(this.fetcher, 'https://gmail.googleapis.com/gmail/v1/users/me/messages/send', {
      method: 'POST', headers: { Authorization: `Bearer ${this.token}`, 'Content-Type': 'application/json' }, body: JSON.stringify({ raw, ...(e.reply ? { threadId: e.reply.threadId } : {}) }),
    });
    if (!response) return { status: 'unknown' };
    const parsed = z.object({ id: z.string().min(1).max(256) }).safeParse(response.body);
    if (response.status >= 200 && response.status < 300 && parsed.success) return { status: 'accepted', providerId: parsed.data.id };
    return [400, 401, 403, 404].includes(response.status) ? { status: 'rejected', code: `gmail_${response.status}` } : { status: 'unknown' };
  }
  async reconcile(): Promise<SendOutcome> { return { status: 'unknown' }; }
}
